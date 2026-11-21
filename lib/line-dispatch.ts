import * as expense from "@/lib/line-handlers/expense";
import * as plan from "@/lib/line-handlers/plan";
import * as booking from "@/lib/line-handlers/booking";
import * as places from "@/lib/line-handlers/places";
import * as info from "@/lib/line-handlers/info";
import * as transport from "@/lib/line-handlers/transport";
import { readFlowSession } from "@/lib/line-session";
import { classifyText, commandRoute, type Route } from "@/lib/line-router";
import { decodePostback, textMessage } from "@/lib/line-flex";
import { buildMenuMessage, buildAmbiguityMessage, menuGoRoute, HINT_TEXT, NO_TRIP_TEXT } from "@/lib/line-menu";
import type { LineEvent } from "@/lib/line";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Trip } from "@/lib/models/types";

// One LINE event -> the feature handler that owns it. Features never touch
// this file; they only replace their own lib/line-handlers/<feature>.ts.
//
// The trip is loaded lazily: small talk, hints and the menu never touch the
// trips sheet. `withTrip()` loads it at most once per event.

export type BaseCtx = Omit<HandlerCtx, "trip">;
type WithTrip = () => Promise<HandlerCtx>;

// LINE omits userId for group/room members who haven't accepted the OA
// terms -- those still work (userKey falls back to a shared "unknown" key).
// Only an event with no source id at all is skipped.
export function isHandledEvent(e: LineEvent): boolean {
  const src = e.source;
  if (!src?.userId && !src?.groupId && !src?.roomId) return false;
  if (e.type === "postback") return !!e.postback?.data;
  return e.type === "message" && (e.message?.type === "text" || e.message?.type === "image");
}

// Spec signature: the trip is already known.
export async function dispatchEvent(ctx: HandlerCtx): Promise<void> {
  const { trip, ...base } = ctx;
  await dispatchEventWithTrip(base, async () => trip);
}

// Used by the webhook: loadTrip() runs only if the event needs the trip.
export async function dispatchEventWithTrip(base: BaseCtx, loadTrip: () => Promise<Trip | null>): Promise<void> {
  let full: Promise<HandlerCtx> | null = null;
  const withTrip: WithTrip = () => (full ??= loadTrip().then((trip) => ({ ...base, trip })));

  const { event } = base;
  if (event.type === "postback") {
    await dispatchPostback(base, withTrip, decodePostback(event.postback?.data ?? ""));
    return;
  }
  if (event.type !== "message") return;
  if (event.message?.type === "image") {
    const ctx = await withTrip();
    if (!ctx.trip) {
      await ctx.reply([textMessage(NO_TRIP_TEXT)]);
      return;
    }
    await expense.handleImage(ctx);
    return;
  }
  if (event.message?.type === "text") await dispatchText(base, withTrip, event.message.text ?? "");
}

async function dispatchText(base: BaseCtx, withTrip: WithTrip, text: string): Promise<void> {
  const session = await readFlowSession(base.userKey, base.now);
  // A pending flow belongs to a trip anyway, so loading it here is fine.
  const isFlowAnswer = session ? await expense.flowAnswerPredicate(await withTrip(), session) : () => false;
  // dateCtx null: the route doesn't depend on trip dates (see lib/line-router.ts),
  // which is what lets us classify before loading the trip.
  const route = classifyText(text, { flowStep: session?.step ?? null, isFlowAnswer, isGroup: base.isGroup, dateCtx: null });
  await routeTo(base, withTrip, route);
}

type AmbiguousTarget = "booking" | "places" | "transport";
function isAmbiguousTarget(t: string | undefined): t is AmbiguousTarget {
  return t === "booking" || t === "places" || t === "transport";
}

function postbackHandler(a: string): ((ctx: HandlerCtx, data: PostbackData) => Promise<void>) | null {
  if (a.startsWith("x_")) return expense.handlePostback;
  if (a.startsWith("plan_")) return plan.handlePostback;
  if (a.startsWith("bk_")) return booking.handlePostback;
  if (a.startsWith("pl_")) return places.handlePostback;
  if (a.startsWith("qi_") || a.startsWith("qn_")) return info.handlePostback;
  if (a.startsWith("tr_")) return transport.handlePostback;
  return null;
}

async function dispatchPostback(base: BaseCtx, withTrip: WithTrip, data: PostbackData): Promise<void> {
  const a = data.a ?? "";

  if (a === "menu") {
    await base.reply([buildMenuMessage()]);
    return;
  }
  if (a === "menu_go") {
    const route = menuGoRoute(data);
    if (route) await routeTo(base, withTrip, route);
    return;
  }
  if (a === "amb_expense") {
    const q = data.q ?? "";
    const session = await readFlowSession(base.userKey, base.now);
    await routeTo(base, withTrip, session ? { kind: "flow_conflict", text: q } : { kind: "expense_new", text: q });
    return;
  }
  if (a === "amb_go") {
    if (isAmbiguousTarget(data.t)) await routeTo(base, withTrip, commandRoute(data.t, data.q ?? ""));
    return;
  }

  const handler = postbackHandler(a);
  if (!handler) return;
  const ctx = await withTrip();
  if (!ctx.trip) {
    await ctx.reply([textMessage(NO_TRIP_TEXT)]);
    return;
  }
  await handler(ctx, data);
}

async function routeTo(base: BaseCtx, withTrip: WithTrip, route: Route): Promise<void> {
  // Routes that work without an active trip -- and never load it.
  if (route.kind === "menu") {
    await base.reply([buildMenuMessage()]);
    return;
  }
  if (route.kind === "hint") {
    await base.reply([textMessage(HINT_TEXT)]);
    return;
  }
  if (route.kind === "ignore") return;

  const ctx = await withTrip();
  if (!ctx.trip) {
    await ctx.reply([textMessage(NO_TRIP_TEXT)]);
    return;
  }

  switch (route.kind) {
    case "ambiguous":
      await ctx.reply([buildAmbiguityMessage(route.target, route.text)]);
      return;
    case "flow_answer":
    case "expense_new":
    case "flow_conflict":
    case "flow_reask":
      await expense.handleRoute(ctx, route);
      return;
    case "plan":
      await plan.handleRoute(ctx, route);
      return;
    case "booking":
      await booking.handleRoute(ctx, route);
      return;
    case "places":
      await places.handleRoute(ctx, route);
      return;
    case "info":
    case "notes":
      await info.handleRoute(ctx, route);
      return;
    case "transport":
      await transport.handleRoute(ctx, route);
      return;
  }
}
