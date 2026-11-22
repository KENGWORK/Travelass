// lib/line-expense-parse.ts
import type { Category } from "@/lib/models/types";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";

export type SplitMode = "none" | "equal" | "unequal";

export interface ParsedExpense {
  amount?: number;
  amountCandidates: number[];
  currency?: string;
  split?: { mode: SplitMode; owedAmount?: number };
  category: Category;
  note: string;
}

// "1,200" / "12.5" / "120". Not part of a bigger number and not joined by
// "-" (so "7-11" is a shop name, not two amounts).
const NUM_SRC = String.raw`(?<![\d.,\-])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d\-])`;
const numRe = () => new RegExp(NUM_SRC, "g");

export function toNumber(token: string): number {
  return Number(token.replace(/,/g, ""));
}

export function parseNumber(text: string): number | null {
  const m = new RegExp(NUM_SRC).exec(text);
  return m ? toNumber(m[0]) : null;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

// "ฝาก 20" / "ฝากให้ 20". "ของฝาก" (souvenir) is not a deposit.
const DEPOSIT_RE = new RegExp(String.raw`(?<!ของ)ฝาก(?:ให้)?\s*(${NUM_SRC})`);

// "ฝาก 20" anywhere in a typed answer: the owed amount plus where it sits, so
// the caller can cut it out of the text before reading the other tokens.
export function matchDeposit(text: string): { owed: number; index: number; length: number } | null {
  const m = DEPOSIT_RE.exec(text);
  return m ? { owed: toNumber(m[1]), index: m.index, length: m[0].length } : null;
}

// A token that is nothing but a number ("120", "1,200", "12.5").
const WHOLE_NUM_RE = new RegExp(`^${NUM_SRC}$`);

export function parseWholeNumber(token: string): number | null {
  return WHOLE_NUM_RE.test(token) ? toNumber(token) : null;
}

// Dates and times ("21/11", "14:30", "21/11/2026") are never amounts. They stay in the note.
const DATE_TIME_RE = /\d{1,4}[/:]\d{1,4}(?:[/:]\d{1,4})?/g;

// "หาร" also hides inside อาหาร / ทหาร / บริหาร / สังหาร / หารือ.
const HAAN = String.raw`(?<!อา|ท|บริ|สัง)หาร(?!ือ)`;
const SPLIT_PATTERNS: [RegExp, SplitMode][] = [
  [/ไม่หาร/, "none"],
  [new RegExp(`${HAAN}ไม่เท่า`), "unequal"],
  [new RegExp(`${HAAN}เท่า`), "equal"],
  [new RegExp(HAAN), "equal"],
];

const SPLIT_WORDS: Record<string, SplitMode> = { "ไม่หาร": "none", "หาร": "equal", "หารเท่า": "equal", "หารไม่เท่า": "unequal" };

export function parseSplitWord(text: string): SplitMode | null {
  return SPLIT_WORDS[text.trim()] ?? null;
}

const THAI_CURRENCY: [string, string][] = [
  ["ดอลฮ่องกง", "HKD"],
  ["เหรียญฮ่องกง", "HKD"],
  ["บาท", "THB"],
  ["฿", "THB"],
];
const LATIN_CURRENCY_RE = new RegExp(
  `(?<![a-z])(${[...SUPPORTED_CURRENCIES.map((c) => c.toLowerCase()), "hk"].join("|")})(?![a-z])`,
  "i",
);

function findCurrency(s: string): { code: string; index: number; length: number } | null {
  let best: { code: string; index: number; length: number } | null = null;
  for (const [alias, code] of THAI_CURRENCY) {
    const i = s.indexOf(alias);
    if (i >= 0 && (!best || i < best.index)) best = { code, index: i, length: alias.length };
  }
  const m = LATIN_CURRENCY_RE.exec(s);
  if (m && (!best || m.index < best.index)) {
    const word = m[1].toLowerCase();
    best = { code: word === "hk" ? "HKD" : word.toUpperCase(), index: m.index, length: m[0].length };
  }
  return best;
}

export function resolveCurrency(text: string): string | null {
  const t = text.trim();
  const found = findCurrency(t);
  return found && found.index === 0 && found.length === t.length ? found.code : null;
}

const CATEGORY_KEYWORDS: [Category, string[]][] = [
  ["อาหาร", ["ข้าว", "กิน", "กาแฟ", "ชา", "น้ำ", "ขนม", "ติ่มซำ", "บะหมี่", "อาหาร", "ร้าน", "dim sum", "cafe"]],
  ["เดินทาง", ["แท็กซี่", "taxi", "mtr", "รถ", "บัส", "เรือ", "ferry", "octopus", "ค่ารถ", "grab", "uber"]],
  ["ที่พัก", ["โรงแรม", "hotel", "ที่พัก", "airbnb"]],
  ["ช้อป", ["ซื้อ", "ช้อป", "เซเว่น", "7-11", "ของฝาก", "shop"]],
  ["ตั๋ว", ["ตั๋ว", "บัตร", "ticket", "เข้าชม"]],
];

// The keyword that appears earliest wins (so "ตั๋วรถ" is a ticket, not
// transport); on a tie the longer keyword wins.
export function guessCategory(text: string): Category {
  const t = text.toLowerCase();
  let best: { cat: Category; index: number; len: number } | null = null;
  for (const [cat, words] of CATEGORY_KEYWORDS) {
    for (const w of words) {
      const i = t.indexOf(w);
      if (i < 0) continue;
      if (!best || i < best.index || (i === best.index && w.length > best.len)) best = { cat, index: i, len: w.length };
    }
  }
  return best?.cat ?? "อื่นๆ";
}

export function parseExpenseText(text: string): ParsedExpense {
  let s = text;
  const cut = (index: number, length: number) => {
    s = `${s.slice(0, index)} ${s.slice(index + length)}`;
  };

  let split: ParsedExpense["split"];
  const dep = DEPOSIT_RE.exec(s);
  if (dep) {
    split = { mode: "unequal", owedAmount: toNumber(dep[1]) };
    cut(dep.index, dep[0].length);
  }
  for (const [re, mode] of SPLIT_PATTERNS) {
    const m = re.exec(s);
    if (m) {
      split ??= { mode };
      cut(m.index, m[0].length);
      break;
    }
  }

  const cur = findCurrency(s);
  if (cur) cut(cur.index, cur.length);

  let amount: number | undefined;
  let amountCandidates: number[] = [];
  // Blank out date/time tokens (same length, so indices still line up with s).
  const scan = s.replace(DATE_TIME_RE, (m) => " ".repeat(m.length));
  const nums = [...scan.matchAll(numRe())];
  if (nums.length === 1) {
    const n = toNumber(nums[0][0]);
    if (n > 0) {
      amount = n;
      cut(nums[0].index ?? 0, nums[0][0].length);
    }
  } else if (nums.length > 1) {
    for (const m of nums) {
      const n = toNumber(m[0]);
      if (n > 0 && !amountCandidates.includes(n)) amountCandidates.push(n);
    }
    if (amountCandidates.length === 1) {
      amount = amountCandidates[0];
      amountCandidates = [];
    }
  }

  return { amount, amountCandidates, currency: cur?.code, split, category: guessCategory(text), note: collapse(s) };
}

export function removeNumberToken(note: string, n: number): string {
  for (const m of note.matchAll(numRe())) {
    if (toNumber(m[0]) === n) {
      const i = m.index ?? 0;
      return collapse(`${note.slice(0, i)} ${note.slice(i + m[0].length)}`);
    }
  }
  return note;
}

export type ExpenseCommand = "cancel" | "resume" | "edit_last" | "back";
const COMMANDS: Record<string, ExpenseCommand> = {
  "ยกเลิก": "cancel",
  "ทำต่อ": "resume",
  "แก้ล่าสุด": "edit_last",
  "ย้อน": "back",
  "↩ ย้อน": "back",
};

export function expenseCommand(text: string): ExpenseCommand | null {
  return COMMANDS[text.trim()] ?? null;
}
