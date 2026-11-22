// lib/line-expense-answers.ts
// Typed text / postback data → answers for the expense flow. Pure.
import type { Expense } from "@/lib/models/types";
import { matchDeposit, parseSplitWord, parseWholeNumber, resolveCurrency } from "@/lib/line-expense-parse";
import { otherMembers, validateOwed, type Bundle, type FlowData } from "@/lib/line-expense-flow";

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
