# LINE Expense Capture (ask-until-complete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user record a *complete* expense (amount, currency, payer, split, owed amount) from LINE by typing text or sending a slip photo. The bot asks only for what is missing, then shows a summary card with confirm / edit / cancel.

**Architecture:** Three pure modules hold all the logic. `lib/line-expense-parse.ts` turns text into tokens. `lib/line-expense-flow.ts` is a state machine (`FlowState` + `Answer` → `Outcome`) that decides the next step, the splits and the rate bookkeeping. `lib/line-expense-messages.ts` turns a `FlowState` into LINE JSON. `lib/line-handlers/expense.ts` is fully replaced. It is the only file in this feature with I/O: store, `fetchRate`, LINE profile/content and the session row. It hands answers from text, postbacks and images to the pure state machine and saves what comes back. The expense is saved as a `pending: true` draft on the first message, so nothing is lost if the user goes quiet.

**Tech Stack:** Next.js 16 (App Router route already exists; no Next.js APIs are touched by this plan), TypeScript, Vitest (`npm test -- <path>`), LINE Messaging API (reply only).

**Specs:** `docs/superpowers/specs/2026-11-21-line-bot-shared-design.md` (shared contract: **wins on conflict**) and `docs/superpowers/specs/2026-11-19-line-expense-capture-design.md` (feature behavior). User doc: `docs/line-bot-how-to.md` section 1.

## Prerequisite

The LINE foundation plan (`docs/superpowers/plans/2026-11-21-line-foundation.md`) has **already been executed**. Every module in the shared spec exists with exactly the signatures it lists. This plan relies on these exports and does not re-implement or edit any of them:

- `lib/line.ts`: `fetchLineDisplayName(source, accessToken): Promise<string | null>`, `fetchLineImageContent(messageId, accessToken): Promise<{ buf: Buffer; mime: string }>`, `matchMemberName(displayName: string | null, members: { name: string }[]): string`, `LineEvent` (with `postback?: { data: string }`), `userKey`, `isGroupChat`
- `lib/line-flex.ts`: `CLAY`, `type FlexNode`, `txt`, `compact`, `encodePostback`, `decodePostback`, `postbackAction(label, data, displayText?)`, `uriAction(label, uri)`, `imageUrl(origin, photoId)`, `flexMessage(altText, contents, quickReply?)`, `textMessage(text, quickReply?)`, `quickReply(items: { label: string; data?: Record<string, string | number | undefined>; text?: string }[])`
- `lib/line-session.ts`: `readFlowSession(key, now): Promise<LineSession | null>` (deletes and returns null when older than 30 min), `writeFlowSession(s: Omit<LineSession, "updated_at">, now): Promise<void>`, `deleteFlowSession(key): Promise<void>`
- `lib/models/types.ts`: `LineSession { id; trip_id; expense_id; step; updated_at; data: Record<string, unknown> }`
- `lib/line-router.ts`: `type Route` (expense routes: `{ kind: "flow_answer" }`, `{ kind: "expense_new"; text }`, `{ kind: "flow_conflict"; text }`, `{ kind: "flow_reask" }`) and `EXPENSE_COMMAND_KEYWORDS = ["ทำต่อ", "แก้ล่าสุด", "ยกเลิก"]`. Foundation decision 6: when one of these is the whole message (after polite strip) and the flow predicate did not claim it, the router returns `{ kind: "expense_new", text: <keyword> }`. In practice that means `ทำต่อ` / `ยกเลิก` with no live session, and `แก้ล่าสุด` with or without one (the flow predicate never claims `แก้ล่าสุด`). The handler detects these from `route.text`.
- `lib/line-menu.ts`: `NO_TRIP_TEXT`
- `lib/line-session.ts` also exports `normalizeSessionData(raw)`. `readFlowSession` already returns `data` normalized to `{}`.
- `lib/line-handlers/types.ts`: `HandlerCtx { event; replyToken; accessToken; origin; now; userKey; isGroup; trip: Trip | null; reply(messages: FlexNode[]): Promise<void> }`, `PostbackData = Record<string, string>`
- `lib/line-dispatch.ts`: sends `x_*` postbacks to `expense.handlePostback`, images to `expense.handleImage`, and the four expense routes to `expense.handleRoute`. It builds the router predicate with `expense.flowAnswerPredicate(ctx, session)`.
- `lib/line-handlers/expense.ts`: currently holds the OLD photo flow (`awaiting_name` → `awaiting_note`, using `buildNameQuickReply` / `buildSkipQuickReply` / `buildConfirmationFlex` from `lib/line.ts`), with WIP stubs for the other routes. `lib/line-handlers/expense.test.ts` tests that old flow. **Task 5 replaces both files entirely.** `lib/line-dispatch.test.ts` mocks the whole expense module, so it is unaffected.

If any of these are missing or differ, stop and finish the foundation plan first.

## Global Constraints

- Reply only (`/v2/bot/message/reply` via `ctx.reply`), ≤ 5 messages per reply. Never push.
- Postback `a` values for this feature all start with `x_` (shared spec wins over the expense spec's bare names). Payload keys: `a` (action), `e` (expense id), `s` (step the button was drawn for), `v` (value). Postback data ≤ 300 chars.
- Quick reply ≤ 13 items, each label ≤ 20 characters. Flex: no empty `text` node (use `txt()` + `compact()`), altText ≤ 400 chars.
- Postback data is built only through the foundation's `postbackAction` / `quickReply` (which call `encodePostback`) and read only with `decodePostback`. Never use `URLSearchParams` (foundation decision 15: minimal escaping, Thai stays raw).
- `npx tsc --noEmit` must pass at **every** task commit, not just the last one: the user deploys `main` and Vercel type-checks. Every task's verify step runs it.
- The free-text `note` step refuses the router's **view** commands only, via the foundation's `isViewCommand` from `@/lib/line-router` (no local copy). Collision words like `ร้าน` / `กิน` / `ตั๋ว` are not view commands, so a note starting with them is saved normally.
- `lib/line-expense-*.ts` files are pure: no `fetch`, no store, no `Date.now()`. `fetchRate` (network) is called only in `lib/line-handlers/expense.ts`.
- Do NOT edit `lib/line-router.ts`, `lib/line-dispatch.ts`, `lib/line-session.ts`, `lib/line-flex.ts`, or `app/api/line/webhook/route.ts`.
- Flow session id = `ctx.userKey` (one per person per chat). TTL 30 min is enforced by `readFlowSession`. An expired session leaves its expense `pending: true`.
- The payer's own share is never stored. `splits` holds only the other person's share (`lib/settle.ts` stays unchanged). An equal split rounds the other person's share **up** to the satang: `ceil2(amount_thb / 2)`.
- Category is guessed from keywords and never asked during capture (it can be changed from ✏️ แก้). Note = the leftover text.
- Required order of questions: payer → amount (→ pick candidate) → currency → split → (partner, only when the trip has ≠ 2 members) → owed (unequal only).
- FX failure: `fx_rate = 1`, `data.fxFailed = true`, and the card shows `⚠️ ดึงเรตไม่ได้ (ใช้เรต 1 ไปก่อน) แก้ในแอป`.
- No-trip text: reuse `NO_TRIP_TEXT` from `@/lib/line-menu` (verbatim shared-spec copy). Do not duplicate the string.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/line-expense-parse.ts` | Create | Number tokens, currency aliases, split words, `ฝาก N`, category keywords, leftover note, text commands. Pure. |
| `lib/line-expense-parse.test.ts` | Create | Tests for the above |
| `lib/line-expense-flow.ts` | Create | Flow types, `nextMissingStep`, `buildSplits`, owed validation, initial state / state from existing expense, rate + `finalize`, conflict/photo helpers, `interpretAnswer` (typed text), `postbackToAnswer`, `applyAnswer` (the reducer). Pure. |
| `lib/line-expense-flow.test.ts` | Create | Core state tests (Task 2) |
| `lib/line-expense-flow-answers.test.ts` | Create | Answer/reducer tests (Task 3) |
| `lib/line-expense-messages.ts` | Create | Question text + quick replies, summary card, saved card, fixed copy (`MSG`). Pure JSON out. |
| `lib/line-expense-messages.test.ts` | Create | Tests for the above |
| `lib/line-handlers/expense.ts` | Replace entirely | I/O: load trip members / session / expense, call pure flow, fetch rate, save, reply. Exports `handleRoute`, `handlePostback`, `handleImage`, `flowAnswerPredicate`. |
| `lib/line-handlers/expense.test.ts` | Create (overwrite if the foundation left one) | Handler tests with in-memory store/session mocks |
| `lib/line.ts`, `lib/line.test.ts` | Modify | Remove the old-flow helpers that no longer have callers (`sourceKey`, `buildNameQuickReply`, `buildSkipQuickReply`, `buildConfirmationFlex`) |

Step names stored in `LineSession.step`: `payer | amount | currency | split | partner | owed | category | note | summary | edit | confirm_cancel | conflict`. This extends the expense spec's list with `partner` (the "หารกับใคร?" fallback), `category` / `note` (edit targets) and `edit` (field picker).

---

### Task 1: Text parser (`lib/line-expense-parse.ts`)

**Files:**
- Create: `lib/line-expense-parse.ts`
- Test: `lib/line-expense-parse.test.ts`

**Interfaces:**
- Consumes: `SUPPORTED_CURRENCIES` from `@/lib/fx`; `Category` from `@/lib/models/types`
- Produces:
  - `type SplitMode = "none" | "equal" | "unequal"`
  - `interface ParsedExpense { amount?: number; amountCandidates: number[]; currency?: string; split?: { mode: SplitMode; owedAmount?: number }; category: Category; note: string }`
  - `parseExpenseText(text: string): ParsedExpense`
  - `parseNumber(text: string): number | null` (first number in text, `0` included)
  - `toNumber(token: string): number`
  - `resolveCurrency(text: string): string | null` (whole answer must be one currency word)
  - `parseSplitWord(text: string): SplitMode | null` (whole answer must be a split word)
  - `guessCategory(text: string): Category`
  - `removeNumberToken(note: string, n: number): string`
  - `type ExpenseCommand = "cancel" | "resume" | "edit_last" | "back"`; `expenseCommand(text: string): ExpenseCommand | null`

- [ ] **Step 1: Write the failing test**

```ts
// lib/line-expense-parse.test.ts
import { describe, it, expect } from "vitest";
import {
  parseExpenseText,
  parseNumber,
  resolveCurrency,
  parseSplitWord,
  guessCategory,
  removeNumberToken,
  expenseCommand,
} from "./line-expense-parse";

describe("parseExpenseText", () => {
  it("reads a lone number as the amount with an empty note", () => {
    expect(parseExpenseText("120")).toEqual({ amount: 120, amountCandidates: [], category: "อื่นๆ", note: "" });
  });

  it("keeps the leftover words as the note and guesses the category", () => {
    expect(parseExpenseText("120 ข้าวมันไก่")).toEqual({ amount: 120, amountCandidates: [], category: "อาหาร", note: "ข้าวมันไก่" });
  });

  it("accepts thousands commas and decimals", () => {
    expect(parseExpenseText("1,200 บาท โรงแรม")).toEqual({ amount: 1200, amountCandidates: [], currency: "THB", category: "ที่พัก", note: "โรงแรม" });
    expect(parseExpenseText("12.5 hkd กาแฟ")).toEqual({ amount: 12.5, amountCandidates: [], currency: "HKD", category: "อาหาร", note: "กาแฟ" });
  });

  it.each([
    ["120 HKD", "HKD"],
    ["120 hk", "HKD"],
    ["120 ดอลฮ่องกง", "HKD"],
    ["120 เหรียญฮ่องกง", "HKD"],
    ["120 บาท", "THB"],
    ["120฿", "THB"],
    ["120 THB", "THB"],
    ["120 thb", "THB"],
    ["120 jpy", "JPY"],
  ])("maps the currency alias in %s to %s", (text, code) => {
    const p = parseExpenseText(text);
    expect(p.currency).toBe(code);
    expect(p.amount).toBe(120);
    expect(p.note).toBe("");
  });

  it("does not read currency codes out of the middle of a word", () => {
    expect(parseExpenseText("taxi 80")).toEqual({ amount: 80, amountCandidates: [], category: "เดินทาง", note: "taxi" });
  });

  it("reads ฝาก N as an unequal split and does not count N as the amount", () => {
    expect(parseExpenseText("500 บาท เซเว่น ฝาก 20")).toEqual({
      amount: 500, amountCandidates: [], currency: "THB",
      split: { mode: "unequal", owedAmount: 20 }, category: "ช้อป", note: "เซเว่น",
    });
  });

  it("accepts ฝากให้ N as a deposit too", () => {
    expect(parseExpenseText("500 บาท ข้าว ฝากให้ 20")).toEqual({
      amount: 500, amountCandidates: [], currency: "THB",
      split: { mode: "unequal", owedAmount: 20 }, category: "อาหาร", note: "ข้าว",
    });
  });

  it("never reads dates or times as amounts, and keeps them in the note", () => {
    expect(parseExpenseText("ข้าว 21/11 120")).toEqual({ amount: 120, amountCandidates: [], category: "อาหาร", note: "ข้าว 21/11" });
    expect(parseExpenseText("กาแฟ 14:30 45")).toEqual({ amount: 45, amountCandidates: [], category: "อาหาร", note: "กาแฟ 14:30" });
  });

  it("does not treat ของฝาก (souvenir) as a deposit", () => {
    const p = parseExpenseText("ซื้อของฝาก 300");
    expect(p.split).toBeUndefined();
    expect(p.amount).toBe(300);
    expect(p.note).toBe("ซื้อของฝาก");
  });

  it("reads หาร / หารเท่า as equal and ไม่หาร as none", () => {
    expect(parseExpenseText("120 HKD ข้าว หาร").split).toEqual({ mode: "equal" });
    expect(parseExpenseText("120 HKD ข้าว หาร").note).toBe("ข้าว");
    expect(parseExpenseText("120 หารเท่า").split).toEqual({ mode: "equal" });
    expect(parseExpenseText("120 บาท ข้าวมันไก่ ไม่หาร")).toEqual({
      amount: 120, amountCandidates: [], currency: "THB", split: { mode: "none" }, category: "อาหาร", note: "ข้าวมันไก่",
    });
  });

  it("reads หารไม่เท่า without an amount as unequal with no owed amount yet", () => {
    expect(parseExpenseText("300 หารไม่เท่า").split).toEqual({ mode: "unequal" });
  });

  it("does not see หาร inside อาหาร", () => {
    const p = parseExpenseText("120 อาหารเช้า");
    expect(p.split).toBeUndefined();
    expect(p.category).toBe("อาหาร");
  });

  it("offers every distinct number as a candidate when there is more than one, keeping them in the note", () => {
    expect(parseExpenseText("50 ข้าว 30 น้ำ")).toEqual({ amountCandidates: [50, 30], category: "อาหาร", note: "50 ข้าว 30 น้ำ" });
  });

  it("does not read 7-11 as numbers", () => {
    expect(parseExpenseText("80 เซเว่น 7-11")).toEqual({ amount: 80, amountCandidates: [], category: "ช้อป", note: "เซเว่น 7-11" });
  });

  it("never uses 0 as the amount", () => {
    expect(parseExpenseText("0 ข้าว").amount).toBeUndefined();
  });
});

describe("parseNumber", () => {
  it("returns the first number, commas removed, zero included", () => {
    expect(parseNumber("1,200")).toBe(1200);
    expect(parseNumber("ฝากให้ 20.5 นะ")).toBe(20.5);
    expect(parseNumber("0")).toBe(0);
    expect(parseNumber("ไม่มี")).toBeNull();
  });
});

describe("resolveCurrency", () => {
  it("accepts a whole-answer alias or supported code", () => {
    expect(resolveCurrency("HKD")).toBe("HKD");
    expect(resolveCurrency(" hk ")).toBe("HKD");
    expect(resolveCurrency("บาท")).toBe("THB");
    expect(resolveCurrency("฿")).toBe("THB");
    expect(resolveCurrency("jpy")).toBe("JPY");
  });

  it("rejects anything that is not just a currency", () => {
    expect(resolveCurrency("hkd อะ")).toBeNull();
    expect(resolveCurrency("ข้าว")).toBeNull();
  });
});

describe("parseSplitWord", () => {
  it("maps exact split answers", () => {
    expect(parseSplitWord("ไม่หาร")).toBe("none");
    expect(parseSplitWord("หาร")).toBe("equal");
    expect(parseSplitWord("หารเท่า")).toBe("equal");
    expect(parseSplitWord("หารไม่เท่า")).toBe("unequal");
    expect(parseSplitWord("หารกัน")).toBeNull();
  });
});

describe("guessCategory", () => {
  it("picks the keyword that appears first, ignoring case", () => {
    expect(guessCategory("ตั๋วรถ")).toBe("ตั๋ว");
    expect(guessCategory("ค่ารถ")).toBe("เดินทาง");
    expect(guessCategory("Taxi")).toBe("เดินทาง");
    expect(guessCategory("dim sum")).toBe("อาหาร");
    expect(guessCategory("Airbnb")).toBe("ที่พัก");
    expect(guessCategory("ไม่รู้")).toBe("อื่นๆ");
  });
});

describe("removeNumberToken", () => {
  it("removes the first token with that value and tidies spaces", () => {
    expect(removeNumberToken("50 ข้าว 30 น้ำ", 30)).toBe("50 ข้าว น้ำ");
    expect(removeNumberToken("1,200 ค่าห้อง 300", 1200)).toBe("ค่าห้อง 300");
    expect(removeNumberToken("ข้าว", 5)).toBe("ข้าว");
  });
});

describe("expenseCommand", () => {
  it("recognises the flow commands exactly", () => {
    expect(expenseCommand("ยกเลิก")).toBe("cancel");
    expect(expenseCommand(" ทำต่อ ")).toBe("resume");
    expect(expenseCommand("แก้ล่าสุด")).toBe("edit_last");
    expect(expenseCommand("ย้อน")).toBe("back");
    expect(expenseCommand("↩ ย้อน")).toBe("back");
    expect(expenseCommand("ยกเลิกนัด")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-expense-parse.test.ts`
Expected: FAIL. `Failed to resolve import "./line-expense-parse"`

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-expense-parse.test.ts`
Expected: PASS (all tests green)

Type check (must pass at every commit; Vercel type-checks `main`):

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add lib/line-expense-parse.ts lib/line-expense-parse.test.ts
git commit -m "feat: parse LINE expense text into amount, currency, split, category, note" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Flow state core (`lib/line-expense-flow.ts`, part 1)

**Files:**
- Create: `lib/line-expense-flow.ts`
- Test: `lib/line-expense-flow.test.ts`

**Interfaces:**
- Consumes: `ParsedExpense`, `SplitMode` (Task 1); `convertToTHB` from `@/lib/fx`; `buildPendingExpense` from `@/lib/pending-expense`; `Expense`, `ExpenseSplit` from `@/lib/models/types`
- Produces:
  - `type FlowStep = "payer" | "amount" | "currency" | "split" | "partner" | "owed" | "category" | "note" | "summary" | "edit" | "confirm_cancel" | "conflict"`; `isFlowStep(s: string): s is FlowStep`
  - `type EditField = "amount" | "currency" | "payer" | "split" | "category" | "note"`
  - `interface FlowData { asker?; amountCandidates?: number[]; currencyConfirmed?: boolean; rateCurrency?: string; fxFailed?: boolean; splitMode?: SplitMode; lockedSplits?: boolean; partner?: string; owedAmount?: number; owedZero?: boolean; prevSteps?: FlowStep[]; editing?: boolean; resumeStep?: FlowStep; pendingText?: string; pendingPhotoId?: string }`
  - `interface FlowState { expense: Expense; step: FlowStep; data: FlowData }`
  - `interface FlowEnv { members: string[]; tripCurrency: string; homeCurrency: string }`
  - `round2(n)`, `ceil2(n)`, `fmtNum(n): string`
  - `otherMembers(payer, members): string[]`, `partnerFor(payer, data, members): string | undefined`
  - `validateOwed(owed, amount): "zero" | "over" | "ok"`
  - `buildSplits(mode: SplitMode, amountThb: number, owedThb: number, partner: string): ExpenseSplit[]`
  - `nextMissingStep(expense: Expense, data: FlowData, members: string[]): FlowStep`
  - `initialState(p: { id: string; tripId: string; now: string; tripCurrency: string; parsed: ParsedExpense; payer: string; photoId?: string; asker?: string }, members: string[]): FlowState`
  - `stateFromExpense(expense: Expense, members: string[], tripCurrency: string, asker?: string): FlowState`
  - `needsRate(st: FlowState): boolean`, `withRate(st: FlowState, rate: number, failed: boolean): FlowState`, `finalize(st: FlowState, members: string[]): FlowState`
  - `enterConflict(st: FlowState, p: { text?: string; photoId?: string }): FlowState`, `attachPhoto(st: FlowState, photoId: string): FlowState`

- [ ] **Step 1: Write the failing test**

```ts
// lib/line-expense-flow.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import { parseExpenseText } from "./line-expense-parse";
import {
  attachPhoto,
  buildSplits,
  ceil2,
  enterConflict,
  finalize,
  fmtNum,
  initialState,
  isFlowStep,
  needsRate,
  nextMissingStep,
  partnerFor,
  stateFromExpense,
  validateOwed,
  withRate,
  type FlowData,
  type FlowState,
} from "./line-expense-flow";

const M = ["เก่ง", "โอ"];
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อื่นๆ", description: "",
  amount: 0, currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: [], splits: [], pending: true,
  ...over,
});
const split = (name: string, amount_thb: number) => ({ name, amount_thb, paid: false, paid_slip_photo_ids: [] });

describe("rounding and formatting", () => {
  it("ceil2 rounds up to the satang without float noise", () => {
    expect(ceil2(270.005)).toBe(270.01);
    expect(ceil2(270)).toBe(270);
    expect(ceil2(100 / 3)).toBe(33.34);
  });

  it("fmtNum groups thousands and keeps up to 2 decimals", () => {
    expect(fmtNum(1200)).toBe("1,200");
    expect(fmtNum(12.5)).toBe("12.5");
  });

  it("isFlowStep recognises only flow steps", () => {
    expect(isFlowStep("owed")).toBe(true);
    expect(isFlowStep("awaiting_name")).toBe(false);
  });
});

describe("buildSplits", () => {
  it("stores nothing for ไม่หาร", () => {
    expect(buildSplits("none", 540, 0, "โอ")).toEqual([]);
  });

  it("rounds the other person's half up for หารเท่า", () => {
    expect(buildSplits("equal", 540.01, 0, "โอ")).toEqual([split("โอ", 270.01)]);
  });

  it("stores the owed THB for หารไม่เท่า, including owing the whole amount", () => {
    expect(buildSplits("unequal", 500, 20, "โอ")).toEqual([split("โอ", 20)]);
    expect(buildSplits("unequal", 500, 500, "โอ")).toEqual([split("โอ", 500)]);
  });
});

describe("validateOwed", () => {
  it("flags zero and over-total, accepts up to the total", () => {
    expect(validateOwed(0, 500)).toBe("zero");
    expect(validateOwed(501, 500)).toBe("over");
    expect(validateOwed(500, 500)).toBe("ok");
    expect(validateOwed(20, 500)).toBe("ok");
  });
});

describe("partnerFor", () => {
  it("is the only other member in a 2-person trip", () => {
    expect(partnerFor("เก่ง", {}, M)).toBe("โอ");
  });

  it("needs an explicit pick when there are more members, and ignores a pick equal to the payer", () => {
    const three = ["เก่ง", "โอ", "ต้น"];
    expect(partnerFor("เก่ง", {}, three)).toBeUndefined();
    expect(partnerFor("เก่ง", { partner: "ต้น" }, three)).toBe("ต้น");
    expect(partnerFor("เก่ง", { partner: "เก่ง" }, three)).toBeUndefined();
  });
});

describe("nextMissingStep", () => {
  const d = (over: FlowData = {}): FlowData => ({ currencyConfirmed: true, ...over });

  it("asks in order payer → amount → currency → split", () => {
    expect(nextMissingStep(exp(), {}, M)).toBe("payer");
    expect(nextMissingStep(exp({ payer: "เก่ง" }), {}, M)).toBe("amount");
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), {}, M)).toBe("currency");
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d(), M)).toBe("split");
  });

  it("is complete once the split is known", () => {
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d({ splitMode: "none" }), M)).toBe("summary");
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d({ splitMode: "equal" }), M)).toBe("summary");
  });

  it("asks who to split with when the trip does not have exactly 2 members", () => {
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d({ splitMode: "equal" }), ["เก่ง", "โอ", "ต้น"])).toBe("partner");
  });

  it("needs a valid owed amount for หารไม่เท่า", () => {
    const e = exp({ payer: "เก่ง", amount: 500 });
    expect(nextMissingStep(e, d({ splitMode: "unequal" }), M)).toBe("owed");
    expect(nextMissingStep(e, d({ splitMode: "unequal", owedAmount: 600 }), M)).toBe("owed");
    expect(nextMissingStep(e, d({ splitMode: "unequal", owedAmount: 20 }), M)).toBe("summary");
  });

  it("treats splits it cannot edit (more than one person) as done", () => {
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d({ lockedSplits: true }), M)).toBe("summary");
  });
});

describe("initialState", () => {
  const base = { id: "e1", tripId: "t1", now: "2026-11-21T03:00:00.000Z", tripCurrency: "HKD" };

  it("goes straight to the summary when the text says everything", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("120 HKD ข้าว หาร"), payer: "เก่ง" }, M);
    expect(st.step).toBe("summary");
    expect(st.expense).toEqual(exp({ payer: "เก่ง", amount: 120, currency: "HKD", category: "อาหาร", description: "ข้าว" }));
    expect(st.data).toEqual({ prevSteps: [], currencyConfirmed: true, splitMode: "equal" });
  });

  it("starts a photo-only draft by asking who paid when the name did not match", () => {
    const st = initialState({ ...base, parsed: parseExpenseText(""), payer: "", photoId: "p1", asker: "Kengz" }, M);
    expect(st.step).toBe("payer");
    expect(st.expense.slip_photo_ids).toEqual(["p1"]);
    expect(st.expense.currency).toBe("HKD");
    expect(st.data).toEqual({ prevSteps: [], asker: "Kengz" });
  });

  it("keeps amount candidates for the picker", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("50 ข้าว 30 น้ำ"), payer: "เก่ง" }, M);
    expect(st.step).toBe("amount");
    expect(st.data.amountCandidates).toEqual([50, 30]);
  });

  it("turns a typed ฝาก 0 into the zero-owed prompt", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("500 บาท ฝาก 0"), payer: "เก่ง" }, M);
    expect(st.step).toBe("owed");
    expect(st.data.owedZero).toBe(true);
    expect(st.data.owedAmount).toBeUndefined();
  });
});

describe("stateFromExpense", () => {
  const done = (over: Partial<Expense>) => exp({ payer: "เก่ง", amount: 120, fx_rate: 4.5, amount_thb: 540, pending: false, ...over });

  it("recognises an equal split on a confirmed expense", () => {
    const st = stateFromExpense(done({ splits: [split("โอ", 270)] }), M, "HKD", "เก่ง");
    expect(st.step).toBe("summary");
    expect(st.data).toEqual({ prevSteps: [], asker: "เก่ง", currencyConfirmed: true, rateCurrency: "HKD", splitMode: "equal", partner: "โอ" });
  });

  it("recovers the owed amount in the expense currency for an unequal split", () => {
    const st = stateFromExpense(done({ amount: 500, amount_thb: 2250, splits: [split("โอ", 90)] }), M, "HKD");
    expect(st.data.splitMode).toBe("unequal");
    expect(st.data.owedAmount).toBe(20);
  });

  it("recognises no split, and locks splits shared by more than one person", () => {
    expect(stateFromExpense(done({}), M, "HKD").data.splitMode).toBe("none");
    expect(stateFromExpense(done({ splits: [split("โอ", 100), split("ต้น", 100)] }), M, "HKD").data.lockedSplits).toBe(true);
  });

  it("resumes an untouched pending draft at the first missing step", () => {
    const st = stateFromExpense(exp({ payer: "เก่ง" }), M, "HKD");
    expect(st.step).toBe("amount");
    expect(st.data.currencyConfirmed).toBeUndefined();
  });

  it("treats a parked draft's currency as chosen when the row shows it", () => {
    // HKD chosen in a HKD trip: the fetched rate gives it away.
    const fetched = stateFromExpense(exp({ payer: "เก่ง", amount: 120, fx_rate: 4.5, amount_thb: 540 }), M, "HKD");
    expect(fetched.step).toBe("split");
    expect(fetched.data).toMatchObject({ currencyConfirmed: true, rateCurrency: "HKD" });
    // THB chosen in a HKD trip: the currency differs from the trip default.
    expect(stateFromExpense(exp({ payer: "เก่ง", amount: 120, currency: "THB" }), M, "HKD").step).toBe("split");
    // Rate fetch failed (rate 1) but amount_thb was filled: confirmed, and the rate is fetched again.
    const failed = stateFromExpense(exp({ payer: "เก่ง", amount: 120, amount_thb: 120 }), M, "HKD");
    expect(failed.data.currencyConfirmed).toBe(true);
    expect(failed.data.rateCurrency).toBeUndefined();
  });

  it("still asks the currency when the draft only has the trip default", () => {
    expect(stateFromExpense(exp({ payer: "เก่ง", amount: 120 }), M, "HKD").step).toBe("currency");
  });
});

describe("rate and finalize", () => {
  const st = (e: Partial<Expense>, d: FlowData): FlowState => ({ expense: exp({ payer: "เก่ง", ...e }), step: "summary", data: d });

  it("needs a rate once amount and currency are both known, until fetched", () => {
    expect(needsRate(st({ amount: 120 }, { currencyConfirmed: true }))).toBe(true);
    expect(needsRate(st({ amount: 120 }, {}))).toBe(false);
    expect(needsRate(withRate(st({ amount: 120 }, { currencyConfirmed: true }), 4.5, false))).toBe(false);
  });

  it("withRate records the rate, the currency it is for, and failure", () => {
    const r = withRate(st({ amount: 120 }, { currencyConfirmed: true }), 1, true);
    expect(r.expense.fx_rate).toBe(1);
    expect(r.data.rateCurrency).toBe("HKD");
    expect(r.data.fxFailed).toBe(true);
  });

  it("computes amount_thb and the splits", () => {
    const c = { currencyConfirmed: true } as const;
    expect(finalize(st({ amount: 120, fx_rate: 4.5 }, { ...c, splitMode: "equal" }), M).expense).toMatchObject({ amount_thb: 540, splits: [split("โอ", 270)] });
    expect(finalize(st({ amount: 120, fx_rate: 4.5, splits: [split("โอ", 1)] }, { ...c, splitMode: "none" }), M).expense.splits).toEqual([]);
    expect(finalize(st({ amount: 500, fx_rate: 4.5 }, { ...c, splitMode: "unequal", owedAmount: 20 }), M).expense.splits).toEqual([split("โอ", 90)]);
  });

  it("leaves amount_thb at 0 until the currency is confirmed", () => {
    expect(finalize(st({ amount: 120, fx_rate: 1 }, {}), M).expense.amount_thb).toBe(0);
  });

  it("carries paid / paid_slip_photo_ids over to the rebuilt split for the same person, even if the amount changed", () => {
    const paid = { name: "โอ", amount_thb: 270, paid: true, paid_slip_photo_ids: ["s1"] };
    expect(finalize(st({ amount: 200, fx_rate: 4.5, splits: [paid] }, { currencyConfirmed: true, splitMode: "equal" }), M).expense.splits)
      .toEqual([{ name: "โอ", amount_thb: 450, paid: true, paid_slip_photo_ids: ["s1"] }]);
  });

  it("never touches locked splits", () => {
    const many = [split("โอ", 100), split("ต้น", 100)];
    expect(finalize(st({ amount: 120, fx_rate: 4.5, splits: many }, { lockedSplits: true }), M).expense.splits).toEqual(many);
  });
});

describe("enterConflict / attachPhoto", () => {
  const s: FlowState = { expense: exp({ payer: "เก่ง", amount: 120 }), step: "split", data: { prevSteps: ["currency"] } };

  it("remembers where to resume and what to start next", () => {
    const c = enterConflict(s, { text: "50 กาแฟ" });
    expect(c.step).toBe("conflict");
    expect(c.data.resumeStep).toBe("split");
    expect(c.data.pendingText).toBe("50 กาแฟ");
    expect(enterConflict(c, { photoId: "p2" }).data.resumeStep).toBe("split");
  });

  it("attaches a photo", () => {
    expect(attachPhoto(s, "p1").expense.slip_photo_ids).toEqual(["p1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-expense-flow.test.ts`
Expected: FAIL. `Failed to resolve import "./line-expense-flow"`

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-expense-flow.test.ts`
Expected: PASS

Type check (must pass at every commit; Vercel type-checks `main`):

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add lib/line-expense-flow.ts lib/line-expense-flow.test.ts
git commit -m "feat: expense flow state core (next step, splits, rate, finalize)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Answers and the reducer (`lib/line-expense-flow.ts`, part 2)

**Files:**
- Modify: `lib/line-expense-flow.ts` (replace the import block at the top; append new code at the end)
- Test: `lib/line-expense-flow-answers.test.ts`

**Interfaces:**
- Consumes: everything from Task 2; `expenseCommand`, `guessCategory`, `parseExpenseText`, `parseNumber`, `parseSplitWord`, `removeNumberToken`, `resolveCurrency` (Task 1); `SUPPORTED_CURRENCIES` from `@/lib/fx`; `CATS` from `@/lib/categories`; `isViewCommand(text): boolean` from `@/lib/line-router` (foundation: แพลน/plan/ต่อไป/next/ตอนนี้/now/#n/เมนู/exact "?"/ข้อมูล/ข้อมูลด่วน/โน้ต/โน๊ต, same matching as the router)
- Produces:
  - `type Answer = { k: "cancel" } | { k: "back" } | { k: "resume" } | { k: "payer"; name: string } | { k: "amount"; amount: number; note?: string } | { k: "currency"; code: string } | { k: "split"; mode: SplitMode } | { k: "partner"; name: string } | { k: "owed"; amount: number } | { k: "owed_none" } | { k: "owed_retry" } | { k: "category"; category: Category } | { k: "note"; text: string } | { k: "confirm" } | { k: "edit" } | { k: "editfield"; field: EditField } | { k: "cancel_delete" } | { k: "cancel_keep" } | { k: "conflict_resume" } | { k: "conflict_park" } | { k: "conflict_drop" }`
  - `type Outcome = { k: "ask"; state: FlowState; notice?: string } | { k: "confirm"; expense: Expense } | { k: "delete" } | { k: "keep" } | { k: "park"; pendingText?: string; pendingPhotoId?: string } | { k: "drop"; pendingText?: string; pendingPhotoId?: string }`
  - `interpretAnswer(step: FlowStep, data: FlowData, text: string, members: string[], amountKnown = false): Answer | null`
  - `postbackToAnswer(d: Record<string, string>): Answer | null`
  - `applyAnswer(st: FlowState, ans: Answer, env: FlowEnv): Outcome`

Postback actions handled (`a`): `x_payer x_amount x_currency x_split x_partner x_owed_zero x_category x_back x_confirm x_edit x_editfield x_cancel x_cancel_delete x_cancel_keep x_conflict_resume x_conflict_park x_conflict_drop`.

Behavior rules (all in `applyAnswer`):
- `cancel` at `summary` on a **pending draft** (🗑 ยกเลิก on the card, or typed `ยกเลิก` there) → `delete`. On a **confirmed** expense (`pending: false`, opened via `แก้ล่าสุด`) it always goes to `confirm_cancel` first (buttons [ลบรายการนี้][ไม่ลบ]). At any other step it goes to `confirm_cancel` and remembers `resumeStep`. At `confirm_cancel` / `conflict` it re-asks. `cancel_keep` on a confirmed expense only ends the session and leaves the row as it is (handler, Task 5).
- `note` (free text) refuses the router's view commands (foundation `isViewCommand`), so `แพลน` / `#2` / `ข้อมูล …` still reach their feature and the flow stays put.
- `payer` with no member match: if the expense has no amount yet (`amountKnown === false`) and the text has a number > 0, it is an `amount` answer. The amount is saved and the payer is asked again, instead of the router seeing a conflict. Leftover words (`50 กาแฟ` → `กาแฟ`) become the note if it is still empty, and the category is re-guessed from them.
- `back` / `resume` at `confirm_cancel` / `conflict` → return to `resumeStep`. Otherwise `back` pops `prevSteps` (re-asks if empty). `resume` (typed `ทำต่อ`) re-asks the current step.
- Any accepted field answer → next step = `nextMissingStep` (so after an edit it returns to the summary). The step being left is pushed onto `prevSteps` (max 10). It is not pushed when entering or leaving `confirm_cancel` / `conflict`.
- `amount ≤ 0` → re-ask with notice `ยอดต้องมากกว่า 0 นะ`. Picking a candidate removes that number from the note.
- `owed`: 0 → `owedZero` prompt (buttons [เปลี่ยนเป็นไม่หาร][↩ ใส่ใหม่]). Over the total → notice `เกินยอดรวม {amount} ใส่ใหม่นะ`. Equal to the total is accepted.
- `split` ≠ none with no other member → notice `ทริปนี้ไม่มีสมาชิกคนอื่นให้หาร`. Answering split always clears `owedAmount` / `lockedSplits`.
- `confirm` only at `summary`, and only if `nextMissingStep` is `summary` (otherwise it jumps to the missing step).

- [ ] **Step 1: Write the failing test**

```ts
// lib/line-expense-flow-answers.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import {
  applyAnswer,
  interpretAnswer,
  postbackToAnswer,
  type FlowData,
  type FlowEnv,
  type FlowState,
  type FlowStep,
  type Outcome,
} from "./line-expense-flow";

const env: FlowEnv = { members: ["เก่ง", "โอ"], tripCurrency: "HKD", homeCurrency: "THB" };
const env3: FlowEnv = { ...env, members: ["เก่ง", "โอ", "ต้น"] };

const full = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อื่นๆ", description: "",
  amount: 500, currency: "THB", fx_rate: 1, amount_thb: 500, payer: "เก่ง", slip_photo_ids: [], splits: [], pending: true,
  ...over,
});
const S = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}): FlowState => ({
  expense: full(e), step, data: { prevSteps: [], currencyConfirmed: true, splitMode: "none", ...d },
});
const asked = (o: Outcome): FlowState => {
  if (o.k !== "ask") throw new Error(`expected ask, got ${o.k}`);
  return o.state;
};

describe("interpretAnswer", () => {
  const d: FlowData = {};

  it("accepts the global commands at any step", () => {
    expect(interpretAnswer("amount", d, "ยกเลิก", env.members)).toEqual({ k: "cancel" });
    expect(interpretAnswer("split", d, "↩ ย้อน", env.members)).toEqual({ k: "back" });
    expect(interpretAnswer("currency", d, "ทำต่อ", env.members)).toEqual({ k: "resume" });
  });

  it("payer: member names only, or any name when the trip has no members", () => {
    expect(interpretAnswer("payer", d, "โอ", env.members)).toEqual({ k: "payer", name: "โอ" });
    expect(interpretAnswer("payer", d, "สวัสดี", env.members)).toBeNull();
    expect(interpretAnswer("payer", d, "แม่", [])).toEqual({ k: "payer", name: "แม่" });
  });

  it("amount: any number (0 included so it is answered, not treated as a new entry)", () => {
    expect(interpretAnswer("amount", d, "1,200", env.members)).toEqual({ k: "amount", amount: 1200 });
    expect(interpretAnswer("amount", d, "0", env.members)).toEqual({ k: "amount", amount: 0 });
    expect(interpretAnswer("amount", d, "ข้าว", env.members)).toBeNull();
  });

  it("currency / split / category use their exact words", () => {
    expect(interpretAnswer("currency", d, "hk", env.members)).toEqual({ k: "currency", code: "HKD" });
    expect(interpretAnswer("currency", d, "ข้าว", env.members)).toBeNull();
    expect(interpretAnswer("split", d, "ไม่หาร", env.members)).toEqual({ k: "split", mode: "none" });
    expect(interpretAnswer("split", d, "หารกัน", env.members)).toBeNull();
    expect(interpretAnswer("category", d, "ตั๋ว", env.members)).toEqual({ k: "category", category: "ตั๋ว" });
  });

  it("owed: numbers, plus the two zero-prompt choices", () => {
    expect(interpretAnswer("owed", d, "20", env.members)).toEqual({ k: "owed", amount: 20 });
    expect(interpretAnswer("owed", { owedZero: true }, "เปลี่ยนเป็นไม่หาร", env.members)).toEqual({ k: "owed_none" });
    expect(interpretAnswer("owed", { owedZero: true }, "ใส่ใหม่", env.members)).toEqual({ k: "owed_retry" });
  });

  it("note: any text; '-' clears it", () => {
    expect(interpretAnswer("note", d, "ข้าวมันไก่", env.members)).toEqual({ k: "note", text: "ข้าวมันไก่" });
    expect(interpretAnswer("note", d, "-", env.members)).toEqual({ k: "note", text: "" });
  });

  it("payer: a bare number fills a missing amount, but is not an answer once the amount is known", () => {
    expect(interpretAnswer("payer", d, "120", env.members)).toEqual({ k: "amount", amount: 120 });
    expect(interpretAnswer("payer", d, "50 กาแฟ", env.members)).toEqual({ k: "amount", amount: 50, note: "กาแฟ" });
    expect(interpretAnswer("payer", d, "120", env.members, true)).toBeNull();
    expect(interpretAnswer("payer", d, "120", [])).toEqual({ k: "amount", amount: 120 });
  });

  it("note: refuses the router's view commands so they still route", () => {
    expect(interpretAnswer("note", d, "แพลน", env.members)).toBeNull();
    expect(interpretAnswer("note", d, "#2", env.members)).toBeNull();
    expect(interpretAnswer("note", d, "ขอดูข้อมูล wifi", env.members)).toBeNull();
    expect(interpretAnswer("note", d, "plan", env.members)).toBeNull();
    expect(interpretAnswer("note", d, "ข้าวมันไก่ร้านดัง", env.members)).toEqual({ k: "note", text: "ข้าวมันไก่ร้านดัง" });
  });

  it("button steps accept their labels typed out", () => {
    expect(interpretAnswer("summary", d, "ยืนยัน", env.members)).toEqual({ k: "confirm" });
    expect(interpretAnswer("summary", d, "แก้", env.members)).toEqual({ k: "edit" });
    expect(interpretAnswer("edit", d, "หมวด", env.members)).toEqual({ k: "editfield", field: "category" });
    expect(interpretAnswer("confirm_cancel", d, "ลบทิ้ง", env.members)).toEqual({ k: "cancel_delete" });
    expect(interpretAnswer("confirm_cancel", d, "เก็บไว้กรอกทีหลัง", env.members)).toEqual({ k: "cancel_keep" });
    expect(interpretAnswer("confirm_cancel", d, "ลบรายการนี้", env.members)).toEqual({ k: "cancel_delete" });
    expect(interpretAnswer("confirm_cancel", d, "ไม่ลบ", env.members)).toEqual({ k: "cancel_keep" });
    expect(interpretAnswer("conflict", d, "ทิ้งอันเก่า", env.members)).toEqual({ k: "conflict_drop" });
    expect(interpretAnswer("conflict", d, "เก็บไว้ เริ่มใหม่", env.members)).toEqual({ k: "conflict_park" });
    expect(interpretAnswer("summary", d, "โอเค", env.members)).toBeNull();
  });
});

describe("postbackToAnswer", () => {
  it("maps x_ actions and validates values", () => {
    expect(postbackToAnswer({ a: "x_payer", v: "โอ" })).toEqual({ k: "payer", name: "โอ" });
    expect(postbackToAnswer({ a: "x_amount", v: "30" })).toEqual({ k: "amount", amount: 30 });
    expect(postbackToAnswer({ a: "x_split", v: "bogus" })).toBeNull();
    expect(postbackToAnswer({ a: "x_back" })).toEqual({ k: "back" });
    expect(postbackToAnswer({ a: "x_editfield", v: "note" })).toEqual({ k: "editfield", field: "note" });
    expect(postbackToAnswer({ a: "x_owed_zero", v: "retry" })).toEqual({ k: "owed_retry" });
    expect(postbackToAnswer({ a: "plan_day" })).toBeNull();
  });
});

describe("applyAnswer: cancel / back / resume", () => {
  it("🗑 on a draft's summary deletes right away", () => {
    expect(applyAnswer(S("summary"), { k: "cancel" }, env)).toEqual({ k: "delete" });
  });

  it("🗑 on a confirmed expense's summary asks first and returns to the summary on back", () => {
    const st = asked(applyAnswer(S("summary", { pending: false }), { k: "cancel" }, env));
    expect(st.step).toBe("confirm_cancel");
    expect(st.data.resumeStep).toBe("summary");
    expect(asked(applyAnswer(st, { k: "back" }, env)).step).toBe("summary");
    expect(applyAnswer(st, { k: "cancel_keep" }, env)).toEqual({ k: "keep" });
  });

  it("ยกเลิก mid-flow asks delete-or-keep and remembers where it was", () => {
    const st = asked(applyAnswer(S("split", {}, { splitMode: undefined }), { k: "cancel" }, env));
    expect(st.step).toBe("confirm_cancel");
    expect(st.data.resumeStep).toBe("split");
    expect(st.data.prevSteps).toEqual([]);
  });

  it("back from the cancel prompt returns to the remembered step", () => {
    const st = asked(applyAnswer(S("confirm_cancel", {}, { resumeStep: "split", splitMode: undefined }), { k: "back" }, env));
    expect(st.step).toBe("split");
    expect(st.data.resumeStep).toBeUndefined();
  });

  it("back pops the previous step; with nothing to pop it re-asks", () => {
    const st = asked(applyAnswer(S("currency", {}, { prevSteps: ["payer", "amount"], currencyConfirmed: undefined }), { k: "back" }, env));
    expect(st.step).toBe("amount");
    expect(st.data.prevSteps).toEqual(["payer"]);
    expect(asked(applyAnswer(S("payer", { payer: "" }), { k: "back" }, env)).step).toBe("payer");
  });

  it("ทำต่อ re-asks the current step", () => {
    expect(asked(applyAnswer(S("split", {}, { splitMode: undefined }), { k: "resume" }, env)).step).toBe("split");
  });
});

describe("applyAnswer: fields", () => {
  it("payer moves on to the first missing step and records the back step", () => {
    const st = asked(applyAnswer(S("payer", { payer: "" }), { k: "payer", name: "เก่ง" }, env));
    expect(st.expense.payer).toBe("เก่ง");
    expect(st.step).toBe("summary");
    expect(st.data.prevSteps).toEqual(["payer"]);
  });

  it("payer rejects non-members and clears a partner who is now the payer", () => {
    expect(asked(applyAnswer(S("payer", { payer: "" }), { k: "payer", name: "ใครก็ไม่รู้" }, env)).step).toBe("payer");
    const st = asked(applyAnswer(S("payer", { payer: "" }, { splitMode: "equal", partner: "โอ" }), { k: "payer", name: "โอ" }, env3));
    expect(st.data.partner).toBeUndefined();
    expect(st.step).toBe("partner");
  });

  it("a number typed at the payer step fills the amount and asks the payer again", () => {
    const st = asked(applyAnswer(S("payer", { payer: "", amount: 0 }, { currencyConfirmed: undefined }), { k: "amount", amount: 120 }, env));
    expect(st.expense.amount).toBe(120);
    expect(st.step).toBe("payer");
    expect(st.data.prevSteps).toEqual([]);
  });

  it("words typed with the amount at the payer step seed an empty note and re-guess the category", () => {
    const st = asked(applyAnswer(S("payer", { payer: "", amount: 0, description: "", category: "อื่นๆ" }), { k: "amount", amount: 50, note: "กาแฟ" }, env));
    expect(st.expense).toMatchObject({ amount: 50, description: "กาแฟ", category: "อาหาร" });
    expect(st.step).toBe("payer");
    const kept = asked(applyAnswer(S("payer", { payer: "", amount: 0, description: "แท็กซี่", category: "เดินทาง" }), { k: "amount", amount: 50, note: "กาแฟ" }, env));
    expect(kept.expense).toMatchObject({ description: "แท็กซี่", category: "เดินทาง" });
  });

  it("amount must be positive", () => {
    const o = applyAnswer(S("amount", { amount: 0 }), { k: "amount", amount: 0 }, env);
    expect(o).toMatchObject({ k: "ask", notice: "ยอดต้องมากกว่า 0 นะ" });
    expect(asked(o).step).toBe("amount");
  });

  it("picking a candidate removes it from the note and clears the picker", () => {
    const st = asked(applyAnswer(
      S("amount", { amount: 0, description: "50 ข้าว 30 น้ำ" }, { amountCandidates: [50, 30], currencyConfirmed: undefined }),
      { k: "amount", amount: 30 }, env,
    ));
    expect(st.expense.amount).toBe(30);
    expect(st.expense.description).toBe("50 ข้าว น้ำ");
    expect(st.data.amountCandidates).toBeUndefined();
    expect(st.step).toBe("currency");
  });

  it("currency accepts supported codes only", () => {
    const base = S("currency", {}, { currencyConfirmed: undefined, splitMode: undefined });
    expect(asked(applyAnswer(base, { k: "currency", code: "XXX" }, env)).step).toBe("currency");
    const st = asked(applyAnswer(base, { k: "currency", code: "HKD" }, env));
    expect(st.expense.currency).toBe("HKD");
    expect(st.data.currencyConfirmed).toBe(true);
    expect(st.step).toBe("split");
  });

  it("split: equal is complete in a 2-person trip, unequal asks the owed amount", () => {
    const base = S("split", {}, { splitMode: undefined });
    expect(asked(applyAnswer(base, { k: "split", mode: "equal" }, env)).step).toBe("summary");
    expect(asked(applyAnswer(base, { k: "split", mode: "unequal" }, env)).step).toBe("owed");
  });

  it("split refuses to split when nobody else is on the trip", () => {
    const o = applyAnswer(S("split", {}, { splitMode: undefined }), { k: "split", mode: "equal" }, { ...env, members: ["เก่ง"] });
    expect(o).toMatchObject({ k: "ask", notice: "ทริปนี้ไม่มีสมาชิกคนอื่นให้หาร" });
  });

  it("split in a 3-person trip asks who, and only accepts a non-payer", () => {
    const st = asked(applyAnswer(S("split", {}, { splitMode: undefined }), { k: "split", mode: "equal" }, env3));
    expect(st.step).toBe("partner");
    expect(asked(applyAnswer(st, { k: "partner", name: "เก่ง" }, env3)).step).toBe("partner");
    const done = asked(applyAnswer(st, { k: "partner", name: "ต้น" }, env3));
    expect(done.data.partner).toBe("ต้น");
    expect(done.step).toBe("summary");
  });

  it("owed: 0 prompts, over-total re-asks, equal-to-total is accepted", () => {
    const base = S("owed", { amount: 500 }, { splitMode: "unequal" });
    const zero = asked(applyAnswer(base, { k: "owed", amount: 0 }, env));
    expect(zero.step).toBe("owed");
    expect(zero.data.owedZero).toBe(true);
    expect(applyAnswer(base, { k: "owed", amount: 600 }, env)).toMatchObject({ k: "ask", notice: "เกินยอดรวม 500 ใส่ใหม่นะ" });
    const ok = asked(applyAnswer(base, { k: "owed", amount: 500 }, env));
    expect(ok.data.owedAmount).toBe(500);
    expect(ok.step).toBe("summary");
  });

  it("owed zero prompt: switch to ไม่หาร or type again", () => {
    const base = S("owed", {}, { splitMode: "unequal", owedZero: true });
    const none = asked(applyAnswer(base, { k: "owed_none" }, env));
    expect(none.data.splitMode).toBe("none");
    expect(none.step).toBe("summary");
    const retry = asked(applyAnswer(base, { k: "owed_retry" }, env));
    expect(retry.data.owedZero).toBeUndefined();
    expect(retry.step).toBe("owed");
  });
});

describe("applyAnswer: summary, edit, confirm, conflict", () => {
  it("confirm finishes a complete draft", () => {
    expect(applyAnswer(S("summary"), { k: "confirm" }, env)).toEqual({ k: "confirm", expense: { ...full(), pending: false } });
  });

  it("confirm on an incomplete expense jumps to what is missing", () => {
    expect(asked(applyAnswer(S("summary", { amount: 0 }), { k: "confirm" }, env)).step).toBe("amount");
  });

  it("edit → pick field → answer → back to the summary", () => {
    const edit = asked(applyAnswer(S("summary"), { k: "edit" }, env));
    expect(edit.step).toBe("edit");
    expect(edit.data.editing).toBe(true);
    expect(edit.data.prevSteps).toEqual(["summary"]);
    const cat = asked(applyAnswer(edit, { k: "editfield", field: "category" }, env));
    expect(cat.step).toBe("category");
    expect(cat.data.prevSteps).toEqual(["summary", "edit"]);
    const back = asked(applyAnswer(cat, { k: "category", category: "ตั๋ว" }, env));
    expect(back.expense.category).toBe("ตั๋ว");
    expect(back.step).toBe("summary");
  });

  it("cancel prompt choices", () => {
    expect(applyAnswer(S("confirm_cancel"), { k: "cancel_delete" }, env)).toEqual({ k: "delete" });
    expect(applyAnswer(S("confirm_cancel"), { k: "cancel_keep" }, env)).toEqual({ k: "keep" });
  });

  it("conflict choices", () => {
    const c = S("conflict", {}, { resumeStep: "split", splitMode: undefined, pendingText: "50 ข้าว" });
    const resumed = asked(applyAnswer(c, { k: "conflict_resume" }, env));
    expect(resumed.step).toBe("split");
    expect(resumed.data.pendingText).toBeUndefined();
    expect(applyAnswer(c, { k: "conflict_park" }, env)).toEqual({ k: "park", pendingText: "50 ข้าว", pendingPhotoId: undefined });
    const p = S("conflict", {}, { resumeStep: "split", pendingPhotoId: "p9" });
    expect(applyAnswer(p, { k: "conflict_drop" }, env)).toEqual({ k: "drop", pendingText: undefined, pendingPhotoId: "p9" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-expense-flow-answers.test.ts`
Expected: FAIL. `applyAnswer is not a function` / `interpretAnswer is not a function` (exports missing)

- [ ] **Step 3a: Replace the import block at the top of `lib/line-expense-flow.ts`**

Replace these four lines:

```ts
import type { Expense, ExpenseSplit } from "@/lib/models/types";
import { convertToTHB } from "@/lib/fx";
import { buildPendingExpense } from "@/lib/pending-expense";
import type { ParsedExpense, SplitMode } from "@/lib/line-expense-parse";
```

with:

```ts
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
```

(Keep the existing `export type { SplitMode } from "@/lib/line-expense-parse";` line.)

- [ ] **Step 3b: Append to the end of `lib/line-expense-flow.ts`**

```ts
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
```

- [ ] **Step 4: Run both flow test files**

Run: `npm test -- lib/line-expense-flow`
Expected: PASS (`lib/line-expense-flow.test.ts` and `lib/line-expense-flow-answers.test.ts`)

Type check (must pass at every commit; Vercel type-checks `main`):

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add lib/line-expense-flow.ts lib/line-expense-flow-answers.test.ts
git commit -m "feat: expense flow answers, postback mapping and reducer" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Message builders (`lib/line-expense-messages.ts`)

**Files:**
- Create: `lib/line-expense-messages.ts`
- Test: `lib/line-expense-messages.test.ts`

**Interfaces:**
- Consumes: `FlowState`, `FlowEnv`, `FlowData`, `EditField`, `fmtNum`, `round2`, `otherMembers`, `partnerFor` (Tasks 2–3); `NO_TRIP_TEXT` from `@/lib/line-menu`; from `@/lib/line-flex`: `CLAY`, `FlexNode`, `txt`, `compact`, `postbackAction`, `uriAction`, `imageUrl`, `flexMessage`, `textMessage`, `quickReply`; `CATS` from `@/lib/categories`
- Produces:
  - `MSG` (fixed copy: `noTrip`, `goneExpense`, `expiredButton`, `deleted`, `kept`, `keptConfirmed`, `parked`, `dropped`, `reask`, `photoAttached`, `nothingPending`, `noLatest`, `unknownMember`)
  - `CATEGORY_EMOJI: Record<Category, string>`
  - `amountLine(e: Expense): string`, `splitLine(e: Expense, d: FlowData): string`
  - `questionMessage(st: FlowState, env: FlowEnv, notice?: string): FlexNode`
  - `summaryCard(st: FlowState, origin: string): FlexNode`
  - `savedCard(e: Expense, d: FlowData, origin: string): FlexNode`
  - `stepMessages(st: FlowState, env: FlowEnv, origin: string, notice?: string): FlexNode[]` (summary → card, else question; notice goes first)

Every postback built here is `{ a, e: expense.id, s: current step, v? }`. Questions start with `@{asker} ` when the LINE display name is known. `↩ ย้อน` is added as the last quick reply whenever `prevSteps` is non-empty, except at `conflict` / `confirm_cancel`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/line-expense-messages.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import { decodePostback } from "./line-flex";
import type { FlowData, FlowEnv, FlowState, FlowStep } from "./line-expense-flow";
import { amountLine, questionMessage, savedCard, splitLine, stepMessages, summaryCard } from "./line-expense-messages";

const env: FlowEnv = { members: ["เก่ง", "โอ"], tripCurrency: "HKD", homeCurrency: "THB" };
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อาหาร", description: "ข้าว",
  amount: 120, currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [],
  splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }], pending: true,
  ...over,
});
const S = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}): FlowState => ({
  expense: exp(e), step, data: { prevSteps: [], asker: "เก่ง", currencyConfirmed: true, splitMode: "equal", ...d },
});

type Obj = Record<string, unknown>;
function walk(node: unknown, visit: (o: Obj) => void): void {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") {
    visit(node as Obj);
    Object.values(node).forEach((v) => walk(v, visit));
  }
}
const postbacks = (n: unknown) => {
  const out: Record<string, string>[] = [];
  walk(n, (o) => {
    if (o.type === "postback" && typeof o.data === "string") out.push({ label: String(o.label), ...decodePostback(o.data) });
  });
  return out;
};
const texts = (n: unknown) => {
  const out: string[] = [];
  walk(n, (o) => {
    if (o.type === "text") out.push(o.text as string);
  });
  return out;
};
const uris = (n: unknown) => {
  const out: string[] = [];
  walk(n, (o) => {
    if (o.type === "uri") out.push(o.uri as string);
  });
  return out;
};

describe("questionMessage", () => {
  it("asks who paid with one button per member and no back on the first question", () => {
    const msg = questionMessage(S("payer", { payer: "" }), env);
    expect(texts(msg)[0]).toBe("@เก่ง ใครจ่าย?");
    expect(postbacks(msg)).toEqual([
      { label: "เก่ง", a: "x_payer", e: "e1", s: "payer", v: "เก่ง" },
      { label: "โอ", a: "x_payer", e: "e1", s: "payer", v: "โอ" },
    ]);
  });

  it("offers trip and home currency, then ↩ ย้อน when there is a previous step", () => {
    const pbs = postbacks(questionMessage(S("currency", {}, { prevSteps: ["payer"], currencyConfirmed: undefined }), env));
    expect(pbs.map((p) => [p.a, p.v ?? ""])).toEqual([["x_currency", "HKD"], ["x_currency", "THB"], ["x_back", ""]]);
    expect(pbs.every((p) => p.s === "currency" && p.e === "e1")).toBe(true);
  });

  it("never shows ↩ ย้อน on the conflict or cancel prompts", () => {
    expect(postbacks(questionMessage(S("conflict", {}, { prevSteps: ["payer"] }), env)).map((p) => p.a))
      .toEqual(["x_conflict_resume", "x_conflict_park", "x_conflict_drop"]);
    expect(postbacks(questionMessage(S("confirm_cancel", {}, { prevSteps: ["payer"] }), env)).map((p) => p.a))
      .toEqual(["x_cancel_delete", "x_cancel_keep"]);
  });

  it("asks before deleting a confirmed expense, with [ลบรายการนี้][ไม่ลบ]", () => {
    const msg = questionMessage(S("confirm_cancel", { pending: false }), env);
    expect(texts(msg)[0]).toBe("@เก่ง รายการนี้บันทึกแล้ว ลบทิ้งจริงไหม?");
    expect(postbacks(msg).map((p) => [p.label, p.a])).toEqual([["ลบรายการนี้", "x_cancel_delete"], ["ไม่ลบ", "x_cancel_keep"]]);
  });

  it("conflict text shows the currency only once it was chosen", () => {
    expect(texts(questionMessage(S("conflict", {}, { currencyConfirmed: undefined }), env))[0]).toBe("@เก่ง มีรายการค้างอยู่ (120 ข้าว) จะทำยังไงดี?");
    expect(texts(questionMessage(S("conflict"), env))[0]).toBe("@เก่ง มีรายการค้างอยู่ (120 HKD ข้าว) จะทำยังไงดี?");
  });

  it("lists amount candidates", () => {
    const msg = questionMessage(S("amount", { amount: 0 }, { amountCandidates: [50, 30] }), env);
    expect(texts(msg)[0]).toBe("@เก่ง ยอดคือ?");
    expect(postbacks(msg).map((p) => [p.label, p.v])).toEqual([["50", "50"], ["30", "30"]]);
  });

  it("offers only ไม่หาร when nobody else is on the trip", () => {
    const pbs = postbacks(questionMessage(S("split", {}, { splitMode: undefined }), { ...env, members: ["เก่ง"] }));
    expect(pbs.map((p) => p.v)).toEqual(["none"]);
  });

  it("offers the three split modes in a 2-person trip", () => {
    const pbs = postbacks(questionMessage(S("split", {}, { splitMode: undefined }), env));
    expect(pbs.map((p) => [p.label, p.v])).toEqual([["ไม่หาร", "none"], ["หารเท่า", "equal"], ["หารไม่เท่า", "unequal"]]);
  });

  it("owed: zero prompt buttons, and the over-total warning", () => {
    const zero = postbacks(questionMessage(S("owed", {}, { splitMode: "unequal", owedZero: true }), env));
    expect(zero.map((p) => [p.a, p.v])).toEqual([["x_owed_zero", "none"], ["x_owed_zero", "retry"]]);
    const over = texts(questionMessage(S("owed", { amount: 500 }, { splitMode: "unequal", owedAmount: 600 }), env))[0];
    expect(over).toContain("เกินยอดรวม 500");
    expect(over).toContain("โอ ฝากจ่ายเท่าไหร่?");
  });

  it("puts a notice right after the @name", () => {
    expect(texts(questionMessage(S("amount", { amount: 0 }), env, "ยอดต้องมากกว่า 0 นะ"))[0])
      .toBe("@เก่ง ยอดต้องมากกว่า 0 นะ\nยอดเท่าไหร่? พิมพ์ตัวเลขมาได้เลย");
  });

  it("offers the six edit fields", () => {
    expect(postbacks(questionMessage(S("edit"), env)).map((p) => p.v)).toEqual(["amount", "currency", "payer", "split", "category", "note"]);
  });

  it("keeps every quick reply label within 20 characters", () => {
    const steps: FlowStep[] = ["payer", "amount", "currency", "split", "partner", "owed", "category", "note", "edit", "confirm_cancel", "conflict"];
    for (const step of steps) {
      for (const p of postbacks(questionMessage(S(step, {}, { prevSteps: ["payer"], owedZero: true }), env))) {
        expect(p.label.length).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe("amountLine / splitLine", () => {
  it("shows THB plainly and other currencies with the THB estimate", () => {
    expect(amountLine(exp({ currency: "THB", amount: 500, amount_thb: 500 }))).toBe("500฿");
    expect(amountLine(exp())).toBe("120 HKD (~540฿)");
  });

  it("describes each split mode", () => {
    expect(splitLine(exp({ splits: [] }), { splitMode: "none" })).toBe("⚖️ ไม่หาร");
    expect(splitLine(exp(), { splitMode: "equal" })).toBe("⚖️ หารเท่า: โอคืน 270฿");
    expect(splitLine(
      exp({ currency: "THB", amount: 500, amount_thb: 500, splits: [{ name: "โอ", amount_thb: 20, paid: false, paid_slip_photo_ids: [] }] }),
      { splitMode: "unequal", owedAmount: 20 },
    )).toBe("⚖️ หารไม่เท่า: เก่ง 480 · โอ 20 → โอคืน 20฿");
    expect(splitLine(exp(), { lockedSplits: true })).toBe("⚖️ หารหลายคน (แก้ในแอป)");
  });
});

describe("summaryCard", () => {
  it("shows the expense with confirm / edit / cancel buttons for this step", () => {
    const msg = summaryCard(S("summary", { slip_photo_ids: ["p1"] }), "https://app.test");
    expect(postbacks(msg).map((p) => [p.a, p.e, p.s])).toEqual([
      ["x_confirm", "e1", "summary"], ["x_edit", "e1", "summary"], ["x_cancel", "e1", "summary"],
    ]);
    const t = texts(msg);
    expect(t).toContain("120 HKD (~540฿)");
    expect(t).toContain("🍜 อาหาร · 📝 ข้าว");
    expect(t).toContain("👤 เก่ง จ่าย");
    expect(t).toContain("⚖️ หารเท่า: โอคืน 270฿");
    expect(JSON.stringify(msg)).toContain("https://app.test/api/img/p1");
  });

  it("never emits an empty text node, even with no note", () => {
    const t = texts(summaryCard(S("summary", { description: "" }), "https://app.test"));
    expect(t.every((x) => typeof x === "string" && x.length > 0)).toBe(true);
    expect(t).toContain("🍜 อาหาร");
  });

  it("warns when the FX rate could not be fetched", () => {
    expect(texts(summaryCard(S("summary", {}, { fxFailed: true }), "https://app.test")).join("\n")).toContain("ดึงเรตไม่ได้");
  });
});

describe("savedCard / stepMessages", () => {
  it("the saved card has no postbacks, just an open-app link", () => {
    const msg = savedCard(exp({ pending: false }), { splitMode: "equal" }, "https://app.test");
    expect(postbacks(msg)).toEqual([]);
    expect(uris(msg)).toContain("https://app.test/trips/t1/money");
    expect(texts(msg)).toContain("✅ บันทึกแล้ว");
  });

  it("summary step with a notice sends the notice first, then the card", () => {
    const msgs = stepMessages(S("summary"), env, "https://app.test", "ยังรอคำตอบข้อนี้อยู่นะ");
    expect(msgs).toHaveLength(2);
    expect(texts(msgs[0])).toEqual(["ยังรอคำตอบข้อนี้อยู่นะ"]);
    expect(postbacks(msgs[1]).map((p) => p.a)).toContain("x_confirm");
  });

  it("other steps send one question", () => {
    expect(stepMessages(S("payer", { payer: "" }), env, "https://app.test")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-expense-messages.test.ts`
Expected: FAIL. `Failed to resolve import "./line-expense-messages"`

- [ ] **Step 3: Write the implementation**

```ts
// lib/line-expense-messages.ts
import type { Category, Expense } from "@/lib/models/types";
import { CATS } from "@/lib/categories";
import { NO_TRIP_TEXT } from "@/lib/line-menu";
import {
  CLAY,
  compact,
  flexMessage,
  imageUrl,
  postbackAction,
  quickReply,
  textMessage,
  txt,
  uriAction,
  type FlexNode,
} from "@/lib/line-flex";
import {
  fmtNum,
  otherMembers,
  partnerFor,
  round2,
  type EditField,
  type FlowData,
  type FlowEnv,
  type FlowState,
} from "@/lib/line-expense-flow";

export const MSG = {
  noTrip: NO_TRIP_TEXT,
  goneExpense: "รายการนี้ถูกลบไปแล้ว",
  expiredButton: "ปุ่มนี้หมดอายุแล้ว พิมพ์ ทำต่อ เพื่อกรอกรายการที่ค้าง",
  deleted: "ลบรายการแล้ว 🗑",
  kept: 'เก็บไว้ในคิว "รอกรอก" ในแอปแล้ว พิมพ์ ทำต่อ เพื่อกรอกต่อ',
  parked: 'เก็บอันเก่าไว้ในคิว "รอกรอก" แล้ว เริ่มอันใหม่เลย',
  dropped: "ทิ้งอันเก่าแล้ว เริ่มอันใหม่เลย",
  keptConfirmed: "ไม่ลบ รายการยังอยู่เหมือนเดิม",
  reask: "ยังรอคำตอบข้อนี้อยู่นะ",
  photoAttached: "แนบรูปเข้ารายการที่ค้างแล้ว 📎",
  nothingPending: "ไม่มีรายการค้าง",
  noLatest: "ยังไม่มีรายการที่บันทึกในชื่อเรา",
  unknownMember: "ชื่อ LINE ไม่ตรงกับสมาชิกในทริป ตั้งชื่อสมาชิกในแอปให้ตรงก่อนนะ",
} as const;

export const CATEGORY_EMOJI: Record<Category, string> = {
  "อาหาร": "🍜", "เดินทาง": "🚕", "ที่พัก": "🏨", "ช้อป": "🛍️", "ตั๋ว": "🎫", "อื่นๆ": "📦",
};

type Item = { label: string; data?: Record<string, string | number | undefined>; text?: string };

const EDIT_BUTTONS: [string, EditField][] = [
  ["ยอด", "amount"], ["สกุลเงิน", "currency"], ["คนจ่าย", "payer"], ["หาร", "split"], ["หมวด", "category"], ["โน้ต", "note"],
];

function pb(st: FlowState, a: string, v?: string | number): Record<string, string | number | undefined> {
  return { a, e: st.expense.id, s: st.step, v };
}

function backItem(st: FlowState): Item[] {
  if (st.step === "conflict" || st.step === "confirm_cancel") return [];
  return (st.data.prevSteps ?? []).length > 0 ? [{ label: "↩ ย้อน", data: pb(st, "x_back") }] : [];
}

export function amountLine(e: Expense): string {
  if (e.currency === "THB") return `${fmtNum(e.amount)}฿`;
  return `${fmtNum(e.amount)} ${e.currency} (~${fmtNum(e.amount_thb)}฿)`;
}

export function splitLine(e: Expense, d: FlowData): string {
  if (d.lockedSplits) return "⚖️ หารหลายคน (แก้ในแอป)";
  if (!d.splitMode || d.splitMode === "none") return "⚖️ ไม่หาร";
  const partner = e.splits[0]?.name ?? "อีกคน";
  const owedThb = e.splits[0]?.amount_thb ?? 0;
  if (d.splitMode === "equal") return `⚖️ หารเท่า: ${partner}คืน ${fmtNum(owedThb)}฿`;
  const owed = d.owedAmount ?? 0;
  return `⚖️ หารไม่เท่า: ${e.payer} ${fmtNum(round2(e.amount - owed))} · ${partner} ${fmtNum(owed)} → ${partner}คืน ${fmtNum(owedThb)}฿`;
}

function questionText(st: FlowState, env: FlowEnv): string {
  const e = st.expense;
  const d = st.data;
  switch (st.step) {
    case "payer": return "ใครจ่าย?";
    case "amount": return d.amountCandidates?.length ? "ยอดคือ?" : "ยอดเท่าไหร่? พิมพ์ตัวเลขมาได้เลย";
    case "currency": return `${fmtNum(e.amount)} สกุลเงินอะไร?`;
    case "split": return otherMembers(e.payer, env.members).length > 0 ? "หารไหม?" : "หารไหม? (ทริปนี้มีสมาชิกคนเดียว)";
    case "partner": return "หารกับใคร?";
    case "owed": {
      if (d.owedZero) return "ฝากจ่าย 0 — เปลี่ยนเป็นไม่หารไหม?";
      const who = partnerFor(e.payer, d, env.members) ?? "อีกคน";
      const q = `${who} ฝากจ่ายเท่าไหร่? (เป็น ${e.currency} จากยอด ${fmtNum(e.amount)})`;
      return d.owedAmount != null && d.owedAmount > e.amount
        ? `ฝากจ่าย ${fmtNum(d.owedAmount)} เกินยอดรวม ${fmtNum(e.amount)} ใส่ใหม่นะ\n${q}`
        : q;
    }
    case "category": return `หมวดอะไร? (ตอนนี้: ${e.category})`;
    case "note": return `โน้ตใหม่? พิมพ์มาได้เลย (ตอนนี้: ${e.description || "-"})`;
    case "edit": return "แก้ข้อไหน?";
    case "confirm_cancel":
      return e.pending ? "ลบรายการนี้ทิ้ง หรือเก็บไว้กรอกทีหลัง?" : "รายการนี้บันทึกแล้ว ลบทิ้งจริงไหม?";
    case "conflict": {
      // The currency is only shown once chosen. A draft's currency is just the trip default until then.
      const cur = d.currencyConfirmed ? ` ${e.currency}` : "";
      const what = e.amount > 0
        ? `${fmtNum(e.amount)}${cur}${e.description ? ` ${e.description}` : ""}`
        : e.description || "ยังไม่มียอด";
      return `มีรายการค้างอยู่ (${what}) จะทำยังไงดี?`;
    }
    case "summary": return "สรุปรายการ";
  }
}

function questionItems(st: FlowState, env: FlowEnv): Item[] {
  const e = st.expense;
  const d = st.data;
  const others = otherMembers(e.payer, env.members);
  switch (st.step) {
    case "payer":
      return env.members.slice(0, 12).map((m) => ({ label: m, data: pb(st, "x_payer", m) }));
    case "amount":
      return (d.amountCandidates ?? []).slice(0, 4).map((n) => ({ label: fmtNum(n), data: pb(st, "x_amount", n) }));
    case "currency":
      return [...new Set([env.tripCurrency, env.homeCurrency].filter(Boolean))].map((c) => ({ label: c, data: pb(st, "x_currency", c) }));
    case "split":
      return others.length > 0
        ? [
            { label: "ไม่หาร", data: pb(st, "x_split", "none") },
            { label: "หารเท่า", data: pb(st, "x_split", "equal") },
            { label: "หารไม่เท่า", data: pb(st, "x_split", "unequal") },
          ]
        : [{ label: "ไม่หาร", data: pb(st, "x_split", "none") }];
    case "partner":
      return others.slice(0, 12).map((m) => ({ label: m, data: pb(st, "x_partner", m) }));
    case "owed":
      return d.owedZero
        ? [
            { label: "เปลี่ยนเป็นไม่หาร", data: pb(st, "x_owed_zero", "none") },
            { label: "↩ ใส่ใหม่", data: pb(st, "x_owed_zero", "retry") },
          ]
        : [];
    case "category":
      return CATS.map((c) => ({ label: c.name, data: pb(st, "x_category", c.name) }));
    case "note":
      return [{ label: "ไม่มีโน้ต", text: "-" }];
    case "edit":
      return EDIT_BUTTONS.map(([label, field]) => ({ label, data: pb(st, "x_editfield", field) }));
    case "confirm_cancel":
      return e.pending
        ? [
            { label: "ลบทิ้ง", data: pb(st, "x_cancel_delete") },
            { label: "เก็บไว้กรอกทีหลัง", data: pb(st, "x_cancel_keep") },
          ]
        : [
            { label: "ลบรายการนี้", data: pb(st, "x_cancel_delete") },
            { label: "ไม่ลบ", data: pb(st, "x_cancel_keep") },
          ];
    case "conflict":
      return [
        { label: "ทำต่ออันเก่า", data: pb(st, "x_conflict_resume") },
        { label: "เก็บไว้ เริ่มใหม่", data: pb(st, "x_conflict_park") },
        { label: "ทิ้งอันเก่า", data: pb(st, "x_conflict_drop") },
      ];
    case "summary":
      return [];
  }
}

export function questionMessage(st: FlowState, env: FlowEnv, notice?: string): FlexNode {
  const prefix = st.data.asker ? `@${st.data.asker} ` : "";
  const text = `${prefix}${notice ? `${notice}\n` : ""}${questionText(st, env)}`;
  const items = [...questionItems(st, env), ...backItem(st)].slice(0, 13);
  return textMessage(text, items.length > 0 ? quickReply(items) : undefined);
}

function infoLines(e: Expense, d: FlowData): FlexNode[] {
  const catLine = `${CATEGORY_EMOJI[e.category] ?? "📦"} ${e.category}${e.description ? ` · 📝 ${e.description}` : ""}`;
  return compact([
    txt(amountLine(e), { weight: "bold", size: "xl", color: CLAY.ink, wrap: true }),
    txt(catLine, { size: "sm", color: CLAY.muted, wrap: true }),
    txt(`👤 ${e.payer} จ่าย`, { size: "sm", color: CLAY.ink, wrap: true }),
    txt(splitLine(e, d), { size: "sm", color: CLAY.ink, wrap: true }),
    d.fxFailed ? txt("⚠️ ดึงเรตไม่ได้ (ใช้เรต 1 ไปก่อน) แก้ในแอป", { size: "xs", color: CLAY.coral, wrap: true }) : null,
  ]);
}

// Same clay look as the old buildConfirmationFlex: cream frame, white inner card.
function card(e: Expense, origin: string, title: string, titleColor: string, lines: FlexNode[], footer: FlexNode[]): FlexNode {
  const photo = e.slip_photo_ids[0];
  return {
    type: "bubble",
    size: "kilo",
    ...(photo
      ? { hero: { type: "image", url: imageUrl(origin, photo), size: "full", aspectRatio: "20:13", aspectMode: "cover", action: uriAction("ดูรูป", imageUrl(origin, photo)) } }
      : {}),
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: CLAY.cream,
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: CLAY.card,
          cornerRadius: "18px",
          paddingAll: "16px",
          spacing: "sm",
          contents: compact([txt(title, { weight: "bold", size: "md", color: titleColor }), ...lines]),
        },
      ],
    },
    footer: { type: "box", layout: "horizontal", spacing: "sm", paddingAll: "12px", contents: footer },
  };
}

export function summaryCard(st: FlowState, origin: string): FlexNode {
  const e = st.expense;
  const footer: FlexNode[] = [
    { type: "button", style: "primary", color: CLAY.coral, height: "sm", action: postbackAction("✅ ยืนยัน", pb(st, "x_confirm")) },
    { type: "button", style: "secondary", height: "sm", action: postbackAction("✏️ แก้", pb(st, "x_edit")) },
    { type: "button", style: "secondary", height: "sm", action: postbackAction("🗑 ยกเลิก", pb(st, "x_cancel")) },
  ];
  const back = backItem(st);
  return flexMessage(
    `สรุป: ${amountLine(e)}`.slice(0, 400),
    card(e, origin, "สรุปรายการ", CLAY.coral, infoLines(e, st.data), footer),
    back.length > 0 ? quickReply(back) : undefined,
  );
}

export function savedCard(e: Expense, d: FlowData, origin: string): FlexNode {
  const footer: FlexNode[] = [
    { type: "button", style: "primary", color: CLAY.peach, height: "sm", action: uriAction("เปิดในแอป", `${origin}/trips/${e.trip_id}/money`) },
  ];
  return flexMessage(`บันทึกแล้ว: ${amountLine(e)}`.slice(0, 400), card(e, origin, "✅ บันทึกแล้ว", CLAY.doneInk, infoLines(e, d), footer));
}

export function stepMessages(st: FlowState, env: FlowEnv, origin: string, notice?: string): FlexNode[] {
  if (st.step === "summary") return notice ? [textMessage(notice), summaryCard(st, origin)] : [summaryCard(st, origin)];
  return [questionMessage(st, env, notice)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-expense-messages.test.ts`
Expected: PASS

Type check (must pass at every commit; Vercel type-checks `main`):

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add lib/line-expense-messages.ts lib/line-expense-messages.test.ts
git commit -m "feat: LINE expense questions, summary card and saved card" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Replace the expense handler (`lib/line-handlers/expense.ts`)

**Files:**
- Replace entirely: `lib/line-handlers/expense.ts` (deletes the old `awaiting_name` / `awaiting_note` photo flow)
- Test: `lib/line-handlers/expense.test.ts` (create; overwrite if the foundation left one for the old flow)

**Interfaces:**
- Consumes: Tasks 1–4; foundation exports listed in **Prerequisite**; `listRows`, `updateRow`, `deleteRow`, `saveImage` from `@/lib/store`; `fetchRate` from `@/lib/fx`; `selectPendingExpenses` from `@/lib/pending-expense`
- Produces (contract from the shared spec, used by `lib/line-dispatch.ts`):
  - `handleRoute(ctx: HandlerCtx, route: Route): Promise<void>` handles `flow_answer`, `expense_new`, `flow_conflict`, `flow_reask`
  - `handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void>` handles `x_*`
  - `handleImage(ctx: HandlerCtx): Promise<void>`
  - `flowAnswerPredicate(ctx: HandlerCtx, session: LineSession): Promise<(text: string) => boolean>`

Behavior:
- Every save writes the expense row (draft-first, `pending: true` until ✅) **and** the flow session `{ id: ctx.userKey, trip_id, expense_id, step, data }`.
- Rate: before each save, if `needsRate(st)`, call `fetchRate(currency)`. On throw, use rate 1 + `fxFailed`. Then `finalize`.
- Stale postback (`e` or `s` ≠ current session): if expense `e` no longer exists, lead with `รายการนี้ถูกลบไปแล้ว`. Then re-ask the current step, or say `ปุ่มนี้หมดอายุแล้ว…` when there is no session.
- A session whose expense was deleted in the app: delete the session and reply `รายการนี้ถูกลบไปแล้ว`.
- Image: no session → new draft with the photo. Session whose expense has no photo → attach it and re-ask. Session whose expense already has a photo → save the photo and show the conflict prompt (the photo starts the new draft on park/drop). At `conflict` / `confirm_cancel` → re-ask without downloading.
- `cancel_keep` on a confirmed expense (`ไม่ลบ`) deletes only the session and replies `ไม่ลบ รายการยังอยู่เหมือนเดิม`. The row is not written.
- `flowAnswerPredicate` also reads the session's expense, so the payer step knows whether a bare number is a missing amount (answer) or a new entry (conflict).
- Bare commands arrive as `{ kind: "expense_new", text: "ทำต่อ" | "แก้ล่าสุด" | "ยกเลิก" }` (foundation decision 6). `ทำต่อ` reopens the newest pending expense whose payer = my matched member name. If there is none, it takes the newest pending draft with an empty payer. Otherwise it replies `ไม่มีรายการค้าง`. A resumed draft counts its currency as chosen when the row shows it (Task 2 `stateFromExpense`). `แก้ล่าสุด` opens the newest expense with that payer at the first missing step, which is the summary for a complete one. It replaces any live session, and the old draft stays pending in the app queue. `ยกเลิก` with no session replies `ไม่มีรายการค้าง`. `expenseCommand` (Task 1) must recognize every entry of `EXPENSE_COMMAND_KEYWORDS`, and a test pins that.

- [ ] **Step 1: Write the failing test**

```ts
// lib/line-handlers/expense.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Expense, LineSession, Member, Trip } from "@/lib/models/types";
import type { HandlerCtx } from "@/lib/line-handlers/types";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  sessions: new Map<string, Record<string, unknown>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({
  listRows: vi.fn(async (entity: string, tripId?: string) =>
    (db.rows[entity] ?? []).filter((r) => !tripId || r.trip_id === tripId)),
  updateRow: vi.fn(async (entity: string, id: string, obj: Record<string, unknown>) => {
    const list = (db.rows[entity] ??= []);
    const i = list.findIndex((r) => r.id === id);
    if (i >= 0) list[i] = obj;
    else list.push(obj);
  }),
  deleteRow: vi.fn(async (entity: string, id: string) => {
    db.rows[entity] = (db.rows[entity] ?? []).filter((r) => r.id !== id);
  }),
  saveImage: vi.fn(async () => "photo-new"),
}));
vi.mock("@/lib/line-session", () => ({
  readFlowSession: vi.fn(async (key: string) => db.sessions.get(key) ?? null),
  writeFlowSession: vi.fn(async (s: Record<string, unknown>, now: Date) => {
    db.sessions.set(s.id as string, { ...s, updated_at: now.toISOString() });
  }),
  deleteFlowSession: vi.fn(async (key: string) => {
    db.sessions.delete(key);
  }),
}));
vi.mock("@/lib/fx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fx")>()),
  fetchRate: vi.fn(),
}));
vi.mock("@/lib/line", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/line")>()),
  fetchLineDisplayName: vi.fn(),
  fetchLineImageContent: vi.fn(async () => ({ buf: Buffer.from("x"), mime: "image/jpeg" })),
}));

import { flowAnswerPredicate, handleImage, handlePostback, handleRoute } from "./expense";
import { EXPENSE_COMMAND_KEYWORDS } from "@/lib/line-router";
import { expenseCommand } from "@/lib/line-expense-parse";
import { fetchRate } from "@/lib/fx";
import { fetchLineDisplayName } from "@/lib/line";

const TRIP: Trip = {
  id: "t1", name: "HK", destination: "Hong Kong", start_date: "2026-11-20", end_date: "2026-11-25",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const KEY = "group:g1:user:u1";
const NOW = new Date("2026-11-21T03:00:00.000Z");
const member = (id: string, name: string): Member => ({ id, trip_id: "t1", name, color: "", promptpay_id: "" });

function makeCtx(event: Partial<HandlerCtx["event"]>) {
  const reply = vi.fn(async (_messages: unknown[]) => {});
  const ctx: HandlerCtx = {
    event: { type: "message", replyToken: "rt", source: { type: "group", groupId: "g1", userId: "u1" }, ...event } as HandlerCtx["event"],
    replyToken: "rt", accessToken: "tok", origin: "https://app.test", now: NOW,
    userKey: KEY, isGroup: true, trip: TRIP, reply,
  };
  return { ctx, reply };
}
const textCtx = (text: string) => makeCtx({ message: { id: "m1", type: "text", text } });
const pbCtx = () => makeCtx({ type: "postback", postback: { data: "" } });
const out = (reply: ReturnType<typeof makeCtx>["reply"]) => JSON.stringify(reply.mock.calls.at(-1)?.[0]);
const expenses = () => (db.rows.expenses ?? []) as unknown as Expense[];
const session = () => db.sessions.get(KEY) as unknown as LineSession | undefined;

async function say(text: string) {
  const { ctx, reply } = textCtx(text);
  await handleRoute(ctx, { kind: "expense_new", text });
  return reply;
}
async function answer(text: string) {
  const { ctx, reply } = textCtx(text);
  await handleRoute(ctx, { kind: "flow_answer" });
  return reply;
}
async function tap(data: Record<string, string>) {
  const { ctx, reply } = pbCtx();
  await handlePostback(ctx, data);
  return reply;
}

beforeEach(() => {
  db.rows = { members: [member("m1", "เก่ง"), member("m2", "โอ")] as unknown as Record<string, unknown>[], expenses: [] };
  db.sessions.clear();
  vi.mocked(fetchRate).mockReset().mockImplementation(async (c: string) => (c === "THB" ? 1 : 4.5));
  vi.mocked(fetchLineDisplayName).mockReset().mockResolvedValue("เก่ง");
});

describe("expense handler: text capture", () => {
  it("saves a complete entry as a pending draft and shows the summary card", async () => {
    const reply = await say("120 บาท ข้าวมันไก่ ไม่หาร");
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0]).toMatchObject({
      amount: 120, currency: "THB", fx_rate: 1, amount_thb: 120, payer: "เก่ง",
      category: "อาหาร", description: "ข้าวมันไก่", splits: [], pending: true, slip_photo_ids: [],
    });
    expect(session()?.step).toBe("summary");
    expect(out(reply)).toContain("สรุปรายการ");
    expect(out(reply)).toContain("a=x_confirm");
  });

  it("✅ confirms: pending off, session gone, saved card", async () => {
    await say("120 บาท ข้าวมันไก่ ไม่หาร");
    const id = expenses()[0].id;
    const reply = await tap({ a: "x_confirm", e: id, s: "summary" });
    expect(expenses()[0].pending).toBe(false);
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("บันทึกแล้ว");
    expect(out(reply)).toContain("https://app.test/trips/t1/money");
  });

  it("converts with the fetched rate and splits equally, rounding the other share up", async () => {
    await say("120 HKD ข้าว หาร");
    expect(fetchRate).toHaveBeenCalledWith("HKD");
    expect(expenses()[0]).toMatchObject({
      fx_rate: 4.5, amount_thb: 540,
      splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }],
    });
  });

  it("falls back to rate 1 and warns when the FX fetch fails", async () => {
    vi.mocked(fetchRate).mockRejectedValue(new Error("down"));
    const reply = await say("120 HKD ข้าว หาร");
    expect(expenses()[0]).toMatchObject({ fx_rate: 1, amount_thb: 120 });
    expect((session()?.data as Record<string, unknown>).fxFailed).toBe(true);
    expect(out(reply)).toContain("ดึงเรตไม่ได้");
  });

  it("asks who paid when the LINE name matches no member, then accepts a typed name", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const first = await say("120 บาท ข้าว ไม่หาร");
    expect(session()?.step).toBe("payer");
    expect(out(first)).toContain("@Kengz ใครจ่าย?");
    await answer("โอ");
    expect(expenses()[0].payer).toBe("โอ");
    expect(session()?.step).toBe("summary");
  });

  it("typed ยกเลิก asks first; ลบทิ้ง deletes the draft", async () => {
    await say("120 ข้าว");
    await answer("ยกเลิก");
    expect(session()?.step).toBe("confirm_cancel");
    const reply = await answer("ลบทิ้ง");
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("ลบรายการแล้ว");
  });

  it("a new number mid-flow prompts; park keeps the old draft pending and starts the new one", async () => {
    await say("120 ข้าว");
    const oldId = expenses()[0].id;
    const { ctx, reply } = textCtx("50 กาแฟ");
    await handleRoute(ctx, { kind: "flow_conflict", text: "50 กาแฟ" });
    expect(session()?.step).toBe("conflict");
    expect(out(reply)).toContain("มีรายการค้างอยู่");
    await tap({ a: "x_conflict_park", e: oldId, s: "conflict" });
    expect(expenses()).toHaveLength(2);
    expect(expenses().find((e) => e.id === oldId)).toMatchObject({ pending: true, amount: 120 });
    expect(session()?.expense_id).not.toBe(oldId);
    expect(expenses().find((e) => e.id === session()?.expense_id)?.amount).toBe(50);
  });

  it("ทำต่อ with no session reopens my newest pending draft", async () => {
    db.rows.expenses = [{
      id: "old", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อื่นๆ", description: "", amount: 0,
      currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "เก่ง", slip_photo_ids: ["p0"], splits: [], pending: true,
    }];
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: "old", step: "amount" });
    expect(out(reply)).toContain("ยอดเท่าไหร่");
  });

  it("120 → HKD → ยกเลิก → เก็บไว้ → ทำต่อ resumes at the split question, not currency", async () => {
    await say("120");
    const id = expenses()[0].id;
    await tap({ a: "x_currency", e: id, s: "currency", v: "HKD" });
    expect(session()?.step).toBe("split");
    await answer("ยกเลิก");
    await answer("เก็บไว้");
    expect(session()).toBeUndefined();
    expect(expenses()[0]).toMatchObject({ pending: true, currency: "HKD", fx_rate: 4.5, amount_thb: 540 });
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: id, step: "split" });
    expect(out(reply)).toContain("หารไหม");
  });

  it("ทำต่อ falls back to an unclaimed draft (empty payer)", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    db.rows.expenses = [{
      id: "anon", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อื่นๆ", description: "", amount: 0,
      currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: ["p0"], splits: [], pending: true,
    }];
    await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: "anon", step: "payer" });
  });

  it("a number typed while the payer is being asked fills the missing amount and asks the payer again", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const { ctx } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    expect(session()?.step).toBe("payer");
    const pred = await flowAnswerPredicate(ctx, session() as LineSession);
    expect(pred("120")).toBe(true);
    const reply = await answer("120");
    expect(expenses()[0].amount).toBe(120);
    expect(session()?.step).toBe("payer");
    expect(out(reply)).toContain("ใครจ่าย");
  });

  it("bare ยกเลิก / ทำต่อ with nothing pending just say so, without creating a draft", async () => {
    expect(out(await say("ยกเลิก"))).toContain("ไม่มีรายการค้าง");
    expect(out(await say("ทำต่อ"))).toContain("ไม่มีรายการค้าง");
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
  });

  it("แก้ล่าสุด opens the summary of my newest confirmed expense", async () => {
    db.rows.expenses = [{
      id: "done1", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อาหาร", description: "ข้าว", amount: 120,
      currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [],
      splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }], pending: false,
    }];
    const reply = await say("แก้ล่าสุด");
    expect(session()).toMatchObject({ expense_id: "done1", step: "summary" });
    expect(out(reply)).toContain("สรุปรายการ");
    expect(fetchRate).not.toHaveBeenCalled();
  });

  it("🗑 on a confirmed expense asks first; ไม่ลบ leaves the row untouched", async () => {
    const paidSplit = { name: "โอ", amount_thb: 270, paid: true, paid_slip_photo_ids: ["s1"] };
    const row = {
      id: "done1", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อาหาร", description: "ข้าว", amount: 120,
      currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [], splits: [paidSplit], pending: false,
    };
    db.rows.expenses = [{ ...row }];
    await say("แก้ล่าสุด");
    const ask = await tap({ a: "x_cancel", e: "done1", s: "summary" });
    expect(expenses()).toHaveLength(1);
    expect(session()?.step).toBe("confirm_cancel");
    expect(out(ask)).toContain("ไม่ลบ");
    const kept = await tap({ a: "x_cancel_keep", e: "done1", s: "confirm_cancel" });
    expect(session()).toBeUndefined();
    expect(expenses()[0]).toEqual(row);
    expect(out(kept)).toContain("รายการยังอยู่เหมือนเดิม");
  });

  it("🗑 then ลบรายการนี้ deletes a confirmed expense", async () => {
    db.rows.expenses = [{
      id: "done1", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อาหาร", description: "ข้าว", amount: 120,
      currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [], splits: [], pending: false,
    }];
    await say("แก้ล่าสุด");
    await tap({ a: "x_cancel", e: "done1", s: "summary" });
    await tap({ a: "x_cancel_delete", e: "done1", s: "confirm_cancel" });
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
  });

  it("recognises every bare command the router sends as expense_new", () => {
    for (const kw of EXPENSE_COMMAND_KEYWORDS) expect(expenseCommand(kw)).not.toBeNull();
  });
});

describe("expense handler: postbacks", () => {
  it("re-asks the current step when a stale button is tapped", async () => {
    await say("120 ข้าว");
    const id = expenses()[0].id;
    expect(session()?.step).toBe("currency");
    const reply = await tap({ a: "x_split", e: id, s: "split", v: "none" });
    expect(session()?.step).toBe("currency");
    expect(out(reply)).toContain("สกุลเงินอะไร");
  });

  it("says the expense is gone for a button about a deleted expense", async () => {
    const reply = await tap({ a: "x_confirm", e: "ghost", s: "summary" });
    expect(out(reply)).toContain("รายการนี้ถูกลบไปแล้ว");
  });

  it("walks currency → split by buttons", async () => {
    await say("120 ข้าว");
    const id = expenses()[0].id;
    await tap({ a: "x_currency", e: id, s: "currency", v: "HKD" });
    expect(session()?.step).toBe("split");
    await tap({ a: "x_split", e: id, s: "split", v: "equal" });
    expect(session()?.step).toBe("summary");
    expect(expenses()[0]).toMatchObject({ currency: "HKD", amount_thb: 540 });
  });
});

describe("expense handler: images", () => {
  it("a photo with no session starts a draft that asks for the amount", async () => {
    const { ctx, reply } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    expect(expenses()[0]).toMatchObject({ slip_photo_ids: ["photo-new"], payer: "เก่ง", pending: true });
    expect(session()?.step).toBe("amount");
    expect(out(reply)).toContain("ยอดเท่าไหร่");
  });

  it("a photo mid-flow attaches to a draft that has none", async () => {
    await say("120 ข้าว");
    const { ctx, reply } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0].slip_photo_ids).toEqual(["photo-new"]);
    expect(out(reply)).toContain("แนบรูป");
  });
});

describe("flowAnswerPredicate", () => {
  it("accepts answers for the current step and the flow commands only", async () => {
    const { ctx } = textCtx("");
    const pred = await flowAnswerPredicate(ctx, { id: KEY, trip_id: "t1", expense_id: "e1", step: "payer", updated_at: "", data: {} });
    expect(pred("โอ")).toBe(true);
    expect(pred("ยกเลิก")).toBe(true);
    expect(pred("สวัสดี")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-handlers/expense.test.ts`
Expected: FAIL. The old handler has no `flow_answer` / `x_*` support, so the first assertions fail (e.g. `expected [] to have a length of 1`).

- [ ] **Step 3: Replace `lib/line-handlers/expense.ts` with**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-handlers/expense.test.ts`
Expected: PASS

- [ ] **Step 5: Run every LINE test so dispatch/router tests still pass with the new handler**

Run: `npm test -- lib/line`
Expected: PASS (all `lib/line*.test.ts` and `lib/line-handlers/*.test.ts`). `lib/line-dispatch.test.ts` mocks the expense module, so it needs no change. Do not change dispatch or router code.

Type check (must pass at every commit; Vercel type-checks `main`):

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/line-handlers/expense.ts lib/line-handlers/expense.test.ts
git commit -m "feat: LINE expense capture asks until complete (text, photo, postbacks)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remove old-flow helpers and verify the whole project

**Files:**
- Modify: `lib/line.ts` (delete `sourceKey`, `QuickReplyItem`, `buildNameQuickReply`, `buildSkipQuickReply`, `buildConfirmationFlex`)
- Modify: `lib/line.test.ts` (delete their imports and `describe` blocks)
- Modify: `lib/models/types.ts` (only the comment above `LineSession`, if it still mentions `sourceKey`)

**Interfaces:**
- Consumes: nothing new
- Produces: no new exports. `lib/line.ts` keeps `verifyLineSignature`, `fetchLineImageContent`, `fetchLineDisplayName`, `matchMemberName`, `replyLineMessages`, `replyLineMessage`, `userKey`, `isGroupChat`, `LineSource`, `LineEvent`.

- [ ] **Step 1: Confirm the helpers have no callers left**

Run: `git grep -n -E "sourceKey|buildNameQuickReply|buildSkipQuickReply|buildConfirmationFlex" -- app lib`
Expected: matches only in `lib/line.ts`, `lib/line.test.ts`, and possibly the comment in `lib/models/types.ts`. If any other file still calls one of them, keep that one helper (and its test) and remove only the rest. Steps 2–4 must land in **one** commit: deleting a helper without deleting its test (or the reverse) breaks `npx tsc --noEmit`, because tsconfig includes test files. Task 5 already removed the only runtime caller (the old `lib/line-handlers/expense.ts`) and its old test.

- [ ] **Step 2: Delete the helpers from `lib/line.ts`**

Delete these blocks completely, including the comments directly above each:
- `export function sourceKey(source: LineSource): string { ... }` (the "A conversation (image -> "who's this?" -> "any note?")…" comment above it)
- `interface QuickReplyItem { ... }`
- `export function buildNameQuickReply(...) { ... }` (and its "One tappable button per trip member…" comment)
- `export function buildSkipQuickReply(...) { ... }`
- `export function buildConfirmationFlex(...) { ... }` (and its "Flex Messages have no real box-shadow…" comment)

- [ ] **Step 3: Delete their tests from `lib/line.test.ts`**

- Remove `sourceKey,`, `buildNameQuickReply,`, `buildSkipQuickReply,`, `buildConfirmationFlex,` from the `import { ... } from "./line";` list (keep every other name).
- Delete the whole `describe("sourceKey", ...)`, `describe("buildNameQuickReply", ...)`, `describe("buildSkipQuickReply", ...)` and `describe("buildConfirmationFlex", ...)` blocks.

- [ ] **Step 4: Fix the `LineSession` comment if it is stale**

If the comment above `export interface LineSession` in `lib/models/types.ts` still says `id = the chat's sourceKey`, replace the whole comment with:

```ts
// One row per person per LINE chat (id = userKey(source), see lib/line.ts),
// plus a "{userKey}#ctx" row for view context. The flow row points at the
// pending expense being captured. step is the question being waited on, and
// data holds in-between state (see FlowData in lib/line-expense-flow.ts).
// Rows older than 30 minutes are treated as expired (lib/line-session.ts).
```

- [ ] **Step 5: Run the full test suite, type check and lint**

Run: `npm test`
Expected: PASS (all suites)

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npm run lint`
Expected: no errors (warnings that existed before this plan are fine)

- [ ] **Step 6: Commit**

```bash
git add lib/line.ts lib/line.test.ts lib/models/types.ts
git commit -m "refactor: drop old LINE slip-flow helpers replaced by the expense flow" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage (self-review)

| Requirement | Where |
|---|---|
| Required fields amount / currency / payer / split (+ owed) | `nextMissingStep` (T2), questions (T4) |
| Payer auto from LINE display name, else ask with member buttons | `startDraft` → `matchMemberName` (T5), `payer` question (T4) |
| Split modes ไม่หาร / หารเท่า (ceil2) / หารไม่เท่า, payer share not stored | `buildSplits`, `finalize` (T2) |
| Owed validation 0 / > total / = total | `validateOwed` (T2), `applyAnswer` owed + `owed_none` / `owed_retry` (T3), buttons (T4) |
| Trip ≠ 2 members → "หารกับใคร?" | `partner` step (T2/T3/T4) |
| Category guessed, never asked; note = leftover | `guessCategory`, `parseExpenseText` (T1) |
| Multiple numbers → candidate picker (≤ 4), unpicked stay in note | `amountCandidates`, `removeNumberToken` (T1/T3/T4) |
| Currency aliases + supported codes; buttons [trip][home] | `findCurrency` / `resolveCurrency` (T1), currency question (T4) |
| Draft-first pending expense | `settleAndAsk` saves on every step (T5) |
| Summary card ✅ / ✏️ / 🗑, saved card with open-app link | `summaryCard`, `savedCard` (T4), confirm / delete outcomes (T5) |
| ✏️ edit any of 6 fields, return to summary | `edit` / `editfield` (T3/T4) |
| ↩ ย้อน on every question except the first | `prevSteps`, `backItem` (T3/T4) |
| `ยกเลิก` → [ลบทิ้ง][เก็บไว้กรอกทีหลัง]; `ทำต่อ`; `แก้ล่าสุด` | `confirm_cancel` (T3), `openExisting` (T5) |
| Confirmed expense (แก้ล่าสุด) never deleted in one tap; ไม่ลบ leaves the row alone; paid splits kept on edit | `applyAnswer` cancel (T3), confirm_cancel copy (T4), `keep` outcome (T5), `finalize` carry-over (T2) |
| Parked draft resumes past currency when the row shows it was chosen; ทำต่อ falls back to unclaimed drafts | `stateFromExpense` (T2), `openExisting` (T5) |
| Note step doesn't swallow view commands; a number at the payer step fills a missing amount | foundation `isViewCommand`, `interpretAnswer` (T3), `flowAnswerPredicate` (T5) |
| Dates/times aren't amounts; `ฝากให้ N` is a deposit; conflict text hides an unchosen currency | `parseExpenseText` (T1), `questionText` (T4) |
| Conflict prompt for new number / photo mid-flow, not at number-waiting steps | router + `enterConflict`, park / drop (T3/T5); number steps answer via `interpretAnswer` |
| 30-min TTL | foundation `readFlowSession` (expense stays pending) |
| Photo attaches to an in-flight draft with no photo | `handleImage` (T5) |
| FX failure fallback | `withFreshRate` (T5), card warning (T4) |
| Stale postback / deleted expense | `handlePostback` (T5) |
| Typed answers matching button labels | `interpretAnswer` (T3) |
| Postback prefix `x_`, ≤ 300 chars, quick reply limits, no empty text | T3/T4 tests |
