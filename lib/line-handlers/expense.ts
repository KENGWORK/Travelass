// lib/line-handlers/expense.ts
// I/O side of the LINE expense flow. All decisions live in the pure
// lib/line-expense-{parse,flow,answers,messages}.ts. This file loads state,
// calls them, fetches the FX rate, saves and replies.
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
  needsRate,
  normalizeStep,
  settle,
  stateFromExpense,
  withRate,
  type Answer,
  type FlowData,
  type FlowEnv,
  type FlowState,
  type Outcome,
} from "@/lib/line-expense-flow";
import { extractAtMember, interpretAnswer, postbackToAnswer } from "@/lib/line-expense-answers";
import { MSG, reaskFor, savedCard, stepMessages, type CardCtx } from "@/lib/line-expense-messages";
import type { Route } from "@/lib/line-router";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Expense, LineSession, Member, Trip } from "@/lib/models/types";

const say = (text: string): FlexNode => textMessage(text);

function sessionData(session: LineSession): FlowData {
  return (session.data && !Array.isArray(session.data) ? session.data : {}) as FlowData;
}

const cardCtx = (ctx: HandlerCtx, trip: Trip): CardCtx => ({ origin: ctx.origin, tripName: trip.name });

async function loadEnv(trip: Trip): Promise<FlowEnv> {
  const members = await listRows<Member>("members", trip.id);
  return { members: members.map((m) => m.name), tripCurrency: trip.trip_currency, homeCurrency: trip.home_currency };
}

async function loadState(session: LineSession): Promise<FlowState | null> {
  const expense = (await listRows<Expense>("expenses", session.trip_id)).find((e) => e.id === session.expense_id);
  if (!expense) return null;
  // A row left over from the old one-question flow just continues on the new steps.
  return { expense, step: normalizeStep(session.step, expense.pending), data: sessionData(session) };
}

// The caller's live session and its expense. A session whose expense was
// deleted in the app is removed here (session set, st null = "gone").
async function current(ctx: HandlerCtx): Promise<{ session: LineSession | null; st: FlowState | null }> {
  const session = await readFlowSession(ctx.userKey, ctx.now);
  if (!session) return { session: null, st: null };
  const st = await loadState(session);
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

// Writes the (still incomplete, or being edited) state and sends the next card / question.
async function show(ctx: HandlerCtx, trip: Trip, st: FlowState, env: FlowEnv, lead: FlexNode[] = [], notice?: string): Promise<void> {
  // Opening the edit picker / delete prompt of a saved expense changes nothing yet:
  // leave the row byte-identical (no finalize, no rate fetch, no updateRow).
  const untouched = !st.expense.pending && (st.step === "edit" || st.step === "confirm_cancel" || st.step === "conflict");
  const ready = untouched ? st : finalize(await withFreshRate(st), env.members);
  await Promise.all([
    untouched ? Promise.resolve() : updateRow<Expense>("expenses", ready.expense.id, ready.expense),
    writeFlowSession(
      { id: ctx.userKey, trip_id: ready.expense.trip_id, expense_id: ready.expense.id, step: ready.step, data: ready.data as Record<string, unknown> },
      ctx.now,
    ),
  ]);
  await ctx.reply([...lead, ...stepMessages(ready, env, cardCtx(ctx, trip), notice)]);
}

// Everything is known: fetch the rate if needed, write the final row, drop the
// session and send the saved card. Also the path of a one-line complete entry.
// `st` is the state AFTER the answer (outcome.state): finalize, the rate fetch
// and the saved card all use its data (splitMode, owedAmount, currencyConfirmed...).
async function saveDone(ctx: HandlerCtx, trip: Trip, st: FlowState, env: FlowEnv, lead: FlexNode[] = []): Promise<void> {
  const ready = finalize(await withFreshRate(st), env.members);
  await Promise.all([updateRow<Expense>("expenses", ready.expense.id, ready.expense), deleteFlowSession(ctx.userKey)]);
  await ctx.reply([...lead, savedCard(ready.expense, ready.data, ctx.origin, trip.name)]);
}

// Re-shows the current state of a session. A draft on the card that turns out
// complete is saved instead of showing "0 left".
async function reopen(ctx: HandlerCtx, trip: Trip, st: FlowState, env: FlowEnv, lead: FlexNode[] = [], notice?: string): Promise<void> {
  if (st.step === "missing") return runOutcome(ctx, trip, st, settle(st, env.members, notice), env, lead);
  return show(ctx, trip, st, env, lead, notice);
}

async function startDraft(
  ctx: HandlerCtx,
  trip: Trip,
  env: FlowEnv,
  input: { text?: string; photoId?: string },
  lead: FlexNode[] = [],
): Promise<void> {
  const displayName = await fetchLineDisplayName(ctx.event.source, ctx.accessToken);
  // "@เก่ง" in the first message names the payer (over the LINE-name match) and is not part of the note.
  const at = extractAtMember(input.text ?? "", env.members);
  const st = initialState({
    id: randomUUID(),
    tripId: trip.id,
    now: ctx.now.toISOString(),
    tripCurrency: trip.trip_currency,
    parsed: parseExpenseText(at?.text ?? input.text ?? ""),
    payer: at?.payer ?? memberMatch(displayName, env),
    photoId: input.photoId,
    asker: displayName ?? undefined,
  });
  await runOutcome(ctx, trip, st, settle(st, env.members), env, lead);
}

async function runOutcome(ctx: HandlerCtx, trip: Trip, st: FlowState, outcome: Outcome, env: FlowEnv, lead: FlexNode[] = []): Promise<void> {
  switch (outcome.k) {
    case "ask":
      return show(ctx, trip, outcome.state, env, lead, outcome.notice);
    case "saved":
      return saveDone(ctx, trip, outcome.state, env, lead);
    case "delete":
      await Promise.all([deleteRow("expenses", st.expense.id), deleteFlowSession(ctx.userKey)]);
      return ctx.reply([say(MSG.deleted)]);
    case "keep":
      // Only the session goes. A confirmed expense's row is left exactly as it is.
      await deleteFlowSession(ctx.userKey);
      return ctx.reply([say(st.expense.pending ? MSG.kept : MSG.keptConfirmed)]);
    case "park":
      // The old expense stays as it is; startDraft overwrites this user's session row.
      return startDraft(ctx, trip, env, { text: outcome.pendingText, photoId: outcome.pendingPhotoId }, [say(MSG.parked)]);
    case "drop":
      // Never delete a SAVED expense that was only being edited.
      if (st.expense.pending) await deleteRow("expenses", st.expense.id);
      return startDraft(ctx, trip, env, { text: outcome.pendingText, photoId: outcome.pendingPhotoId }, [say(st.expense.pending ? MSG.dropped : MSG.droppedEdit)]);
  }
}

async function openExisting(ctx: HandlerCtx, trip: Trip, env: FlowEnv, cmd: "resume" | "edit_last"): Promise<void> {
  const { st } = await current(ctx);
  if (st && cmd === "resume") return reopen(ctx, trip, st, env);
  const displayName = await fetchLineDisplayName(ctx.event.source, ctx.accessToken);
  const me = memberMatch(displayName, env);
  const all = await listRows<Expense>("expenses", trip.id);
  if (cmd === "resume") {
    // My drafts first. Then drafts nobody has claimed yet (payer still
    // empty), which is where a draft started under an unmatched LINE name ends up.
    const target = (me ? selectPendingExpenses(all.filter((e) => e.payer === me))[0] : undefined)
      ?? selectPendingExpenses(all.filter((e) => e.payer === ""))[0];
    if (!target) return ctx.reply([say(MSG.nothingPending)]);
    const fresh = stateFromExpense(target, trip.trip_currency, displayName ?? undefined);
    return runOutcome(ctx, trip, fresh, settle(fresh, env.members), env);
  }
  // แก้ล่าสุด: the saved card of my newest saved expense. No session until ✏️ แก้ is tapped.
  if (!me) return ctx.reply([say(MSG.unknownMember)]);
  const target = all.filter((e) => e.payer === me && !e.pending).sort((a, b) => b.datetime.localeCompare(a.datetime))[0];
  if (!target) return ctx.reply([say(MSG.noLatest)]);
  const fresh = stateFromExpense(target, trip.trip_currency, displayName ?? undefined);
  return ctx.reply([savedCard(target, fresh.data, ctx.origin, trip.name)]);
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
      const { session, st } = await current(ctx);
      if (session && !st) return ctx.reply([say(MSG.goneExpense)]);
      if (!st) {
        // Session expired between routing and now: treat a number as a new entry.
        if (parseNumber(text) != null) return startDraft(ctx, trip, env, { text });
        return;
      }
      const ans = interpretAnswer(st, text, env.members);
      if (!ans) return reopen(ctx, trip, st, env, [], reaskFor(st.step));
      return runOutcome(ctx, trip, st, applyAnswer(st, ans, env), env);
    }
    case "flow_conflict": {
      const { st } = await current(ctx);
      if (!st) return startDraft(ctx, trip, env, { text: route.text });
      return show(ctx, trip, enterConflict(st, { text: route.text }), env);
    }
    case "flow_reask": {
      const { session, st } = await current(ctx);
      if (session && !st) return ctx.reply([say(MSG.goneExpense)]);
      if (!st) return;
      return reopen(ctx, trip, st, env, [], reaskFor(st.step));
    }
    default:
      return;
  }
}

// ✏️ แก้ / 🗑 ลบ on a saved card. That card has no session behind it, so the
// buttons carry only the expense id; the state is rebuilt from the row.
async function handleSavedAction(ctx: HandlerCtx, trip: Trip, env: FlowEnv, data: PostbackData): Promise<void> {
  const expense = (await listRows<Expense>("expenses", trip.id)).find((e) => e.id === data.e);
  if (!expense) return ctx.reply([say(MSG.goneExpense)]);
  if (expense.pending) return ctx.reply([say(MSG.expiredButton)]);
  const { st: liveSt } = await current(ctx);
  // Never overwrite a live flow of another expense.
  if (liveSt && liveSt.expense.id !== expense.id) return reopen(ctx, trip, liveSt, env, [], MSG.busy);
  const displayName = await fetchLineDisplayName(ctx.event.source, ctx.accessToken);
  const base = liveSt ?? stateFromExpense(expense, trip.trip_currency, displayName ?? undefined);
  const ans: Answer = data.a === "x_edit" ? { k: "edit" } : { k: "ask_delete" };
  return runOutcome(ctx, trip, base, applyAnswer(base, ans, env), env);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([say(MSG.noTrip)]);
  const env = await loadEnv(trip);
  if (data.a === "x_edit" || data.a === "x_del") return handleSavedAction(ctx, trip, env, data);
  const ans = postbackToAnswer(data);
  // Buttons of the removed one-question flow land here too.
  if (!ans) return ctx.reply([say(MSG.expiredButton)]);
  const { session, st } = await current(ctx);
  if (session && !st) return ctx.reply([say(MSG.goneExpense)]);
  if (st && st.expense.id === data.e && String(st.data.rev ?? 0) === data.v) {
    return runOutcome(ctx, trip, st, applyAnswer(st, ans, env), env);
  }
  // Old button (another expense, or an older card): never act on it.
  const found = (await listRows<Expense>("expenses", trip.id)).find((e) => e.id === data.e);
  const lead = found ? [] : [say(MSG.goneExpense)];
  if (st) return reopen(ctx, trip, st, env, lead, MSG.staleButton);
  if (!found) return ctx.reply(lead);
  // A saved expense has no session any more: a late tap on its old card is just stale
  // (no "type ทำต่อ", there is nothing to resume).
  return ctx.reply([say(found.pending ? MSG.expiredButton : MSG.staleButton)]);
}

export async function handleImage(ctx: HandlerCtx): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([say(MSG.noTrip)]);
  const env = await loadEnv(trip);
  const { st } = await current(ctx);
  if (st && (st.step === "conflict" || st.step === "confirm_cancel")) return show(ctx, trip, st, env, [], MSG.reaskPrompt);
  const photoId = await savePhoto(ctx, trip);
  if (!st) return startDraft(ctx, trip, env, { photoId });
  if (st.expense.slip_photo_ids.length === 0) return show(ctx, trip, attachPhoto(st, photoId), env, [say(MSG.photoAttached)]);
  return show(ctx, trip, enterConflict(st, { photoId }), env);
}

export async function flowAnswerPredicate(ctx: HandlerCtx, session: LineSession): Promise<(text: string) => boolean> {
  const [members, expenses] = await Promise.all([
    ctx.trip ? listRows<Member>("members", ctx.trip.id).then((rows) => rows.map((m) => m.name)) : Promise.resolve([] as string[]),
    listRows<Expense>("expenses", session.trip_id),
  ]);
  const expense = expenses.find((e) => e.id === session.expense_id);
  if (!expense) return () => false;
  const st = { expense, step: normalizeStep(session.step, expense.pending), data: sessionData(session) };
  return (text: string) => interpretAnswer(st, text, members) !== null;
}
