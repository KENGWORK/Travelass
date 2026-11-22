// lib/line-expense-flow.ts
import type { Category, Expense, ExpenseSplit } from "@/lib/models/types";
import { convertToTHB, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { buildPendingExpense } from "@/lib/pending-expense";
import { guessCategory, removeNumberToken, type ParsedExpense, type SplitMode } from "@/lib/line-expense-parse";

export type { SplitMode } from "@/lib/line-expense-parse";

// "missing" = a draft showing the one card. The per-field steps exist only for
// editing a SAVED expense ("edit" = which field?), plus the two prompts.
export type FlowStep =
  | "missing" | "edit"
  | "amount" | "currency" | "payer" | "split" | "partner" | "owed" | "category" | "note"
  | "confirm_cancel" | "conflict";

const FLOW_STEPS: readonly string[] = [
  "missing", "edit", "amount", "currency", "payer", "split", "partner", "owed", "category", "note", "confirm_cancel", "conflict",
];

export function isFlowStep(s: string): s is FlowStep {
  return FLOW_STEPS.includes(s);
}

// Rows written by the old one-question flow ("summary", or "payer" on a draft…)
// are mapped onto the new steps: drafts always sit on the card.
export function normalizeStep(raw: string, pending: boolean): FlowStep {
  if (raw === "confirm_cancel" || raw === "conflict") return raw;
  if (pending) return "missing";
  return isFlowStep(raw) && raw !== "missing" ? raw : "edit";
}

// The fields the one-card flow collects, in card order. Every name is also a
// FlowStep (an edit of a saved expense asks one field at a time).
export type Field = "amount" | "currency" | "payer" | "split" | "partner" | "owed";
export type EditField = "amount" | "currency" | "payer" | "split" | "category" | "note";

// Everything one typed message / one button can say. seedNote only fills an
// empty note (words typed beside a first amount); note replaces it.
export interface Bundle {
  amount?: number;
  currency?: string;
  payer?: string;
  split?: SplitMode;
  partner?: string;
  owed?: number;
  category?: Category;
  note?: string;
  seedNote?: string;
}

// State that lives in LineSession.data while the expense row carries the
// rest. currencyConfirmed exists because buildPendingExpense always fills in
// trip_currency, so the row alone can't tell "chosen" from "default".
export interface FlowData {
  asker?: string;                 // LINE display name, for the "@name" prefix
  amountCandidates?: number[];
  currencyConfirmed?: boolean;
  rateCurrency?: string;          // currency fx_rate was fetched for
  fxFailed?: boolean;
  rev?: number;                   // bumps on every data change; buttons carry it
  splitMode?: SplitMode;
  lockedSplits?: boolean;         // splits shared by >1 person (made in the app); left alone
  partner?: string;               // the other member, when the trip doesn't have exactly 2
  owedAmount?: number;            // หารไม่เท่า, in the expense's own currency
  owedZero?: boolean;             // user typed 0 → asking "change to ไม่หาร?"
  resumeStep?: FlowStep;          // where confirm_cancel / conflict return to
  pendingText?: string;           // conflict: the new text waiting to start
  pendingPhotoId?: string;        // conflict: the new photo waiting to start
}

export interface FlowState { expense: Expense; step: FlowStep; data: FlowData; }
export interface FlowEnv { members: string[]; tripCurrency: string; homeCurrency: string; }

export const round2 = (n: number): number => Math.round(n * 100) / 100;
// Round to 4 places first so 270.005 (stored as 270.00499...) still rounds up to 270.01.
export const ceil2 = (n: number): number => Math.ceil(Math.round(n * 10000) / 100) / 100;
export const fmtNum = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function otherMembers(payer: string, members: string[]): string[] {
  return members.filter((m) => m !== payer);
}

export function partnerFor(payer: string, data: FlowData, members: string[]): string | undefined {
  const others = otherMembers(payer, members);
  if (data.partner && others.includes(data.partner)) return data.partner;
  return others.length === 1 ? others[0] : undefined;
}

export type OwedCheck = "zero" | "over" | "ok";

export function validateOwed(owed: number, amount: number): OwedCheck {
  if (owed <= 0) return "zero";
  if (owed > amount) return "over";
  return "ok";
}

// Only the other person's share is stored. The payer's share is the
// remainder, as in lib/settle.ts. An equal split rounds the other person's
// half up, so any rounding loss lands on the payer
// (docs/superpowers/specs/2026-08-05-expense-splitting-design.md).
export function buildSplits(mode: SplitMode, amountThb: number, owedThb: number, partner: string): ExpenseSplit[] {
  if (mode === "none") return [];
  const amount_thb = mode === "equal" ? ceil2(amountThb / 2) : owedThb;
  return [{ name: partner, amount_thb, paid: false, paid_slip_photo_ids: [] }];
}

// What the card still has to ask. members.length === 0 → the payer cannot be
// chosen, so it is not asked. Owed counts as missing while it is absent or
// invalid for the CURRENT amount (so it also stays missing while the amount is unknown).
export function missingFields(expense: Expense, data: FlowData, members: string[]): Field[] {
  const out: Field[] = [];
  if (!(expense.amount > 0)) out.push("amount");
  if (!data.currencyConfirmed) out.push("currency");
  if (!expense.payer && members.length > 0) out.push("payer");
  if (data.lockedSplits) return out;
  if (!data.splitMode) {
    out.push("split");
    return out;
  }
  if (data.splitMode !== "none" && expense.payer && !partnerFor(expense.payer, data, members)) out.push("partner");
  if (data.splitMode === "unequal" && (data.owedAmount == null || validateOwed(data.owedAmount, expense.amount) !== "ok")) out.push("owed");
  return out;
}

export function initialState(p: {
  id: string; tripId: string; now: string; tripCurrency: string; parsed: ParsedExpense; payer: string; photoId?: string; asker?: string;
}): FlowState {
  const base = buildPendingExpense({
    id: p.id,
    tripId: p.tripId,
    photoId: p.photoId ?? "",
    currency: p.parsed.currency ?? p.tripCurrency,
    now: p.now,
    description: p.parsed.note,
    payer: p.payer,
  });
  const expense: Expense = {
    ...base,
    slip_photo_ids: p.photoId ? [p.photoId] : [],
    category: p.parsed.category,
    amount: p.parsed.amount ?? 0,
  };
  const data: FlowData = { rev: 1 };
  if (p.asker) data.asker = p.asker;
  if (p.parsed.amountCandidates.length > 0) data.amountCandidates = p.parsed.amountCandidates;
  if (p.parsed.currency) data.currencyConfirmed = true;
  if (p.parsed.split) {
    data.splitMode = p.parsed.split.mode;
    const owed = p.parsed.split.owedAmount;
    if (owed != null) {
      if (owed > 0) data.owedAmount = owed;
      else data.owedZero = true;
    }
  }
  return { expense, step: "missing", data };
}

// Rebuilds session state for an expense that already exists (ทำต่อ / ✏️ แก้).
// A confirmed expense is trusted as complete and opens at the edit picker. A
// pending draft only trusts what the row can prove: the currency counts as
// chosen when the row shows a sign of it (currency ≠ trip default, a fetched
// rate ≠ 1, or amount_thb > 0). finalize only fills amount_thb once the
// currency is confirmed. rev starts at 1: a stale card of the same expense
// with rev 1 is harmless because it asks the same question.
export function stateFromExpense(expense: Expense, tripCurrency: string, asker?: string): FlowState {
  const data: FlowData = { rev: 1 };
  if (asker) data.asker = asker;
  const confirmed = !expense.pending;
  const currencyShown = expense.currency !== tripCurrency || expense.fx_rate !== 1 || expense.amount_thb > 0;
  if (confirmed || (expense.amount > 0 && currencyShown)) {
    data.currencyConfirmed = true;
    // A rate of 1 for a non-THB currency may be the failed-fetch fallback, so fetch again.
    if (confirmed || expense.fx_rate !== 1 || expense.currency === "THB") data.rateCurrency = expense.currency;
  }
  if (confirmed || expense.splits.length > 0) {
    if (expense.splits.length === 0) data.splitMode = "none";
    else if (expense.splits.length > 1) data.lockedSplits = true;
    else {
      const s = expense.splits[0];
      data.partner = s.name;
      if (s.amount_thb === ceil2(expense.amount_thb / 2)) data.splitMode = "equal";
      else {
        data.splitMode = "unequal";
        data.owedAmount = round2(s.amount_thb / (expense.fx_rate || 1));
      }
    }
  }
  return { expense, step: confirmed ? "edit" : "missing", data };
}

export function needsRate(st: FlowState): boolean {
  return st.expense.amount > 0 && !!st.data.currencyConfirmed && st.data.rateCurrency !== st.expense.currency;
}

export function withRate(st: FlowState, rate: number, failed: boolean): FlowState {
  return {
    ...st,
    expense: { ...st.expense, fx_rate: rate },
    data: { ...st.data, rateCurrency: st.expense.currency, fxFailed: failed },
  };
}

// Recomputes the derived fields (amount_thb, splits) from what is known so far.
// amount_thb stays 0 until the currency is confirmed, so a parked draft's row
// shows whether the currency was chosen (see stateFromExpense).
// A rebuilt split for the same person keeps paid / paid_slip_photo_ids, so
// editing a settled expense from LINE never un-pays it.
export function finalize(st: FlowState, members: string[]): FlowState {
  const e = st.expense;
  const d = st.data;
  const amount_thb = e.amount > 0 && d.currencyConfirmed ? convertToTHB(e.amount, e.fx_rate) : 0;
  let splits = e.splits;
  if (!d.lockedSplits && d.splitMode) {
    const partner = partnerFor(e.payer, d, members);
    if (d.splitMode === "none") splits = [];
    else if (partner && (d.splitMode === "equal" || (d.owedAmount != null && validateOwed(d.owedAmount, e.amount) === "ok"))) {
      const owedThb = d.owedAmount != null ? convertToTHB(d.owedAmount, e.fx_rate) : 0;
      splits = buildSplits(d.splitMode, amount_thb, owedThb, partner).map((n) => {
        const prev = e.splits.find((p) => p.name === n.name);
        return prev ? { ...n, paid: prev.paid, paid_slip_photo_ids: prev.paid_slip_photo_ids } : n;
      });
    }
  }
  return { ...st, expense: { ...e, amount_thb, splits } };
}

const nextRev = (d: FlowData): number => (d.rev ?? 0) + 1;

export function enterConflict(st: FlowState, p: { text?: string; photoId?: string }): FlowState {
  const inPrompt = st.step === "conflict" || st.step === "confirm_cancel";
  return {
    ...st,
    step: "conflict",
    data: { ...st.data, rev: nextRev(st.data), resumeStep: inPrompt ? st.data.resumeStep : st.step, pendingText: p.text, pendingPhotoId: p.photoId },
  };
}

export function attachPhoto(st: FlowState, photoId: string): FlowState {
  return { ...st, expense: { ...st.expense, slip_photo_ids: [photoId] }, data: { ...st.data, rev: nextRev(st.data) } };
}

// ---------------------------------------------------------------------------
// Answers and the reducer
// ---------------------------------------------------------------------------

export type Answer =
  | { k: "cancel" } | { k: "resume" }
  | { k: "set"; bundle: Bundle }
  | { k: "clear"; field: Field }
  | { k: "owed_none" } | { k: "owed_retry" }
  | { k: "edit" } | { k: "editfield"; field: EditField }
  | { k: "ask_delete" }
  | { k: "cancel_delete" } | { k: "cancel_keep" }
  | { k: "conflict_resume" } | { k: "conflict_park" } | { k: "conflict_drop" };

export type Outcome =
  | { k: "ask"; state: FlowState; notice?: string }
  | { k: "saved"; state: FlowState }   // post-answer state, expense.pending already false
  | { k: "delete" }
  | { k: "keep" }
  | { k: "park"; pendingText?: string; pendingPhotoId?: string }
  | { k: "drop"; pendingText?: string; pendingPhotoId?: string };

const PROMPT_STEPS: readonly FlowStep[] = ["conflict", "confirm_cancel"];

function patch(st: FlowState, e: Partial<Expense>, d: Partial<FlowData> = {}): FlowState {
  return { ...st, expense: { ...st.expense, ...e }, data: { ...st.data, ...d } };
}

function leave(st: FlowState): FlowState {
  // A resumeStep written by the old flow ("summary", "payer"...) is mapped onto a valid step.
  const raw = st.data.resumeStep;
  const step: FlowStep = raw ? normalizeStep(raw, st.expense.pending) : st.expense.pending ? "missing" : "edit";
  return { ...st, step, data: { ...st.data, resumeStep: undefined, pendingText: undefined, pendingPhotoId: undefined } };
}

const ask = (state: FlowState, notice?: string): Outcome => (notice ? { k: "ask", state, notice } : { k: "ask", state });

// After every change: nothing missing → save (a draft stops being pending; a
// saved expense stays saved). Otherwise ask again: a draft on the card, a
// saved expense on the first missing field. A notice keeps an EDIT step open
// (so a rejected value is asked again instead of silently saving).
export function settle(st: FlowState, members: string[], notice?: string): Outcome {
  const missing = missingFields(st.expense, st.data, members);
  if (missing.length === 0 && (!notice || st.step === "missing")) {
    return { k: "saved", state: { ...st, expense: { ...st.expense, pending: false } } };
  }
  const step: FlowStep = missing.length === 0 ? st.step : st.expense.pending ? "missing" : missing[0];
  return ask({ ...st, step, data: { ...st.data, resumeStep: undefined } }, notice);
}

function applyBundle(st: FlowState, b: Bundle, members: string[]): { st: FlowState; notices: string[] } {
  let cur = st;
  const notices: string[] = [];
  if (b.amount !== undefined) {
    if (!(b.amount > 0)) {
      notices.push("ยอดต้องมากกว่า 0 นะ");
    } else {
      const e = cur.expense;
      const description = cur.data.amountCandidates?.includes(b.amount) ? removeNumberToken(e.description, b.amount) : e.description;
      cur = patch(cur, { amount: b.amount, description }, { amountCandidates: undefined });
    }
  }
  if (b.seedNote && !cur.expense.description) cur = patch(cur, { description: b.seedNote, category: guessCategory(b.seedNote) });
  if (b.currency && SUPPORTED_CURRENCIES.includes(b.currency)) cur = patch(cur, { currency: b.currency }, { currencyConfirmed: true });
  if (b.payer && (members.length === 0 || members.includes(b.payer))) {
    cur = patch(cur, { payer: b.payer }, cur.data.partner === b.payer ? { partner: undefined } : {});
  }
  if (b.split) {
    if (b.split !== "none" && (members.length < 2 || otherMembers(cur.expense.payer, members).length === 0)) {
      notices.push("ทริปนี้ไม่มีสมาชิกคนอื่นให้หาร");
    } else {
      cur = patch(cur, {}, { splitMode: b.split, owedAmount: undefined, owedZero: undefined, lockedSplits: undefined });
    }
  }
  if (b.partner && otherMembers(cur.expense.payer, members).includes(b.partner)) cur = patch(cur, {}, { partner: b.partner });
  if (b.owed !== undefined) {
    const amount = cur.expense.amount;
    if (amount > 0) {
      const check = validateOwed(b.owed, amount);
      if (check === "zero") cur = patch(cur, {}, { owedZero: true, owedAmount: undefined });
      else if (check === "over") notices.push(`เกินยอดรวม ${fmtNum(amount)} ใส่ใหม่นะ`);
      else cur = patch(cur, {}, { owedAmount: b.owed, owedZero: undefined });
    } else {
      // The total is typed later; missingFields re-checks the owed amount against it.
      cur = patch(cur, {}, { owedAmount: b.owed });
    }
  }
  if (b.category) cur = patch(cur, { category: b.category });
  if (b.note !== undefined) cur = patch(cur, { description: b.note });
  return { st: cur, notices };
}

function clearField(st: FlowState, f: Field): FlowState {
  switch (f) {
    case "amount": return patch(st, { amount: 0 });
    case "currency": return patch(st, {}, { currencyConfirmed: undefined, rateCurrency: undefined, fxFailed: undefined });
    case "payer": return patch(st, { payer: "" }, { partner: undefined });
    case "split": return patch(st, {}, { splitMode: undefined, owedAmount: undefined, owedZero: undefined, partner: undefined });
    case "partner": return patch(st, {}, { partner: undefined });
    case "owed": return patch(st, {}, { owedAmount: undefined, owedZero: undefined });
  }
}

function reduce(st: FlowState, ans: Answer, env: FlowEnv): Outcome {
  const { members } = env;
  const e = st.expense;
  const d = st.data;
  const inPrompt = PROMPT_STEPS.includes(st.step);

  switch (ans.k) {
    case "cancel":
      if (inPrompt) return ask(st);
      return ask({ ...st, step: "confirm_cancel", data: { ...d, resumeStep: st.step } });

    case "resume":
      // Out of a delete prompt of a SAVED expense there is nothing to resume: ask again.
      return inPrompt && e.pending ? ask(leave(st)) : ask(st);

    case "set": {
      if (inPrompt || st.step === "edit") return ask(st);
      const { st: next, notices } = applyBundle(st, ans.bundle, members);
      return settle(next, members, notices.length > 0 ? notices.join("\n") : undefined);
    }

    case "clear":
      if (st.step !== "missing") return ask(st);
      return settle(clearField(st, ans.field), members);

    case "owed_none":
      return settle(patch(st, {}, { splitMode: "none", owedAmount: undefined, owedZero: undefined }), members);

    case "owed_retry":
      return ask(patch(st, {}, { owedZero: undefined }));

    case "edit":
      return e.pending ? ask(st) : ask({ ...st, step: "edit", data: { ...d, resumeStep: undefined } });

    case "editfield":
      return st.step === "edit" ? ask({ ...st, step: ans.field }) : ask(st);

    case "ask_delete":
      return e.pending ? ask(st) : ask({ ...st, step: "confirm_cancel", data: { ...d, resumeStep: undefined } });

    case "cancel_delete":
      return st.step === "confirm_cancel" ? { k: "delete" } : ask(st);

    case "cancel_keep":
      return st.step === "confirm_cancel" ? { k: "keep" } : ask(st);

    case "conflict_resume":
      return st.step === "conflict" ? ask(leave(st)) : ask(st);

    case "conflict_park":
      return st.step === "conflict" ? { k: "park", pendingText: d.pendingText, pendingPhotoId: d.pendingPhotoId } : ask(st);

    case "conflict_drop":
      return st.step === "conflict" ? { k: "drop", pendingText: d.pendingText, pendingPhotoId: d.pendingPhotoId } : ask(st);
  }
}

// The rev goes up by one whenever the step, the expense or the data changed,
// so buttons of any older card stop working. An unchanged re-ask keeps it.
const comparable = (st: FlowState): string => JSON.stringify([st.step, st.expense, { ...st.data, rev: 0 }]);

export function applyAnswer(st: FlowState, ans: Answer, env: FlowEnv): Outcome {
  const out = reduce(st, ans, env);
  if (out.k !== "ask") return out;
  const rev = st.data.rev ?? 0;
  const changed = comparable(st) !== comparable(out.state);
  return { ...out, state: { ...out.state, data: { ...out.state.data, rev: changed ? rev + 1 : rev } } };
}
