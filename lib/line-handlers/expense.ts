// lib/line-handlers/expense.ts
// I/O side of the LINE expense flow. All decisions live in the pure
// lib/line-expense-{parse,flow,messages}.ts. This file loads state, calls
// them, fetches the FX rate, saves and replies.
import { randomUUID } from "node:crypto";
import { listRows, updateRow, deleteRow, saveImage } from "@/lib/store";
import { fetchRate } from "@/lib/fx";
import { fetchLineDisplayName, fetchLineImageContent, matchMemberName } from "@/lib/line";
import { readFlowSession, writeFlowSession, deleteFlowSession } from "@/lib/line-session";
import { textMessage, type FlexNode } from "@/lib/line-flex";
import { selectPendingExpenses } from "@/lib/pending-expense";
import { expenseCommand, parseExpenseText, parseNumber } from "@/lib/line-expense-parse";
import {
  applyAnswer,
  attachPhoto,
  enterConflict,
  finalize,
  initialState,
  interpretAnswer,
  isFlowStep,
  needsRate,
  nextMissingStep,
  postbackToAnswer,
  stateFromExpense,
  withRate,
  type FlowData,
  type FlowEnv,
  type FlowState,
  type Outcome,
} from "@/lib/line-expense-flow";
import { MSG, savedCard, stepMessages } from "@/lib/line-expense-messages";
import type { Route } from "@/lib/line-router";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Expense, LineSession, Member, Trip } from "@/lib/models/types";

const say = (text: string): FlexNode => textMessage(text);

function sessionData(session: LineSession): FlowData {
  return (session.data && !Array.isArray(session.data) ? session.data : {}) as FlowData;
}

async function loadEnv(trip: Trip): Promise<FlowEnv> {
  const members = await listRows<Member>("members", trip.id);
  return { members: members.map((m) => m.name), tripCurrency: trip.trip_currency, homeCurrency: trip.home_currency };
}

async function loadState(session: LineSession, env: FlowEnv): Promise<FlowState | null> {
  const expense = (await listRows<Expense>("expenses", session.trip_id)).find((e) => e.id === session.expense_id);
  if (!expense) return null;
  const data = sessionData(session);
  // A row left over from the old photo flow (awaiting_name / awaiting_note)
  // just continues at whatever is still missing.
  const step = isFlowStep(session.step) ? session.step : nextMissingStep(expense, data, env.members);
  return { expense, step, data };
}

// The caller's live session and its expense. A session whose expense was
// deleted in the app is removed here (session set, st null = "gone").
async function current(ctx: HandlerCtx, env: FlowEnv): Promise<{ session: LineSession | null; st: FlowState | null }> {
  const session = await readFlowSession(ctx.userKey, ctx.now);
  if (!session) return { session: null, st: null };
  const st = await loadState(session, env);
  if (!st) await deleteFlowSession(ctx.userKey);
  return { session, st };
}

const memberMatch = (name: string | null, env: FlowEnv): string =>
  matchMemberName(name, env.members.map((n) => ({ name: n })));

async function withFreshRate(st: FlowState): Promise<FlowState> {
  if (!needsRate(st)) return st;
  try {
    return withRate(st, await fetchRate(st.expense.currency), false);
  } catch {
    return withRate(st, 1, true);
  }
}

async function settleAndAsk(ctx: HandlerCtx, st: FlowState, env: FlowEnv, lead: FlexNode[] = [], notice?: string): Promise<void> {
  const ready = finalize(await withFreshRate(st), env.members);
  await Promise.all([
    updateRow<Expense>("expenses", ready.expense.id, ready.expense),
    writeFlowSession(
      { id: ctx.userKey, trip_id: ready.expense.trip_id, expense_id: ready.expense.id, step: ready.step, data: ready.data as Record<string, unknown> },
      ctx.now,
    ),
  ]);
  await ctx.reply([...lead, ...stepMessages(ready, env, ctx.origin, notice)]);
}

async function startDraft(
  ctx: HandlerCtx,
  trip: Trip,
  env: FlowEnv,
  input: { text?: string; photoId?: string },
  lead: FlexNode[] = [],
): Promise<void> {
  const displayName = await fetchLineDisplayName(ctx.event.source, ctx.accessToken);
  const st = initialState(
    {
      id: randomUUID(),
      tripId: trip.id,
      now: ctx.now.toISOString(),
      tripCurrency: trip.trip_currency,
      parsed: parseExpenseText(input.text ?? ""),
      payer: memberMatch(displayName, env),
      photoId: input.photoId,
      asker: displayName ?? undefined,
    },
    env.members,
  );
  await settleAndAsk(ctx, st, env, lead);
}

async function runOutcome(ctx: HandlerCtx, st: FlowState, outcome: Outcome, trip: Trip, env: FlowEnv): Promise<void> {
  switch (outcome.k) {
    case "ask":
      return settleAndAsk(ctx, outcome.state, env, [], outcome.notice);
    case "confirm": {
      const done = finalize({ ...st, expense: outcome.expense }, env.members).expense;
      await Promise.all([updateRow<Expense>("expenses", done.id, done), deleteFlowSession(ctx.userKey)]);
      return ctx.reply([savedCard(done, st.data, ctx.origin)]);
    }
    case "delete":
      await Promise.all([deleteRow("expenses", st.expense.id), deleteFlowSession(ctx.userKey)]);
      return ctx.reply([say(MSG.deleted)]);
    case "keep":
      // Only the session goes. A confirmed expense's row is left exactly as it is.
      await deleteFlowSession(ctx.userKey);
      return ctx.reply([say(st.expense.pending ? MSG.kept : MSG.keptConfirmed)]);
    case "park":
      // The old expense stays pending; startDraft overwrites this user's session row.
      return startDraft(ctx, trip, env, { text: outcome.pendingText, photoId: outcome.pendingPhotoId }, [say(MSG.parked)]);
    case "drop":
      await deleteRow("expenses", st.expense.id);
      return startDraft(ctx, trip, env, { text: outcome.pendingText, photoId: outcome.pendingPhotoId }, [say(MSG.dropped)]);
  }
}

async function openExisting(ctx: HandlerCtx, trip: Trip, env: FlowEnv, cmd: "resume" | "edit_last"): Promise<void> {
  const { st } = await current(ctx, env);
  if (st && cmd === "resume") return settleAndAsk(ctx, st, env);
  const displayName = await fetchLineDisplayName(ctx.event.source, ctx.accessToken);
  const me = memberMatch(displayName, env);
  const all = await listRows<Expense>("expenses", trip.id);
  let target: Expense | undefined;
  if (cmd === "resume") {
    // My drafts first. Then drafts nobody has claimed yet (payer still
    // empty), which is where a draft started under an unmatched LINE name ends up.
    target = (me ? selectPendingExpenses(all.filter((e) => e.payer === me))[0] : undefined)
      ?? selectPendingExpenses(all.filter((e) => e.payer === ""))[0];
    if (!target) return ctx.reply([say(MSG.nothingPending)]);
  } else {
    if (!me) return ctx.reply([say(MSG.unknownMember)]);
    target = all.filter((e) => e.payer === me).sort((a, b) => b.datetime.localeCompare(a.datetime))[0];
    if (!target) return ctx.reply([say(MSG.noLatest)]);
  }
  return settleAndAsk(ctx, stateFromExpense(target, env.members, trip.trip_currency, displayName ?? undefined), env);
}

async function savePhoto(ctx: HandlerCtx, trip: Trip): Promise<string> {
  const { buf, mime } = await fetchLineImageContent(ctx.event.message!.id, ctx.accessToken);
  return saveImage(buf, mime, trip.name, "slips", `line-${ctx.now.getTime()}.jpg`);
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([say(MSG.noTrip)]);
  const env = await loadEnv(trip);
  const text = ctx.event.message?.text ?? "";

  switch (route.kind) {
    case "expense_new": {
      // Router decision 6: bare ทำต่อ / แก้ล่าสุด / ยกเลิก arrive here as text.
      const cmd = expenseCommand(route.text);
      if (cmd === "resume" || cmd === "edit_last") return openExisting(ctx, trip, env, cmd);
      if (cmd === "cancel" || cmd === "back") return ctx.reply([say(MSG.nothingPending)]);
      return startDraft(ctx, trip, env, { text: route.text });
    }
    case "flow_answer": {
      const { session, st } = await current(ctx, env);
      if (session && !st) return ctx.reply([say(MSG.goneExpense)]);
      if (!st) {
        // Session expired between routing and now: treat a number as a new entry.
        if (parseNumber(text) != null) return startDraft(ctx, trip, env, { text });
        return;
      }
      const ans = interpretAnswer(st.step, st.data, text, env.members, st.expense.amount > 0);
      if (!ans) return settleAndAsk(ctx, st, env, [], MSG.reask);
      return runOutcome(ctx, st, applyAnswer(st, ans, env), trip, env);
    }
    case "flow_conflict": {
      const { st } = await current(ctx, env);
      if (!st) return startDraft(ctx, trip, env, { text: route.text });
      return settleAndAsk(ctx, enterConflict(st, { text: route.text }), env);
    }
    case "flow_reask": {
      const { session, st } = await current(ctx, env);
      if (session && !st) return ctx.reply([say(MSG.goneExpense)]);
      if (!st) return;
      return settleAndAsk(ctx, st, env, [], MSG.reask);
    }
    default:
      return;
  }
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([say(MSG.noTrip)]);
  const ans = postbackToAnswer(data);
  if (!ans) return;
  const env = await loadEnv(trip);
  const { session, st } = await current(ctx, env);
  if (session && !st) return ctx.reply([say(MSG.goneExpense)]);
  if (st && st.expense.id === data.e && st.step === data.s) {
    return runOutcome(ctx, st, applyAnswer(st, ans, env), trip, env);
  }
  // Old button (different expense or step): never act on it.
  const exists = (await listRows<Expense>("expenses", trip.id)).some((e) => e.id === data.e);
  const lead = exists ? [] : [say(MSG.goneExpense)];
  if (st) return settleAndAsk(ctx, st, env, lead);
  return ctx.reply(lead.length > 0 ? lead : [say(MSG.expiredButton)]);
}

export async function handleImage(ctx: HandlerCtx): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([say(MSG.noTrip)]);
  const env = await loadEnv(trip);
  const { st } = await current(ctx, env);
  if (st && (st.step === "conflict" || st.step === "confirm_cancel")) return settleAndAsk(ctx, st, env, [], MSG.reask);
  const photoId = await savePhoto(ctx, trip);
  if (!st) return startDraft(ctx, trip, env, { photoId });
  if (st.expense.slip_photo_ids.length === 0) return settleAndAsk(ctx, attachPhoto(st, photoId), env, [say(MSG.photoAttached)]);
  return settleAndAsk(ctx, enterConflict(st, { photoId }), env);
}

export async function flowAnswerPredicate(ctx: HandlerCtx, session: LineSession): Promise<(text: string) => boolean> {
  const [members, expenses] = await Promise.all([
    ctx.trip ? listRows<Member>("members", ctx.trip.id).then((rows) => rows.map((m) => m.name)) : Promise.resolve([] as string[]),
    listRows<Expense>("expenses", session.trip_id),
  ]);
  const amountKnown = (expenses.find((e) => e.id === session.expense_id)?.amount ?? 0) > 0;
  const data = sessionData(session);
  const step = isFlowStep(session.step) ? session.step : "summary";
  return (text: string) => interpretAnswer(step, data, text, members, amountKnown) !== null;
}
