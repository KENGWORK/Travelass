// lib/line-expense-flow.ts
import type { Expense, ExpenseSplit } from "@/lib/models/types";
import { convertToTHB } from "@/lib/fx";
import { buildPendingExpense } from "@/lib/pending-expense";
import type { ParsedExpense, SplitMode } from "@/lib/line-expense-parse";

export type { SplitMode } from "@/lib/line-expense-parse";

export type FlowStep =
  | "payer" | "amount" | "currency" | "split" | "partner" | "owed"
  | "category" | "note" | "summary" | "edit" | "confirm_cancel" | "conflict";

const FLOW_STEPS: readonly string[] = [
  "payer", "amount", "currency", "split", "partner", "owed",
  "category", "note", "summary", "edit", "confirm_cancel", "conflict",
];

export function isFlowStep(s: string): s is FlowStep {
  return FLOW_STEPS.includes(s);
}

export type EditField = "amount" | "currency" | "payer" | "split" | "category" | "note";

// State that lives in LineSession.data while the expense row carries the
// rest. currencyConfirmed exists because buildPendingExpense always fills in
// trip_currency, so the row alone can't tell "chosen" from "default".
export interface FlowData {
  asker?: string;                 // LINE display name, for the "@name" prefix
  amountCandidates?: number[];
  currencyConfirmed?: boolean;
  rateCurrency?: string;          // currency fx_rate was fetched for
  fxFailed?: boolean;
  splitMode?: SplitMode;
  lockedSplits?: boolean;         // splits shared by >1 person (made in the app); left alone
  partner?: string;               // the other member, when the trip doesn't have exactly 2
  owedAmount?: number;            // หารไม่เท่า, in the expense's own currency
  owedZero?: boolean;             // user typed 0 → asking "change to ไม่หาร?"
  prevSteps?: FlowStep[];         // ↩ ย้อน stack
  editing?: boolean;
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

export function nextMissingStep(expense: Expense, data: FlowData, members: string[]): FlowStep {
  if (!expense.payer) return "payer";
  if (!(expense.amount > 0)) return "amount";
  if (!data.currencyConfirmed) return "currency";
  if (data.lockedSplits) return "summary";
  if (!data.splitMode) return "split";
  if (data.splitMode !== "none" && !partnerFor(expense.payer, data, members)) return "partner";
  if (data.splitMode === "unequal" && (data.owedAmount == null || validateOwed(data.owedAmount, expense.amount) !== "ok")) return "owed";
  return "summary";
}

export function initialState(
  p: { id: string; tripId: string; now: string; tripCurrency: string; parsed: ParsedExpense; payer: string; photoId?: string; asker?: string },
  members: string[],
): FlowState {
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
  const data: FlowData = { prevSteps: [] };
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
  return { expense, step: nextMissingStep(expense, data, members), data };
}

// Rebuilds session state for an expense that already exists (ทำต่อ / แก้ล่าสุด).
// A confirmed expense is trusted as complete. A pending draft only trusts
// what the row can prove. The currency counts as chosen when the row shows
// a sign of it: currency ≠ trip default, a fetched rate (fx_rate ≠ 1), or
// amount_thb > 0. finalize only fills amount_thb once the currency is confirmed.
export function stateFromExpense(expense: Expense, members: string[], tripCurrency: string, asker?: string): FlowState {
  const data: FlowData = { prevSteps: [] };
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
  return { expense, step: nextMissingStep(expense, data, members), data };
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

export function enterConflict(st: FlowState, p: { text?: string; photoId?: string }): FlowState {
  const inPrompt = st.step === "conflict" || st.step === "confirm_cancel";
  return {
    ...st,
    step: "conflict",
    data: { ...st.data, resumeStep: inPrompt ? st.data.resumeStep : st.step, pendingText: p.text, pendingPhotoId: p.photoId },
  };
}

export function attachPhoto(st: FlowState, photoId: string): FlowState {
  return { ...st, expense: { ...st.expense, slip_photo_ids: [photoId] } };
}
