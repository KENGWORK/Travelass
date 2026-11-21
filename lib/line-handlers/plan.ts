// lib/line-handlers/plan.ts
// LINE "แพลน" feature: I/O glue only -- parsing, selection and Flex layout
// live in lib/line-plan.ts and lib/line-plan-messages.ts.
import { listRows, updateRow } from "@/lib/store";
import { readCtx, writeCtx } from "@/lib/line-session";
import { nowHHMMInTz, tripDateCtx, addDays, thaiDateLabel, type TripDateCtx } from "@/lib/line-date";
import { textMessage, type FlexNode } from "@/lib/line-flex";
import { NO_TRIP_TEXT } from "@/lib/line-menu";
import type { Route } from "@/lib/line-router";
import type { Booking, DayPlan, ItineraryItem, Transport, Trip } from "@/lib/models/types";
import {
  parsePlanQuery,
  itemsForDay,
  plansForDay,
  activePlanFor,
  nextItemIndex,
  currentItemIndex,
  isDayFinished,
  inTrip,
  dayWindow,
  resolveIndexDate,
  neighbors,
} from "@/lib/line-plan";
import {
  buildPlanOverview,
  buildPlanDetail,
  buildDayPicker,
  buildAltPicker,
  albumMessage,
  tripRangeText,
  MAIN_PLAN_NAME,
} from "@/lib/line-plan-messages";
import type { HandlerCtx, PostbackData } from "./types";

// readCtx/writeCtx append "#ctx" themselves, so the view-context row is
// {userKey}#ctx and never collides with the expense flow session {userKey}.
const ctxKey = (ctx: HandlerCtx): string => ctx.userKey;

interface Loaded {
  trip: Trip;
  items: ItineraryItem[];
  dayPlans: DayPlan[];
  today: string;
  now: string;
  dateCtx: TripDateCtx;
}

async function load(trip: Trip, now: Date): Promise<Loaded> {
  const [items, dayPlans] = await Promise.all([
    listRows<ItineraryItem>("itinerary", trip.id),
    listRows<DayPlan>("day_plans", trip.id),
  ]);
  const dateCtx = tripDateCtx(trip, now);
  return { trip, items, dayPlans, today: dateCtx.today, now: nowHHMMInTz(trip.trip_timezone, now), dateCtx };
}

const within = (L: Loaded, date: string): boolean => inTrip(date, L.trip.start_date, L.trip.end_date);
const appUrl = (ctx: HandlerCtx, L: Loaded, date: string): string => `${ctx.origin}/trips/${L.trip.id}/itinerary?day=${date}`;

// Remembers the day *and* plan the person last looked at, so `แพลน n` / `#n`
// numbers items exactly like the card they last saw. Called only after the
// reply went out, and never throws: a Sheets hiccup must not cost the answer.
async function remember(ctx: HandlerCtx, L: Loaded, date: string, planId: string | undefined): Promise<void> {
  try {
    await writeCtx(ctxKey(ctx), L.trip.id, { lastPlanDate: date, lastPlanId: planId ?? "" }, ctx.now);
  } catch (err) {
    console.error("LINE plan: writeCtx failed", err);
  }
}

async function recall(ctx: HandlerCtx): Promise<Record<string, unknown>> {
  try {
    return await readCtx(ctxKey(ctx));
  } catch (err) {
    console.error("LINE plan: readCtx failed", err);
    return {};
  }
}

// planId if it names a non-active (alt) plan of that day, else undefined (= main view).
function altPlanId(L: Loaded, date: string, planId: string | undefined): string | undefined {
  if (!planId) return undefined;
  const p = plansForDay(L.dayPlans, date).find((x) => x.id === planId);
  return p && !p.is_active ? p.id : undefined;
}

function overviewMessage(ctx: HandlerCtx, L: Loaded, date: string, planId: string | undefined, page: number): FlexNode {
  const plans = plansForDay(L.dayPlans, date);
  const altId = altPlanId(L, date, planId);
  const shown = (altId ? plans.find((p) => p.id === altId) : undefined) ?? activePlanFor(L.dayPlans, date);
  const items = itemsForDay(L.items, L.dayPlans, date, altId);
  // The "ต่อไป" highlight and the finished banner describe the plan actually
  // being followed today -- never an alternate someone is just browsing.
  const live = date === L.today && altId === undefined;
  return buildPlanOverview({
    appUrl: appUrl(ctx, L, date),
    date,
    start: L.trip.start_date,
    end: L.trip.end_date,
    planId: altId ?? null,
    planName: shown?.name || MAIN_PLAN_NAME,
    isAlt: altId !== undefined,
    otherPlans: plans.filter((p) => p.id !== shown?.id).map((p) => ({ id: p.id, name: p.name })),
    items,
    nextIndex: live ? nextItemIndex(items, L.now) : null,
    finished: live && isDayFinished(items, L.now),
    page,
  });
}

// The alt plan an item belongs to (undefined when it is on the main plan).
function itemAltId(L: Loaded, item: ItineraryItem): string | undefined {
  return altPlanId(L, item.day_date, item.plan_id || undefined);
}

async function detailMessage(ctx: HandlerCtx, L: Loaded, item: ItineraryItem): Promise<FlexNode> {
  const siblings = itemsForDay(L.items, L.dayPlans, item.day_date, item.plan_id);
  const { index, prevId, nextId } = neighbors(siblings, item.id);
  const [transports, bookings] = await Promise.all([
    item.linked_transport_id ? listRows<Transport>("transports", L.trip.id) : Promise.resolve<Transport[]>([]),
    item.linked_booking_id ? listRows<Booking>("bookings", L.trip.id) : Promise.resolve<Booking[]>([]),
  ]);
  return buildPlanDetail({
    origin: ctx.origin,
    item,
    index,
    prevId,
    nextId,
    overviewPlanId: itemAltId(L, item),
    transport: transports.find((t) => t.id === item.linked_transport_id) ?? null,
    booking: bookings.find((b) => b.id === item.linked_booking_id) ?? null,
  });
}

function outOfRangeMessage(L: Loaded): FlexNode {
  const { start_date: start, end_date: end } = L.trip;
  return buildDayPicker(tripRangeText(start, end), dayWindow(start, end, L.today, 13), start, "plan_overview");
}

function badDateMessage(L: Loaded): FlexNode {
  const { start_date: start, end_date: end } = L.trip;
  const lead = [
    { label: "วันนี้", date: L.today },
    { label: "พรุ่งนี้", date: addDays(L.today, 1) },
  ].filter((l) => within(L, l.date));
  return buildDayPicker("ไม่เข้าใจวันที่", dayWindow(start, end, L.today, 13 - lead.length), start, "plan_overview", lead);
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "plan") return;
  if (!ctx.trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const L = await load(ctx.trip, ctx.now);
  const q = parsePlanQuery(route.rest, L.dateCtx);

  if (q.kind === "out_of_range") return ctx.reply([outOfRangeMessage(L)]);
  if (q.kind === "bad_date") return ctx.reply([badDateMessage(L)]);

  if (q.kind === "overview") {
    const date = q.date ?? L.today;
    if (!within(L, date)) return ctx.reply([outOfRangeMessage(L)]);
    await ctx.reply([overviewMessage(ctx, L, date, undefined, 1)]);
    return remember(ctx, L, date, undefined);
  }

  if (q.kind === "detail") {
    const saved = q.date ? {} : await recall(ctx);
    const lastDate = typeof saved.lastPlanDate === "string" ? saved.lastPlanDate : null;
    const date = resolveIndexDate(q.date, lastDate, L.today, L.trip.start_date, L.trip.end_date);
    if (!within(L, date)) return ctx.reply([outOfRangeMessage(L)]);
    // Number items like the card last shown: its alt plan only if that card was one.
    const planId =
      !q.date && date === lastDate && typeof saved.lastPlanId === "string" ? altPlanId(L, date, saved.lastPlanId) : undefined;
    const items = itemsForDay(L.items, L.dayPlans, date, planId);
    if (q.index > items.length) {
      const overview = overviewMessage(ctx, L, date, planId, 1);
      if (items.length === 0) {
        await ctx.reply([overview]);
      } else {
        const head = date === L.today ? "วันนี้" : `${thaiDateLabel(date)} `;
        await ctx.reply([textMessage(`${head}มี ${items.length} รายการ`), overview]);
      }
      return remember(ctx, L, date, planId);
    }
    await ctx.reply([await detailMessage(ctx, L, items[q.index - 1])]);
    return remember(ctx, L, date, planId);
  }

  // next / now are always about today's main plan.
  if (!within(L, L.today)) return ctx.reply([outOfRangeMessage(L)]);
  const items = itemsForDay(L.items, L.dayPlans, L.today);
  const idx =
    q.kind === "now" ? (currentItemIndex(items, L.now) ?? nextItemIndex(items, L.now)) : nextItemIndex(items, L.now);
  if (idx === null) {
    await ctx.reply([
      textMessage(items.length > 0 ? "วันนี้ไม่มีรายการถัดไปแล้ว" : "วันนี้ยังไม่มีแพลน"),
      overviewMessage(ctx, L, L.today, undefined, 1),
    ]);
  } else {
    await ctx.reply([await detailMessage(ctx, L, items[idx])]);
  }
  return remember(ctx, L, L.today, undefined);
}

const ITEM_ACTIONS = new Set(["plan_detail", "plan_photos", "plan_note", "plan_done", "plan_undone"]);

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  if (!ctx.trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const L = await load(ctx.trip, ctx.now);
  const dayOr = (d: string | undefined): string => (d && within(L, d) ? d : L.today);

  if (data.a === "plan_overview") {
    const date = dayOr(data.d);
    const planId = altPlanId(L, date, data.p || undefined);
    await ctx.reply([overviewMessage(ctx, L, date, planId, Math.max(1, Number(data.n) || 1))]);
    return remember(ctx, L, date, planId);
  }
  if (data.a === "plan_alt") {
    const date = dayOr(data.d);
    return ctx.reply([buildAltPicker(date, plansForDay(L.dayPlans, date))]);
  }
  if (!ITEM_ACTIONS.has(data.a)) return;

  // L was just loaded from the store, so this is the row's *current* state.
  const item = L.items.find((it) => it.id === data.i);
  if (!item) {
    return ctx.reply([textMessage("รายการนี้ถูกลบไปแล้ว"), overviewMessage(ctx, L, dayOr(data.d), undefined, 1)]);
  }

  switch (data.a) {
    case "plan_detail":
      await ctx.reply([await detailMessage(ctx, L, item)]);
      return remember(ctx, L, item.day_date, itemAltId(L, item));
    case "plan_photos":
      if (item.photo_ids.length === 0) return ctx.reply([await detailMessage(ctx, L, item)]);
      return ctx.reply([
        albumMessage({ origin: ctx.origin, photoIds: item.photo_ids, title: item.title, moreUrl: appUrl(ctx, L, item.day_date) }),
      ]);
    case "plan_note":
      return ctx.reply([textMessage((item.notes || "ไม่มีโน้ต").slice(0, 5000))]);
    default: {
      // plan_done / plan_undone: only planned <-> done, and only when the row
      // still has the status the button was drawn for -- someone else may have
      // tapped first, or it was skipped/moved in the app meanwhile. Otherwise
      // just show the card as it is now.
      const from = data.a === "plan_done" ? "planned" : "done";
      const to = data.a === "plan_done" ? "done" : "planned";
      if (item.status !== from) return ctx.reply([await detailMessage(ctx, L, item)]);
      const updated: ItineraryItem = { ...item, status: to };
      await updateRow<ItineraryItem>("itinerary", item.id, updated);
      return ctx.reply([await detailMessage(ctx, L, updated)]);
    }
  }
}
