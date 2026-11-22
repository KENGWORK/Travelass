// lib/line-expense-answers.ts
// Typed text / postback data → answers for the expense flow. Pure.
import type { Category, Expense } from "@/lib/models/types";
import { CATS } from "@/lib/categories";
import { isViewCommand } from "@/lib/line-router";
import { expenseCommand, matchDeposit, parseNumber, parseSplitWord, parseWholeNumber, resolveCurrency } from "@/lib/line-expense-parse";
import { otherMembers, validateOwed, type Answer, type Bundle, type EditField, type Field, type FlowData, type FlowState } from "@/lib/line-expense-flow";

export interface BundleCtx {
  expense: Expense;
  data: FlowData;
  members: string[];
}

const lc = (s: string): string => s.trim().toLowerCase();

function matchName(text: string, names: string[]): string | null {
  return names.find((n) => lc(n) === lc(text)) ?? null;
}

// "@เก่ง" inside a first message: the member it names and the text without it.
// The name must be followed by whitespace or the end, so "@เก่งมาก" is not "@เก่ง".
export function extractAtMember(text: string, members: string[]): { payer: string; text: string } | null {
  const lower = text.toLowerCase();
  for (const m of members) {
    const needle = `@${lc(m)}`;
    let i = lower.indexOf(needle);
    while (i >= 0) {
      const after = lower.charAt(i + needle.length);
      if (after === "" || /\s/.test(after)) {
        return { payer: m, text: `${text.slice(0, i)} ${text.slice(i + needle.length)}`.replace(/\s+/g, " ").trim() };
      }
      i = lower.indexOf(needle, i + 1);
    }
  }
  return null;
}

// Reads every token of one message: currency, member name (whole word or
// @name), split word, "ฝาก N", bare numbers. A bare number is the amount while
// it is missing, then the owed amount while the split is unequal and owed is
// open. A number that fits nowhere means the text is a new entry, not an
// answer, so the whole thing is null. Unknown words are skipped as long as
// something else was understood.
export function interpretBundle(text: string, ctx: BundleCtx): Bundle | null {
  const { expense: e, data: d, members } = ctx;
  const b: Bundle = {};
  let understood = 0;
  let rest = text.replace(/@/g, " ");

  const dep = matchDeposit(rest);
  if (dep) {
    b.split = "unequal";
    b.owed = dep.owed;
    rest = `${rest.slice(0, dep.index)} ${rest.slice(dep.index + dep.length)}`;
    understood++;
  }

  const names: string[] = [];
  // A member name containing a space cannot survive the whitespace split below.
  for (const m of members) {
    if (!/\s/.test(m.trim())) continue;
    const i = rest.toLowerCase().indexOf(lc(m));
    if (i < 0) continue;
    names.push(m);
    rest = `${rest.slice(0, i)} ${rest.slice(i + lc(m).length)}`;
  }

  const numbers: number[] = [];
  const unknown: string[] = [];
  for (const tok of rest.split(/\s+/).filter(Boolean)) {
    const code = resolveCurrency(tok);
    if (code) {
      b.currency ??= code;
      understood++;
      continue;
    }
    const mode = parseSplitWord(tok);
    if (mode) {
      b.split ??= mode;
      understood++;
      continue;
    }
    const name = matchName(tok, members);
    if (name) {
      names.push(name);
      continue;
    }
    const n = parseWholeNumber(tok);
    if (n !== null) {
      numbers.push(n);
      continue;
    }
    unknown.push(tok);
  }

  for (const name of names) {
    if (!e.payer && !b.payer) {
      b.payer = name;
      understood++;
      continue;
    }
    const payer = b.payer ?? e.payer;
    const mode = b.split ?? d.splitMode;
    const others = otherMembers(payer, members);
    if (mode && mode !== "none" && others.length > 1 && !d.partner && !b.partner && others.includes(name)) {
      b.partner = name;
      understood++;
    }
  }

  for (const n of numbers) {
    if (!(e.amount > 0) && b.amount === undefined) {
      b.amount = n;
      understood++;
      continue;
    }
    const mode = b.split ?? d.splitMode;
    const owedOpen = b.owed === undefined && (d.owedAmount == null || d.owedZero === true || validateOwed(d.owedAmount, e.amount) !== "ok");
    if (mode === "unequal" && owedOpen) {
      b.owed = n;
      understood++;
      continue;
    }
    return null;
  }

  if (understood === 0) return null;
  if (b.amount !== undefined && !e.description && unknown.length > 0) b.seedNote = unknown.join(" ");
  return b;
}

const CATEGORY_NAMES: Category[] = CATS.map((c) => c.name);
const EDIT_FIELDS: readonly string[] = ["amount", "currency", "payer", "split", "category", "note"];
const EDIT_LABELS: Record<string, EditField> = {
  "ยอด": "amount", "สกุลเงิน": "currency", "คนจ่าย": "payer", "หาร": "split", "หมวด": "category", "โน้ต": "note",
};
const CLEARABLE: readonly string[] = ["amount", "currency", "payer", "split", "partner", "owed"];

const set = (bundle: Bundle): Answer => ({ k: "set", bundle });

// Typed text → answer for the current step, or null when it is not an answer
// (the router then treats it as a new entry / off-topic). Used both for the
// router predicate and for applying the answer, so the two always agree.
// The missing card reads a whole bundle; the edit steps read one field each.
// View commands (แพลน, คู่มือ, ...) are never answers, so they leave the draft alone.
export function interpretAnswer(st: Pick<FlowState, "step" | "data" | "expense">, text: string, members: string[]): Answer | null {
  const t = text.trim();
  if (!t) return null;
  const cmd = expenseCommand(t);
  if (cmd === "cancel") return { k: "cancel" };
  if (cmd === "resume") return { k: "resume" };
  if (isViewCommand(t)) return null;
  const { step, data, expense } = st;

  switch (step) {
    case "missing": {
      if (data.owedZero) {
        if (t === "เปลี่ยนเป็นไม่หาร") return { k: "owed_none" };
        if (t === "ใส่ใหม่" || t === "↩ ใส่ใหม่") return { k: "owed_retry" };
      }
      const bundle = interpretBundle(t, { expense, data, members });
      return bundle ? set(bundle) : null;
    }
    case "amount": {
      const n = parseNumber(t);
      return n == null ? null : set({ amount: n });
    }
    case "currency": {
      const code = resolveCurrency(t);
      return code ? set({ currency: code }) : null;
    }
    case "payer": {
      const name = members.length === 0 ? (parseNumber(t) == null ? t : null) : matchName(t, members);
      return name ? set({ payer: name }) : null;
    }
    case "split": {
      const mode = parseSplitWord(t);
      return mode ? set({ split: mode }) : null;
    }
    case "partner": {
      const name = matchName(t, members);
      return name ? set({ partner: name }) : null;
    }
    case "owed": {
      if (data.owedZero) {
        if (t === "เปลี่ยนเป็นไม่หาร") return { k: "owed_none" };
        if (t === "ใส่ใหม่" || t === "↩ ใส่ใหม่") return { k: "owed_retry" };
      }
      const n = parseNumber(t);
      return n == null ? null : set({ owed: n });
    }
    case "category": {
      const category = CATEGORY_NAMES.find((c) => c === t);
      return category ? set({ category }) : null;
    }
    case "note":
      return set({ note: t === "-" ? "" : t });
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

// Postback data: a=<action>&f=<field>&w=<value>&e=<expense id>&v=<rev>.
// e / v are checked by the handler, not here.
function fieldBundle(f: string, w: string): Bundle | null {
  switch (f) {
    case "amount": {
      const n = Number(w);
      return w !== "" && Number.isFinite(n) ? { amount: n } : null;
    }
    case "currency": return w ? { currency: w } : null;
    case "payer": return w ? { payer: w } : null;
    case "split": return w === "none" || w === "equal" || w === "unequal" ? { split: w } : null;
    case "partner": return w ? { partner: w } : null;
    case "category": {
      const category = CATEGORY_NAMES.find((c) => c === w);
      return category ? { category } : null;
    }
    default: return null;
  }
}

export function postbackToAnswer(d: Record<string, string>): Answer | null {
  const f = d.f ?? "";
  const w = d.w ?? "";
  switch (d.a) {
    case "x_set": {
      const bundle = fieldBundle(f, w);
      return bundle ? set(bundle) : null;
    }
    case "x_clear": return CLEARABLE.includes(f) ? { k: "clear", field: f as Field } : null;
    case "x_owed_zero": return w === "none" ? { k: "owed_none" } : w === "retry" ? { k: "owed_retry" } : null;
    case "x_editfield": return EDIT_FIELDS.includes(w) ? { k: "editfield", field: w as EditField } : null;
    case "x_edit": return { k: "edit" };
    case "x_del": return { k: "ask_delete" };
    case "x_cancel": return { k: "cancel" };
    case "x_cancel_delete": return { k: "cancel_delete" };
    case "x_cancel_keep": return { k: "cancel_keep" };
    case "x_conflict_resume": return { k: "conflict_resume" };
    case "x_conflict_park": return { k: "conflict_park" };
    case "x_conflict_drop": return { k: "conflict_drop" };
    default: return null;
  }
}
