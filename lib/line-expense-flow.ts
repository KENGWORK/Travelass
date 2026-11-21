// lib/line-expense-flow.ts
import type { Category, Expense, ExpenseSplit } from "@/lib/models/types";
import { convertToTHB, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { buildPendingExpense } from "@/lib/pending-expense";
import { CATS } from "@/lib/categories";
import { isViewCommand } from "@/lib/line-router";
import {
  expenseCommand,
  guessCategory,
  parseExpenseText,
  parseNumber,
  parseSplitWord,
  removeNumberToken,
  resolveCurrency,
  type ParsedExpense,
  type SplitMode,
} from "@/lib/line-expense-parse";

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

// ---------------------------------------------------------------------------
// Answers (typed text and postbacks) and the reducer
// ---------------------------------------------------------------------------

export type Answer =
  | { k: "cancel" } | { k: "back" } | { k: "resume" }
  | { k: "payer"; name: string }
  | { k: "amount"; amount: number; note?: string }   // note: leftover text typed with it at the payer step
  | { k: "currency"; code: string }
  | { k: "split"; mode: SplitMode }
  | { k: "partner"; name: string }
  | { k: "owed"; amount: number }
  | { k: "owed_none" } | { k: "owed_retry" }
  | { k: "category"; category: Category }
  | { k: "note"; text: string }
  | { k: "confirm" } | { k: "edit" }
  | { k: "editfield"; field: EditField }
  | { k: "cancel_delete" } | { k: "cancel_keep" }
  | { k: "conflict_resume" } | { k: "conflict_park" } | { k: "conflict_drop" };

export type Outcome =
  | { k: "ask"; state: FlowState; notice?: string }
  | { k: "confirm"; expense: Expense }
  | { k: "delete" }
  | { k: "keep" }
  | { k: "park"; pendingText?: string; pendingPhotoId?: string }
  | { k: "drop"; pendingText?: string; pendingPhotoId?: string };

const CATEGORY_NAMES: Category[] = CATS.map((c) => c.name);
const EDIT_FIELDS: readonly string[] = ["amount", "currency", "payer", "split", "category", "note"];
const EDIT_LABELS: Record<string, EditField> = {
  "ยอด": "amount", "สกุลเงิน": "currency", "คนจ่าย": "payer", "หาร": "split", "หมวด": "category", "โน้ต": "note",
};
const PROMPT_STEPS: readonly FlowStep[] = ["conflict", "confirm_cancel"];

function matchName(text: string, names: string[]): string | null {
  const t = text.trim().toLowerCase();
  return names.find((n) => n.trim().toLowerCase() === t) ?? null;
}

// Typed text → answer for the given step, or null when it is not an answer
// (the router then treats it as a new entry / off-topic). Used both for the
// router predicate and for applying the answer, so the two always agree.
// amountKnown = the expense already has an amount > 0. At the payer step a
// bare number fills a missing amount (the payer is asked again) instead of
// being read as a new entry.
export function interpretAnswer(step: FlowStep, data: FlowData, text: string, members: string[], amountKnown = false): Answer | null {
  const t = text.trim();
  if (!t) return null;
  const cmd = expenseCommand(t);
  if (cmd === "cancel") return { k: "cancel" };
  if (cmd === "back") return { k: "back" };
  if (cmd === "resume") return { k: "resume" };

  switch (step) {
    case "payer": {
      const n = parseNumber(t);
      const name = members.length === 0 ? (n == null ? t : null) : matchName(t, members);
      if (name) return { k: "payer", name };
      if (!amountKnown && n != null && n > 0) {
        // "50 กาแฟ" → amount 50, with "กาแฟ" kept to seed an empty note.
        const parsed = parseExpenseText(t);
        return { k: "amount", amount: parsed.amount ?? n, note: (parsed.amount ? parsed.note : "") || undefined };
      }
      return null;
    }
    case "amount": {
      const n = parseNumber(t);
      return n == null ? null : { k: "amount", amount: n };
    }
    case "currency": {
      const code = resolveCurrency(t);
      return code ? { k: "currency", code } : null;
    }
    case "split": {
      const mode = parseSplitWord(t);
      return mode ? { k: "split", mode } : null;
    }
    case "partner": {
      const name = matchName(t, members);
      return name ? { k: "partner", name } : null;
    }
    case "owed": {
      if (data.owedZero) {
        if (t === "เปลี่ยนเป็นไม่หาร") return { k: "owed_none" };
        if (t === "ใส่ใหม่" || t === "↩ ใส่ใหม่") return { k: "owed_retry" };
      }
      const n = parseNumber(t);
      return n == null ? null : { k: "owed", amount: n };
    }
    case "category": {
      const category = CATEGORY_NAMES.find((c) => c === t);
      return category ? { k: "category", category } : null;
    }
    case "note":
      if (isViewCommand(t)) return null;
      return { k: "note", text: t === "-" ? "" : t };
    case "summary":
      if (t === "ยืนยัน") return { k: "confirm" };
      if (t === "แก้") return { k: "edit" };
      return null;
    case "edit": {
      const field = EDIT_LABELS[t];
      return field ? { k: "editfield", field } : null;
    }
    case "confirm_cancel":
      if (t === "ลบทิ้ง" || t === "ลบรายการนี้") return { k: "cancel_delete" };
      if (t === "เก็บไว้กรอกทีหลัง" || t === "เก็บไว้" || t === "ไม่ลบ") return { k: "cancel_keep" };
      return null;
    case "conflict":
      if (t === "ทำต่ออันเก่า") return { k: "conflict_resume" };
      if (t === "เก็บไว้ เริ่มใหม่" || t === "เก็บไว้ก่อน") return { k: "conflict_park" };
      if (t === "ทิ้งอันเก่า") return { k: "conflict_drop" };
      return null;
  }
}

export function postbackToAnswer(d: Record<string, string>): Answer | null {
  const v = d.v ?? "";
  switch (d.a) {
    case "x_payer": return v ? { k: "payer", name: v } : null;
    case "x_amount": {
      const n = Number(v);
      return v !== "" && Number.isFinite(n) ? { k: "amount", amount: n } : null;
    }
    case "x_currency": return v ? { k: "currency", code: v } : null;
    case "x_split": return v === "none" || v === "equal" || v === "unequal" ? { k: "split", mode: v } : null;
    case "x_partner": return v ? { k: "partner", name: v } : null;
    case "x_owed_zero": return v === "none" ? { k: "owed_none" } : v === "retry" ? { k: "owed_retry" } : null;
    case "x_category": {
      const category = CATEGORY_NAMES.find((c) => c === v);
      return category ? { k: "category", category } : null;
    }
    case "x_back": return { k: "back" };
    case "x_confirm": return { k: "confirm" };
    case "x_edit": return { k: "edit" };
    case "x_editfield": return EDIT_FIELDS.includes(v) ? { k: "editfield", field: v as EditField } : null;
    case "x_cancel": return { k: "cancel" };
    case "x_cancel_delete": return { k: "cancel_delete" };
    case "x_cancel_keep": return { k: "cancel_keep" };
    case "x_conflict_resume": return { k: "conflict_resume" };
    case "x_conflict_park": return { k: "conflict_park" };
    case "x_conflict_drop": return { k: "conflict_drop" };
    default: return null;
  }
}

function patch(st: FlowState, e: Partial<Expense>, d: Partial<FlowData> = {}): FlowState {
  return { ...st, expense: { ...st.expense, ...e }, data: { ...st.data, ...d } };
}

function goTo(st: FlowState, step: FlowStep): FlowState {
  const prev = st.data.prevSteps ?? [];
  const push = step !== st.step && !PROMPT_STEPS.includes(st.step) && !PROMPT_STEPS.includes(step);
  return { ...st, step, data: { ...st.data, prevSteps: push ? [...prev, st.step].slice(-10) : prev } };
}

function auto(st: FlowState, members: string[]): FlowState {
  return goTo(st, nextMissingStep(st.expense, st.data, members));
}

function leave(st: FlowState, members: string[]): FlowState {
  const step = st.data.resumeStep ?? nextMissingStep(st.expense, st.data, members);
  return { ...st, step, data: { ...st.data, resumeStep: undefined, pendingText: undefined, pendingPhotoId: undefined } };
}

const ask = (state: FlowState, notice?: string): Outcome => (notice ? { k: "ask", state, notice } : { k: "ask", state });

export function applyAnswer(st: FlowState, ans: Answer, env: FlowEnv): Outcome {
  const { members } = env;
  const e = st.expense;
  const d = st.data;
  const inPrompt = PROMPT_STEPS.includes(st.step);

  switch (ans.k) {
    case "cancel":
      // 🗑 on a draft's summary deletes at once. A confirmed expense (opened
      // via แก้ล่าสุด, maybe with paid splits) always asks first.
      if (st.step === "summary" && e.pending) return { k: "delete" };
      if (inPrompt) return ask(st);
      return ask({ ...st, step: "confirm_cancel", data: { ...d, resumeStep: st.step } });

    case "back":
    case "resume": {
      if (inPrompt) return ask(leave(st, members));
      if (ans.k === "resume") return ask(st);
      const prev = [...(d.prevSteps ?? [])];
      const target = prev.pop();
      if (!target) return ask(st);
      return ask({ ...st, step: target, data: { ...d, prevSteps: prev, owedZero: undefined } });
    }

    case "payer":
      if (members.length > 0 && !members.includes(ans.name)) return ask(st);
      return ask(auto(patch(st, { payer: ans.name }, d.partner === ans.name ? { partner: undefined } : {}), members));

    case "amount": {
      if (!(ans.amount > 0)) return ask(st, "ยอดต้องมากกว่า 0 นะ");
      if (ans.note && !e.description) {
        // Typed at the payer step with words: seed the empty note and re-guess the category from it.
        return ask(auto(patch(st, { amount: ans.amount, description: ans.note, category: guessCategory(ans.note) }, { amountCandidates: undefined }), members));
      }
      const description = d.amountCandidates?.includes(ans.amount) ? removeNumberToken(e.description, ans.amount) : e.description;
      return ask(auto(patch(st, { amount: ans.amount, description }, { amountCandidates: undefined }), members));
    }

    case "currency":
      if (!SUPPORTED_CURRENCIES.includes(ans.code)) return ask(st);
      return ask(auto(patch(st, { currency: ans.code }, { currencyConfirmed: true }), members));

    case "split":
      if (ans.mode !== "none" && otherMembers(e.payer, members).length === 0) return ask(st, "ทริปนี้ไม่มีสมาชิกคนอื่นให้หาร");
      return ask(auto(patch(st, {}, { splitMode: ans.mode, owedAmount: undefined, owedZero: undefined, lockedSplits: undefined }), members));

    case "partner":
      if (!otherMembers(e.payer, members).includes(ans.name)) return ask(st);
      return ask(auto(patch(st, {}, { partner: ans.name }), members));

    case "owed": {
      const check = validateOwed(ans.amount, e.amount);
      if (check === "zero") return ask(patch(st, {}, { owedZero: true }));
      if (check === "over") return ask(st, `เกินยอดรวม ${fmtNum(e.amount)} ใส่ใหม่นะ`);
      return ask(auto(patch(st, {}, { owedAmount: ans.amount, owedZero: undefined }), members));
    }

    case "owed_none":
      return ask(auto(patch(st, {}, { splitMode: "none", owedAmount: undefined, owedZero: undefined }), members));

    case "owed_retry":
      return ask(patch(st, {}, { owedZero: undefined }));

    case "category":
      return ask(auto(patch(st, { category: ans.category }), members));

    case "note":
      return ask(auto(patch(st, { description: ans.text }), members));

    case "confirm": {
      if (st.step !== "summary") return ask(st);
      const missing = nextMissingStep(e, d, members);
      if (missing !== "summary") return ask(goTo(st, missing));
      return { k: "confirm", expense: { ...e, pending: false } };
    }

    case "edit":
      return ask(goTo(patch(st, {}, { editing: true }), "edit"));

    case "editfield":
      return ask(goTo(st, ans.field));

    case "cancel_delete":
      return { k: "delete" };

    case "cancel_keep":
      return { k: "keep" };

    case "conflict_resume":
      return ask(leave(st, members));

    case "conflict_park":
      return { k: "park", pendingText: d.pendingText, pendingPhotoId: d.pendingPhotoId };

    case "conflict_drop":
      return { k: "drop", pendingText: d.pendingText, pendingPhotoId: d.pendingPhotoId };
  }
}
