# LINE Expense One-Card, Auto-Save and Guide Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LINE expense flow's one-question-at-a-time + "✅ ยืนยัน" behavior with ONE card that asks every missing field at once and saves automatically the moment the expense is complete, add edit/delete buttons (and the trip name) to the saved card, and add the `คู่มือการใช้งาน` / `คู่มือ <หัวข้อ>` help command.

**Architecture:** The pure layering stays (parse → flow → answers → messages → handler). `missingFields()` (flow) says what is still unknown; `interpretBundle()` (new `lib/line-expense-answers.ts`) reads many fields from one typed message; `applyAnswer()` applies a bundle, then `settle()` either asks again (`ask` outcome, rendered as `missingCard`) or finishes (`saved` outcome, rendered as `savedCard`, session deleted). Every state change bumps `data.rev`; every button carries `e` (expense id) + `v` (rev) so old cards are rejected. Editing a saved expense uses per-field questions and saves the moment the field is answered. The guide is a new pure module (`lib/line-guide.ts`) routed through a new `guide` route that dispatch answers without loading the trip.

**Tech Stack:** TypeScript (strict), vitest 4 (`npm test -- <path>`), LINE Flex Messages, Google Sheets via `@/lib/store`, Next.js 16 (no Next.js API is touched by this plan; `app/api/line/webhook/route.ts` and `lib/line-session.ts` are intentionally unchanged).

## Global Constraints

Copied from `docs/superpowers/specs/2026-11-22-line-expense-one-card-and-guide-design.md` (the spec wins over older specs where they conflict):

- Trip = the first trip with `status === "active"` (unchanged). No `ทริป` command, no trip picker. The saved card and missing card show the trip name as a small line: `ทริป {trip.name}` (assumption A2).
- Fields that must be complete before saving: amount, currency, payer, split (+ owed when split = unequal). Category and note are never asked (guessed / leftover text).
- Row order in the card: ยอด → สกุลเงิน → คนจ่าย → หาร → (หารกับใคร, only when >2 members) → ยอดฝากจ่าย.
- Missing card text: `เหลืออีก {n} อย่าง`, hint `พิมพ์ตอบทีเดียวก็ได้ เช่น "HKD เก่ง หารเท่า"`, button `[🗑 ยกเลิก]`. Answered rows show `✓ label value` and tapping one clears that field. There is no ↩ ย้อน button any more.
- Unrecognised typed text with no field read: re-send the same card with `ไม่เข้าใจ ลองกดปุ่ม หรือพิมพ์ เช่น HKD เก่ง หารเท่า`. Unknown tokens beside at least one understood field are skipped silently. Conflicting values (two currencies) → first one wins.
- Auto-save: no ✅ ยืนยัน button, no `summary` step for drafts. Saved card has `[✏️ แก้] [🗑 ลบ]`. ✏️ แก้ → field picker `[ยอด][สกุลเงิน][คนจ่าย][หาร][หมวด][โน้ต]` → asks only that field → **saves immediately** and sends a new saved card. 🗑 ลบ asks `[ลบรายการนี้][ไม่ลบ]` first. Editing an amount keeps `paid` / `paid_slip_photo_ids` of the same person's split. `แก้ล่าสุด` opens the saved card of the latest saved expense.
- Stale buttons: every postback carries `e` and `v` (= `session.data.rev`, +1 on every data change). Mismatch → do nothing, re-send the current card with `ปุ่มนี้หมดอายุแล้ว`. Sessions stay per person.
- Kept unchanged: TTL 30 min, draft-first (pending row from the first message), `ยกเลิก` (ลบทิ้ง / เก็บไว้กรอกทีหลัง), `ทำต่อ`, the conflict prompt, photo attach into a pending flow, category guessing, one-line parsing, FX failure warning `⚠️ ดึงเรตไม่ได้ (ใช้เรต 1 ไปก่อน) แก้ในแอป`, `paid` carry-over.
- Guide: `คู่มือการใช้งาน` / `คู่มือ` → carousel (TOC + 7 topic bubbles); `คู่มือ ค่าใช้จ่าย|แพลน|จอง (ตั๋ว/เอกสาร)|ร้าน (ที่เที่ยว)|ข้อมูล (โน้ต)|เดินทาง` → one bubble. It is a view command (`isViewCommand`), needs no active trip, replies even in groups, never collides with the digit-ambiguity rule. Every bubble: title, 4–6 command rows, 2–3 examples. `[ลองเลย]` (message action) only on side-effect-free commands: `แพลน` `ต่อไป` `จอง` `ร้าน` `ที่เที่ยว` `ข้อมูล` `โน้ต` `เดินทาง`. The expense topic has NO message action (uses `[คัดลอกตัวอย่าง]` clipboard). Menu bubble 1 gets `[คู่มือการใช้งาน]` (postback `menu_go&t=guide`). `HINT_TEXT` = `ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ คู่มือการใช้งาน`.
- Postback data ≤ 300 chars; quick reply labels ≤ 20 chars; no empty Flex text nodes.

Plan-level rules:
- After EVERY task commit `npm test`, `npx tsc --noEmit` and eslint on the changed files must be clean (the user deploys `main`; Vercel type-checks). Tasks are ordered so old code compiles until it is replaced; the swap of flow + answers + messages + handler happens atomically inside Task 2.
- Regex care: whitespace is `\s+` (never `/s+/`).
- Commit messages end with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Per the user's memory: no local dev-server / browser testing; verification is vitest + tsc + eslint.

### Spec ambiguities and how this plan resolves them

1. **`FlowData.chosen`** (spec §3): redundant. `currencyConfirmed` and `splitMode` already record "the user chose it" (payer = non-empty `expense.payer`, amount = `> 0`). Not added.
2. **Partner row**: the spec's field table omits "หารกับใคร", but trips with >2 members need it (existing `partner` step). Kept as a conditional row after หาร.
3. **Postback param names**: `v` is now the revision, so a value is carried in `w` and a field name in `f`: `a=x_set&f=<field>&w=<value>&e=<id>&v=<rev>`.
4. **`missingCard` signature**: needs `origin` for the slip hero image, so it is `missingCard(st, env, cc: { origin; tripName }, notice?) → FlexNode[]` (notice text message first, then the card).
5. **Per-field questions survive only for editing a saved expense** (`edit`, `amount`, `currency`, `payer`, `split`, `partner`, `owed`, `category`, `note` steps) and for the two prompts (`confirm_cancel`, `conflict`). `questionMessage` is kept for these; drafts always use `missingCard`.
6. **A number that fits no field** (e.g. `120 บาท ข้าว` typed while amount is known) makes the whole text "not an answer" → the router sends it to the conflict prompt as before (preserves "new number mid-flow prompts"). Spec says "ไม่ใช้"; this is the safe reading.
7. **Words typed beside a first amount** (`50 กาแฟ` on a photo-only draft) seed the empty note and re-guess the category (existing behavior at the old payer step is preserved).
8. **No members on the trip**: payer is never asked (stays empty); split can only be ไม่หาร.
9. **`แก้ล่าสุด`** opens the latest **saved** (non-pending) expense of the caller; a newer pending draft is ignored (drafts are reopened with `ทำต่อ`).
10. **`x_edit` / `x_del` come from the saved card, which has no session**, so they carry only `e`. If a live session belongs to a different expense, the bot re-sends that card with `มีรายการอื่นค้างอยู่ ตอบหรือ ยกเลิก อันนั้นก่อนนะ` instead of overwriting it.
11. **Conflict prompt while editing a saved expense**: `ทิ้งอันเก่า` must never delete a confirmed expense (the old code would). Pending → deleted as before; saved → only the session is dropped, with `ยกเลิกการแก้ไขแล้ว รายการเดิมยังอยู่ เริ่มอันใหม่เลย`.
12. **Typed `ย้อน`** is no longer a flow command (button removed); `expenseCommand` keeps recognising it so bare `ย้อน` still replies `ไม่มีรายการค้าง`.
13. **`คู่มือ <unknown>`** shows the full carousel.

---

## File Structure

| File | Task | Change |
|---|---|---|
| `lib/line-expense-parse.ts` (+test) | 1 | add `matchDeposit`, `parseWholeNumber` |
| `lib/line-expense-flow.ts` (+`line-expense-flow.test.ts`, `line-expense-flow-answers.test.ts`) | 1 (additive), 2 (rewrite) | `Field`, `Bundle`, `missingFields`, `rev`; then new steps/answers/outcomes, `settle`, rev bumping; loses `nextMissingStep`, `interpretAnswer`, `postbackToAnswer`, ↩/summary/confirm |
| `lib/line-expense-answers.ts` (+test) | 1 (create), 2 (extend) | `interpretBundle`; then `interpretAnswer`, `postbackToAnswer` (moved here to avoid a flow↔answers import cycle) |
| `lib/line-expense-messages.ts` (+test) | 2 | `missingCard`, new `savedCard`, trimmed `questionMessage`, `stepMessages`; loses `summaryCard`, `backItem` |
| `lib/line-handlers/expense.ts` (+test) | 2 | auto-save, rev check, `x_set/x_clear/x_edit/x_del`, `แก้ล่าสุด` → saved card |
| `lib/line-flex.ts` (+test) | 3 | `messageAction` helper |
| `lib/line-guide.ts` (+test) | 3 | new pure module |
| `lib/line-router.ts` (+test), `lib/line-menu.ts` (+test), `lib/line-dispatch.ts` (+test) | 4 | `guide` route, `isViewCommand`, menu button, `HINT_TEXT`, dispatch |
| `docs/line-bot-how-to.md` | 5 | new expense flow + guide section |

Existing tests that assert the OLD behavior and are changed/replaced (all in Task 2 unless noted):
- `lib/line-expense-flow.test.ts`: `isFlowStep…`, whole `nextMissingStep` describe (deleted; replaced by `missingFields` tests added in Task 1), `initialState` (summary step / prevSteps), `stateFromExpense` (signature, `summary` step, prevSteps), `enterConflict / attachPhoto` (prevSteps).
- `lib/line-expense-flow-answers.test.ts`: fully rewritten (back / summary / confirm / edit-by-summary / prevSteps assertions removed). Its `interpretAnswer` / `postbackToAnswer` blocks move to `lib/line-expense-answers.test.ts`.
- `lib/line-expense-messages.test.ts`: fully rewritten (`summaryCard`, `x_confirm`, `x_back`, `x_payer/x_currency/x_split` per-step buttons, `s=` param assertions removed).
- `lib/line-handlers/expense.test.ts`: fully rewritten (summary card + `x_confirm` tests, "stale step" test, `x_split` walk, `แก้ล่าสุด` summary tests).
- Task 4: `lib/line-menu.test.ts` (`HINT_TEXT` string).

---

### Task 1: Parse helpers, `missingFields`, `interpretBundle` (additive, nothing is removed)

**Files:**
- Modify: `lib/line-expense-parse.ts` (add two exports after `parseNumber`)
- Modify: `lib/line-expense-parse.test.ts`
- Modify: `lib/line-expense-flow.ts` (add `Field`, `Bundle`, `missingFields`, `rev?` — old code untouched)
- Modify: `lib/line-expense-flow.test.ts` (append a describe)
- Create: `lib/line-expense-answers.ts`
- Create: `lib/line-expense-answers.test.ts`

**Interfaces:**
- Produces (parse): `matchDeposit(text: string): { owed: number; index: number; length: number } | null`; `parseWholeNumber(token: string): number | null`.
- Produces (flow): `type Field = "amount" | "currency" | "payer" | "split" | "partner" | "owed"`; `interface Bundle { amount?: number; currency?: string; payer?: string; split?: SplitMode; partner?: string; owed?: number; category?: Category; note?: string; seedNote?: string }`; `missingFields(expense: Expense, data: FlowData, members: string[]): Field[]`; `FlowData.rev?: number`.
- Produces (answers): `extractAtMember(text: string, members: string[]): { payer: string; text: string } | null` (finds `@<member>` followed by whitespace/end; returns the member and the text without it); `interface BundleCtx { expense: Expense; data: FlowData; members: string[] }`; `interpretBundle(text: string, ctx: BundleCtx): Bundle | null`.

- [ ] **Step 1: Write the failing parse tests**

In `lib/line-expense-parse.test.ts` add `matchDeposit, parseWholeNumber,` to the import list from `./line-expense-parse`, then append:

```ts
describe("matchDeposit", () => {
  it("finds ฝาก N and where it sits, so the caller can cut it out", () => {
    const t = "500 บาท เซเว่น ฝาก 20";
    const m = matchDeposit(t);
    expect(m?.owed).toBe(20);
    expect(t.slice(m!.index, m!.index + m!.length)).toBe("ฝาก 20");
  });

  it("accepts ฝากให้ and thousands commas", () => {
    expect(matchDeposit("ฝากให้ 1,200")?.owed).toBe(1200);
  });

  it("ignores ของฝาก (souvenir) and text without a deposit", () => {
    expect(matchDeposit("ของฝาก 20")).toBeNull();
    expect(matchDeposit("120 ข้าว")).toBeNull();
  });
});

describe("parseWholeNumber", () => {
  it("accepts a token that is only a number", () => {
    expect(parseWholeNumber("120")).toBe(120);
    expect(parseWholeNumber("1,200")).toBe(1200);
    expect(parseWholeNumber("12.5")).toBe(12.5);
  });

  it("rejects tokens with anything else in them", () => {
    expect(parseWholeNumber("120บาท")).toBeNull();
    expect(parseWholeNumber("7-11")).toBeNull();
    expect(parseWholeNumber("HKD")).toBeNull();
    expect(parseWholeNumber("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- lib/line-expense-parse.test.ts`
Expected: FAIL (`matchDeposit` / `parseWholeNumber` are not exported).

- [ ] **Step 3: Implement the parse helpers**

In `lib/line-expense-parse.ts`, immediately after the `DEPOSIT_RE` constant (it is defined right under `collapse`), add:

```ts
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
```

- [ ] **Step 4: Run the parse tests**

Run: `npm test -- lib/line-expense-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing `missingFields` tests**

In `lib/line-expense-flow.test.ts` add `missingFields,` to the import list from `./line-expense-flow`, and append at the end of the file:

```ts
describe("missingFields", () => {
  const d = (over: FlowData = {}): FlowData => ({ currencyConfirmed: true, splitMode: "none", ...over });
  const e = (over: Partial<Expense> = {}) => exp({ payer: "เก่ง", amount: 120, ...over });

  it("lists every missing field in card order", () => {
    expect(missingFields(exp(), {}, M)).toEqual(["amount", "currency", "payer", "split"]);
  });

  it("is empty once everything is known", () => {
    expect(missingFields(e(), d(), M)).toEqual([]);
    expect(missingFields(e(), d({ splitMode: "equal" }), M)).toEqual([]);
  });

  it("does not ask the payer when the trip has no members", () => {
    expect(missingFields(exp({ amount: 120 }), d(), [])).toEqual([]);
  });

  it("asks who to split with only for 3+ members and only once the payer is known", () => {
    const three = ["เก่ง", "โอ", "ต้น"];
    expect(missingFields(e(), d({ splitMode: "equal" }), three)).toEqual(["partner"]);
    expect(missingFields(e({ payer: "" }), d({ splitMode: "equal" }), three)).toEqual(["payer"]);
    expect(missingFields(e(), d({ splitMode: "equal", partner: "ต้น" }), three)).toEqual([]);
  });

  it("needs a valid owed amount for หารไม่เท่า", () => {
    const x = e({ amount: 500 });
    expect(missingFields(x, d({ splitMode: "unequal" }), M)).toEqual(["owed"]);
    expect(missingFields(x, d({ splitMode: "unequal", owedAmount: 600 }), M)).toEqual(["owed"]);
    expect(missingFields(x, d({ splitMode: "unequal", owedAmount: 20 }), M)).toEqual([]);
  });

  it("cannot accept an owed amount while the total is unknown", () => {
    expect(missingFields(e({ amount: 0 }), d({ splitMode: "unequal", owedAmount: 20 }), M)).toEqual(["amount", "owed"]);
  });

  it("never asks split, partner or owed for splits made in the app", () => {
    expect(missingFields(e(), d({ lockedSplits: true, splitMode: undefined }), M)).toEqual([]);
  });
});
```

- [ ] **Step 6: Write the failing `interpretBundle` tests**

Create `lib/line-expense-answers.test.ts`:

```ts
// lib/line-expense-answers.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import type { FlowData } from "./line-expense-flow";
import { interpretBundle } from "./line-expense-answers";

const M = ["เก่ง", "โอ"];
const M3 = ["เก่ง", "โอ", "ต้น"];
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อื่นๆ", description: "",
  amount: 0, currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: [], splits: [], pending: true,
  ...over,
});
const ctx = (e: Partial<Expense> = {}, d: FlowData = {}, members = M) => ({ expense: exp(e), data: d, members });

describe("interpretBundle", () => {
  it("reads currency, payer and split from one message", () => {
    expect(interpretBundle("HKD เก่ง หารเท่า", ctx({ amount: 120 }))).toEqual({ currency: "HKD", payer: "เก่ง", split: "equal" });
  });

  it("is order independent and accepts @name", () => {
    expect(interpretBundle("หารเท่า @โอ hk", ctx({ amount: 120 }))).toEqual({ currency: "HKD", payer: "โอ", split: "equal" });
  });

  it("a bare number fills a missing amount", () => {
    expect(interpretBundle("120", ctx())).toEqual({ amount: 120 });
    expect(interpretBundle("1,200 บาท", ctx())).toEqual({ amount: 1200, currency: "THB" });
  });

  it("ฝาก N means หารไม่เท่า with that owed amount", () => {
    expect(interpretBundle("ฝาก 20", ctx({ amount: 500, payer: "เก่ง" }))).toEqual({ split: "unequal", owed: 20 });
    expect(interpretBundle("120 ฝาก 20", ctx())).toEqual({ amount: 120, split: "unequal", owed: 20 });
  });

  it("a bare number is the owed amount only while the amount is known and the split is unequal", () => {
    expect(interpretBundle("20", ctx({ amount: 500 }, { splitMode: "unequal" }))).toEqual({ owed: 20 });
    expect(interpretBundle("20", ctx({ amount: 500 }, { splitMode: "none" }))).toBeNull();
    expect(interpretBundle("20", ctx({ amount: 500 }))).toBeNull();
  });

  it("a number that fits no field makes the whole text a non-answer (a new entry)", () => {
    expect(interpretBundle("120 บาท ข้าว", ctx({ amount: 120, payer: "เก่ง" }))).toBeNull();
    expect(interpretBundle("50 30", ctx({ amount: 120 }))).toBeNull();
  });

  it("two numbers fill amount then owed", () => {
    expect(interpretBundle("120 20", ctx({}, { splitMode: "unequal" }))).toEqual({ amount: 120, owed: 20 });
  });

  it("skips unknown tokens when at least one field was understood", () => {
    expect(interpretBundle("HKD อร่อยมาก", ctx({ amount: 120 }))).toEqual({ currency: "HKD" });
  });

  it("returns null when no field is understood", () => {
    expect(interpretBundle("สวัสดี", ctx({ amount: 120 }))).toBeNull();
    expect(interpretBundle("   ", ctx())).toBeNull();
  });

  it("conflicting values: the first one wins", () => {
    expect(interpretBundle("HKD THB", ctx({ amount: 120 }))).toEqual({ currency: "HKD" });
    expect(interpretBundle("ไม่หาร หารเท่า", ctx({ amount: 120 }))).toEqual({ split: "none" });
  });

  it("seeds the note from leftover words typed with a first amount", () => {
    expect(interpretBundle("50 กาแฟ", ctx())).toEqual({ amount: 50, seedNote: "กาแฟ" });
    expect(interpretBundle("50 กาแฟ", ctx({ description: "แท็กซี่" }))).toEqual({ amount: 50 });
  });

  it("a name is the payer while the payer is missing, otherwise the partner when one is needed", () => {
    expect(interpretBundle("โอ", ctx({ amount: 120 }))).toEqual({ payer: "โอ" });
    expect(interpretBundle("ต้น", ctx({ amount: 120, payer: "เก่ง" }, { splitMode: "equal" }, M3))).toEqual({ partner: "ต้น" });
    expect(interpretBundle("ต้น", ctx({ amount: 120, payer: "เก่ง" }, { splitMode: "none" }, M3))).toBeNull();
    expect(interpretBundle("โอ", ctx({ amount: 120, payer: "เก่ง" }))).toBeNull();
  });

  it("matches member names with spaces", () => {
    expect(interpretBundle("HKD พี่ เก่ง", ctx({ amount: 120 }, {}, ["พี่ เก่ง", "โอ"]))).toEqual({ currency: "HKD", payer: "พี่ เก่ง" });
  });
});
```

Also in `lib/line-expense-answers.test.ts`: change the import to `import { extractAtMember, interpretBundle } from "./line-expense-answers";` and append:

```ts
describe("extractAtMember", () => {
  it("finds @member, returns the member and the text without it", () => {
    expect(extractAtMember("120 HKD ข้าว @เก่ง หาร", M)).toEqual({ payer: "เก่ง", text: "120 HKD ข้าว หาร" });
    expect(extractAtMember("@โอ 50 กาแฟ", M)).toEqual({ payer: "โอ", text: "50 กาแฟ" });
    expect(extractAtMember("120 ข้าว @โอ", M)).toEqual({ payer: "โอ", text: "120 ข้าว" });
  });

  it("needs the whole name and a member of the trip", () => {
    expect(extractAtMember("120 ข้าว @เก่งมาก", M)).toBeNull();
    expect(extractAtMember("120 ข้าว @ใครก็ไม่รู้", M)).toBeNull();
    expect(extractAtMember("120 ข้าว เก่ง", M)).toBeNull();
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npm test -- lib/line-expense-flow.test.ts lib/line-expense-answers.test.ts`
Expected: FAIL (`missingFields` and `./line-expense-answers` do not exist).

- [ ] **Step 8: Implement the flow additions**

In `lib/line-expense-flow.ts` (additive; keep every existing line). After the `EditField` type add:

```ts
// The fields the one-card flow collects, in card order. Every name is also a
// FlowStep (an edit of a saved expense asks one field at a time).
export type Field = "amount" | "currency" | "payer" | "split" | "partner" | "owed";

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
```

In `interface FlowData` add one line (after `fxFailed`): `  rev?: number;                   // bumps on every data change; buttons carry it`

Right after the existing `nextMissingStep` function add:

```ts
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
```

- [ ] **Step 9: Implement `interpretBundle`**

Create `lib/line-expense-answers.ts`:

```ts
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
```

- [ ] **Step 10: Run the tests and the three checks**

Run:
```bash
npm test -- lib/line-expense-parse.test.ts lib/line-expense-flow.test.ts lib/line-expense-answers.test.ts
npm test
npx tsc --noEmit
npx eslint lib/line-expense-parse.ts lib/line-expense-parse.test.ts lib/line-expense-flow.ts lib/line-expense-flow.test.ts lib/line-expense-answers.ts lib/line-expense-answers.test.ts
```
Expected: all PASS / no output from tsc and eslint.

- [ ] **Step 11: Commit**

```bash
git add lib/line-expense-parse.ts lib/line-expense-parse.test.ts lib/line-expense-flow.ts lib/line-expense-flow.test.ts lib/line-expense-answers.ts lib/line-expense-answers.test.ts
git commit -m "$(cat <<'EOF'
feat(line): missingFields and interpretBundle for the one-card expense flow

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Swap to one card + auto-save (flow reducer, answers, messages, handler, tests)

This task is atomic: `tsc` is red between Steps 6 and 10 on purpose. Do not commit before Step 11.

**Files:**
- Rewrite: `lib/line-expense-flow.ts` (complete file below)
- Modify: `lib/line-expense-answers.ts` (append `interpretAnswer`, `postbackToAnswer`; extend imports)
- Rewrite: `lib/line-expense-messages.ts` (complete file below)
- Rewrite: `lib/line-handlers/expense.ts` (complete file below)
- Modify: `lib/line-expense-flow.test.ts` (edits listed in Step 1)
- Rewrite: `lib/line-expense-flow-answers.test.ts`, `lib/line-expense-messages.test.ts`, `lib/line-handlers/expense.test.ts`
- Modify: `lib/line-expense-answers.test.ts` (append)

**Interfaces:**
- Consumes (Task 1): `Field`, `Bundle`, `missingFields`, `interpretBundle`.
- Produces (flow): `FlowStep = "missing" | "edit" | "amount" | "currency" | "payer" | "split" | "partner" | "owed" | "category" | "note" | "confirm_cancel" | "conflict"`; `normalizeStep(raw: string, pending: boolean): FlowStep`; `initialState(p): FlowState` (no `members` param); `stateFromExpense(expense, tripCurrency, asker?): FlowState` (no `members` param); `settle(st, members, notice?): Outcome`; `Answer`, `Outcome` (`{ k: "saved"; state: FlowState }` replaces `confirm`; `state` is the POST-answer state with `expense.pending = false`, so finalize/rate/saved card use the new data), `applyAnswer(st, ans, env): Outcome`; `enterConflict`, `attachPhoto` bump `rev`.
- Produces (answers): `interpretAnswer(st: Pick<FlowState, "step" | "data" | "expense">, text: string, members: string[]): Answer | null`; `postbackToAnswer(d: Record<string, string>): Answer | null`.
- Produces (messages): `CardCtx = { origin: string; tripName: string }`; `missingCard(st, env, cc, notice?): FlexNode[]`; `savedCard(e: Expense, d: FlowData, origin: string, tripName: string): FlexNode`; `questionMessage(st, env, notice?): FlexNode`; `stepMessages(st, env, cc, notice?): FlexNode[]`; `reaskFor(step): string`; `MSG` (adds `staleButton`, `droppedEdit`, `reaskPrompt`, `busy`; `reask` text changes).
- Postback contract: missing-card / question buttons: `a=x_set&f=<field|category>&w=<value>&e=<id>&v=<rev>`, `a=x_clear&f=<field>&e&v`, `a=x_owed_zero&w=none|retry&e&v`, `a=x_editfield&w=<EditField>&e&v`, `a=x_cancel|x_cancel_delete|x_cancel_keep|x_conflict_resume|x_conflict_park|x_conflict_drop&e&v`; saved card: `a=x_edit&e=<id>` and `a=x_del&e=<id>` (no `v`).

- [ ] **Step 1: Update `lib/line-expense-flow.test.ts`**

Apply these edits.

(a) In the import list from `./line-expense-flow`: delete the line `  nextMissingStep,`; add `  normalizeStep,` and `  settle,`. (`missingFields` was added in Task 1.)

(b) Replace the test `it("isFlowStep recognises only flow steps", …)` with:

```ts
  it("isFlowStep recognises only flow steps", () => {
    expect(isFlowStep("owed")).toBe(true);
    expect(isFlowStep("missing")).toBe(true);
    expect(isFlowStep("summary")).toBe(false);
    expect(isFlowStep("awaiting_name")).toBe(false);
  });

  it("normalizeStep maps rows left by the old flow onto the new steps", () => {
    expect(normalizeStep("summary", true)).toBe("missing");
    expect(normalizeStep("payer", true)).toBe("missing");
    expect(normalizeStep("conflict", true)).toBe("conflict");
    expect(normalizeStep("confirm_cancel", false)).toBe("confirm_cancel");
    expect(normalizeStep("summary", false)).toBe("edit");
    expect(normalizeStep("category", false)).toBe("category");
    expect(normalizeStep("awaiting_name", false)).toBe("edit");
  });
```

(c) Delete the whole `describe("nextMissingStep", () => { … });` block.

(d) Replace the whole `describe("initialState", …)` block AND the whole `describe("stateFromExpense", …)` block with:

```ts
describe("initialState", () => {
  const base = { id: "e1", tripId: "t1", now: "2026-11-21T03:00:00.000Z", tripCurrency: "HKD" };

  it("starts at the missing card with rev 1 and remembers what the text said", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("120 HKD ข้าว หาร"), payer: "เก่ง" });
    expect(st.step).toBe("missing");
    expect(st.expense).toEqual(exp({ payer: "เก่ง", amount: 120, currency: "HKD", category: "อาหาร", description: "ข้าว" }));
    expect(st.data).toEqual({ rev: 1, currencyConfirmed: true, splitMode: "equal" });
    expect(missingFields(st.expense, st.data, M)).toEqual([]);
  });

  it("a photo-only draft with an unmatched name misses amount, currency, payer and split", () => {
    const st = initialState({ ...base, parsed: parseExpenseText(""), payer: "", photoId: "p1", asker: "Kengz" });
    expect(st.expense.slip_photo_ids).toEqual(["p1"]);
    expect(st.data).toEqual({ rev: 1, asker: "Kengz" });
    expect(missingFields(st.expense, st.data, M)).toEqual(["amount", "currency", "payer", "split"]);
  });

  it("keeps amount candidates for the picker", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("50 ข้าว 30 น้ำ"), payer: "เก่ง" });
    expect(st.expense.amount).toBe(0);
    expect(st.data.amountCandidates).toEqual([50, 30]);
  });

  it("turns a typed ฝาก 0 into the zero-owed state", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("500 บาท ฝาก 0"), payer: "เก่ง" });
    expect(st.data.owedZero).toBe(true);
    expect(st.data.owedAmount).toBeUndefined();
    expect(missingFields(st.expense, st.data, M)).toEqual(["owed"]);
  });
});

describe("settle", () => {
  it("saves a complete draft (pending off) and asks again otherwise", () => {
    const done: FlowState = { expense: exp({ payer: "เก่ง", amount: 120 }), step: "missing", data: { rev: 1, currencyConfirmed: true, splitMode: "none" } };
    expect(settle(done, M)).toEqual({ k: "saved", state: { ...done, expense: { ...done.expense, pending: false } } });
    const open = settle({ ...done, data: { rev: 1 } }, M);
    expect(open).toMatchObject({ k: "ask", state: { step: "missing" } });
  });

  it("for a saved expense, asks the first missing field's step", () => {
    const st: FlowState = { expense: exp({ payer: "เก่ง", amount: 120, pending: false }), step: "split", data: { rev: 1, currencyConfirmed: true, splitMode: "unequal" } };
    expect(settle(st, M)).toMatchObject({ k: "ask", state: { step: "owed" } });
  });

  it("a notice keeps an edit step open instead of saving", () => {
    const st: FlowState = { expense: exp({ payer: "เก่ง", amount: 120, pending: false }), step: "amount", data: { rev: 1, currencyConfirmed: true, splitMode: "none" } };
    expect(settle(st, M, "ยอดต้องมากกว่า 0 นะ")).toMatchObject({ k: "ask", state: { step: "amount" }, notice: "ยอดต้องมากกว่า 0 นะ" });
  });
});

describe("stateFromExpense", () => {
  const done = (over: Partial<Expense>) => exp({ payer: "เก่ง", amount: 120, fx_rate: 4.5, amount_thb: 540, pending: false, ...over });

  it("opens a confirmed expense at the edit step and recognises an equal split", () => {
    const st = stateFromExpense(done({ splits: [split("โอ", 270)] }), "HKD", "เก่ง");
    expect(st.step).toBe("edit");
    expect(st.data).toEqual({ rev: 1, asker: "เก่ง", currencyConfirmed: true, rateCurrency: "HKD", splitMode: "equal", partner: "โอ" });
    expect(missingFields(st.expense, st.data, M)).toEqual([]);
  });

  it("recovers the owed amount in the expense currency for an unequal split", () => {
    const st = stateFromExpense(done({ amount: 500, amount_thb: 2250, splits: [split("โอ", 90)] }), "HKD");
    expect(st.data.splitMode).toBe("unequal");
    expect(st.data.owedAmount).toBe(20);
  });

  it("recognises no split, and locks splits shared by more than one person", () => {
    expect(stateFromExpense(done({}), "HKD").data.splitMode).toBe("none");
    expect(stateFromExpense(done({ splits: [split("โอ", 100), split("ต้น", 100)] }), "HKD").data.lockedSplits).toBe(true);
  });

  it("opens a pending draft at the missing card", () => {
    const st = stateFromExpense(exp({ payer: "เก่ง" }), "HKD");
    expect(st.step).toBe("missing");
    expect(st.data.currencyConfirmed).toBeUndefined();
    expect(missingFields(st.expense, st.data, M)).toEqual(["amount", "currency", "split"]);
  });

  it("treats a parked draft's currency as chosen when the row shows it", () => {
    // HKD chosen in a HKD trip: the fetched rate gives it away.
    const fetched = stateFromExpense(exp({ payer: "เก่ง", amount: 120, fx_rate: 4.5, amount_thb: 540 }), "HKD");
    expect(fetched.data).toMatchObject({ currencyConfirmed: true, rateCurrency: "HKD" });
    // THB chosen in a HKD trip: the currency differs from the trip default.
    expect(stateFromExpense(exp({ payer: "เก่ง", amount: 120, currency: "THB" }), "HKD").data.currencyConfirmed).toBe(true);
    // Rate fetch failed (rate 1) but amount_thb was filled: confirmed, and the rate is fetched again.
    const failed = stateFromExpense(exp({ payer: "เก่ง", amount: 120, amount_thb: 120 }), "HKD");
    expect(failed.data.currencyConfirmed).toBe(true);
    expect(failed.data.rateCurrency).toBeUndefined();
  });

  it("still asks the currency when the draft only has the trip default", () => {
    const st = stateFromExpense(exp({ payer: "เก่ง", amount: 120 }), "HKD");
    expect(missingFields(st.expense, st.data, M)).toEqual(["currency", "split"]);
  });
});
```

(e) Replace the whole `describe("enterConflict / attachPhoto", …)` block with:

```ts
describe("enterConflict / attachPhoto", () => {
  const s: FlowState = { expense: exp({ payer: "เก่ง", amount: 120 }), step: "missing", data: { rev: 3 } };

  it("remembers where to resume, what to start next, and bumps the rev", () => {
    const c = enterConflict(s, { text: "50 กาแฟ" });
    expect(c.step).toBe("conflict");
    expect(c.data.resumeStep).toBe("missing");
    expect(c.data.pendingText).toBe("50 กาแฟ");
    expect(c.data.rev).toBe(4);
    const again = enterConflict(c, { photoId: "p2" });
    expect(again.data.resumeStep).toBe("missing");
    expect(again.data.rev).toBe(5);
  });

  it("attaches a photo and bumps the rev", () => {
    const a = attachPhoto(s, "p1");
    expect(a.expense.slip_photo_ids).toEqual(["p1"]);
    expect(a.data.rev).toBe(4);
  });
});
```

Also in the existing `describe("rate and finalize", …)` helper `st` the object has `step: "summary"`; change that literal to `step: "missing"`.

- [ ] **Step 2: Rewrite `lib/line-expense-flow-answers.test.ts`**

Replace the whole file with:

```ts
// lib/line-expense-flow-answers.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import { applyAnswer, type FlowData, type FlowEnv, type FlowState, type FlowStep, type Outcome } from "./line-expense-flow";

const env: FlowEnv = { members: ["เก่ง", "โอ"], tripCurrency: "HKD", homeCurrency: "THB" };
const env3: FlowEnv = { ...env, members: ["เก่ง", "โอ", "ต้น"] };

const full = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อื่นๆ", description: "",
  amount: 500, currency: "THB", fx_rate: 1, amount_thb: 500, payer: "เก่ง", slip_photo_ids: [], splits: [], pending: true,
  ...over,
});
const S = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}): FlowState => ({
  expense: full(e), step, data: { rev: 1, currencyConfirmed: true, splitMode: "none", ...d },
});
const asked = (o: Outcome): FlowState => {
  if (o.k !== "ask") throw new Error(`expected ask, got ${o.k}`);
  return o.state;
};
const savedState = (o: Outcome): FlowState => {
  if (o.k !== "saved") throw new Error(`expected saved, got ${o.k}`);
  return o.state;
};
const savedExpense = (o: Outcome): Expense => savedState(o).expense;

describe("applyAnswer: set on the missing card", () => {
  it("saves the moment the last field arrives (pending off)", () => {
    const o = applyAnswer(S("missing", { payer: "" }), { k: "set", bundle: { payer: "เก่ง" } }, env);
    expect(savedExpense(o)).toEqual({ ...full(), pending: false });
  });

  it("one bundle can fill several fields and save", () => {
    const base = S("missing", { amount: 0, payer: "" }, { currencyConfirmed: undefined, splitMode: undefined });
    const done = savedExpense(applyAnswer(base, { k: "set", bundle: { amount: 120, currency: "HKD", payer: "เก่ง", split: "equal" } }, env));
    expect(done).toMatchObject({ amount: 120, currency: "HKD", payer: "เก่ง", pending: false });
  });

  it("asks again with what is still missing and bumps the rev", () => {
    const st = asked(applyAnswer(S("missing", { payer: "" }, { splitMode: undefined }), { k: "set", bundle: { payer: "เก่ง" } }, env));
    expect(st.step).toBe("missing");
    expect(st.expense.payer).toBe("เก่ง");
    expect(st.data.rev).toBe(2);
  });

  it("leaves the rev alone when nothing changed", () => {
    const o = applyAnswer(S("missing", { amount: 0 }), { k: "set", bundle: { amount: 0 } }, env);
    expect(o).toMatchObject({ k: "ask", notice: "ยอดต้องมากกว่า 0 นะ" });
    expect(asked(o).data.rev).toBe(1);
  });

  it("picking an amount candidate removes it from the note and clears the picker", () => {
    const st = asked(applyAnswer(
      S("missing", { amount: 0, description: "50 ข้าว 30 น้ำ" }, { amountCandidates: [50, 30], currencyConfirmed: undefined }),
      { k: "set", bundle: { amount: 30 } }, env,
    ));
    expect(st.expense.amount).toBe(30);
    expect(st.expense.description).toBe("50 ข้าว น้ำ");
    expect(st.data.amountCandidates).toBeUndefined();
  });

  it("words typed with a first amount seed an empty note and re-guess the category; an existing note is kept", () => {
    const seeded = asked(applyAnswer(S("missing", { amount: 0 }, { currencyConfirmed: undefined }), { k: "set", bundle: { amount: 50, seedNote: "กาแฟ" } }, env));
    expect(seeded.expense).toMatchObject({ amount: 50, description: "กาแฟ", category: "อาหาร" });
    const kept = asked(applyAnswer(S("missing", { amount: 0, description: "แท็กซี่", category: "เดินทาง" }, { currencyConfirmed: undefined }), { k: "set", bundle: { amount: 50, seedNote: "กาแฟ" } }, env));
    expect(kept.expense).toMatchObject({ description: "แท็กซี่", category: "เดินทาง" });
  });

  it("refuses to split when nobody else is on the trip", () => {
    const o = applyAnswer(S("missing", {}, { splitMode: undefined }), { k: "set", bundle: { split: "equal" } }, { ...env, members: ["เก่ง"] });
    expect(o).toMatchObject({ k: "ask", notice: "ทริปนี้ไม่มีสมาชิกคนอื่นให้หาร" });
  });

  it("หารไม่เท่า asks the owed amount; 0 prompts; over-total re-asks; equal-to-total saves", () => {
    const base = S("missing", { amount: 500 }, { splitMode: undefined });
    const unequal = asked(applyAnswer(base, { k: "set", bundle: { split: "unequal" } }, env));
    expect(unequal.data.splitMode).toBe("unequal");
    const zero = asked(applyAnswer(unequal, { k: "set", bundle: { owed: 0 } }, env));
    expect(zero.data.owedZero).toBe(true);
    expect(applyAnswer(unequal, { k: "set", bundle: { owed: 600 } }, env)).toMatchObject({ k: "ask", notice: "เกินยอดรวม 500 ใส่ใหม่นะ" });
    expect(applyAnswer(unequal, { k: "set", bundle: { owed: 500 } }, env).k).toBe("saved");
  });

  it("an owed amount typed before the total is kept and re-checked when the total arrives", () => {
    const base = S("missing", { amount: 0 }, { splitMode: "unequal", owedAmount: 20 });
    expect(applyAnswer(base, { k: "set", bundle: { amount: 500 } }, env).k).toBe("saved");
    expect(applyAnswer(base, { k: "set", bundle: { amount: 10 } }, env)).toMatchObject({ k: "ask", state: { step: "missing" } });
  });

  it("owed zero prompt: switch to ไม่หาร (saves) or type again", () => {
    const base = S("missing", {}, { splitMode: "unequal", owedZero: true });
    expect(applyAnswer(base, { k: "owed_none" }, env)).toMatchObject({ k: "saved", state: { expense: { pending: false }, data: { splitMode: "none" } } });
    const retry = asked(applyAnswer(base, { k: "owed_retry" }, env));
    expect(retry.data.owedZero).toBeUndefined();
    expect(retry.step).toBe("missing");
  });

  it("a 3-person trip also needs the partner, and only a non-payer is accepted", () => {
    const base = S("missing", {}, { splitMode: undefined });
    const st = asked(applyAnswer(base, { k: "set", bundle: { split: "equal" } }, env3));
    expect(st.step).toBe("missing");
    expect(asked(applyAnswer(st, { k: "set", bundle: { partner: "เก่ง" } }, env3)).data.partner).toBeUndefined();
    const done = applyAnswer(st, { k: "set", bundle: { partner: "ต้น" } }, env3);
    expect(done.k).toBe("saved");
  });

  it("choosing the current partner as payer clears the partner", () => {
    const st = asked(applyAnswer(S("missing", { payer: "" }, { splitMode: "equal", partner: "โอ" }), { k: "set", bundle: { payer: "โอ" } }, env3));
    expect(st.data.partner).toBeUndefined();
  });

  it("ignores a payer that is not a member", () => {
    const st = asked(applyAnswer(S("missing", { payer: "" }), { k: "set", bundle: { payer: "ใครก็ไม่รู้" } }, env));
    expect(st.expense.payer).toBe("");
  });
});

describe("applyAnswer: the saved state carries the post-answer data", () => {
  it("the last button (split = equal) saves with splitMode set, so the splits can be built", () => {
    const base = S("missing", {}, { splitMode: undefined });
    const st = savedState(applyAnswer(base, { k: "set", bundle: { split: "equal" } }, env));
    expect(st.data.splitMode).toBe("equal");
    expect(st.expense.pending).toBe(false);
  });

  it("a typed bundle saves with currencyConfirmed and the split", () => {
    const base = S("missing", { amount: 120, currency: "HKD" }, { currencyConfirmed: undefined, splitMode: undefined });
    const st = savedState(applyAnswer(base, { k: "set", bundle: { currency: "HKD", split: "equal" } }, env));
    expect(st.data).toMatchObject({ currencyConfirmed: true, splitMode: "equal" });
  });

  it("หารไม่เท่า + owed saves with owedAmount", () => {
    const base = S("missing", { amount: 500 }, { splitMode: "unequal" });
    expect(savedState(applyAnswer(base, { k: "set", bundle: { owed: 20 } }, env)).data.owedAmount).toBe(20);
  });
});

describe("applyAnswer: resumeStep written by the old flow", () => {
  it("leaving a prompt maps an invalid resumeStep onto a real step", () => {
    const old = { resumeStep: "summary" } as unknown as FlowData;
    const draft = asked(applyAnswer(S("conflict", {}, old), { k: "conflict_resume" }, env));
    expect(draft.step).toBe("missing");
    const saved = asked(applyAnswer(S("conflict", { pending: false }, old), { k: "conflict_resume" }, env));
    expect(saved.step).toBe("edit");
  });
});

describe("applyAnswer: clear", () => {
  it("tapping an answered row clears that field and asks it again", () => {
    const cur = asked(applyAnswer(S("missing", {}, { rateCurrency: "THB" }), { k: "clear", field: "currency" }, env));
    expect(cur.data.currencyConfirmed).toBeUndefined();
    expect(cur.data.rateCurrency).toBeUndefined();
    const amt = asked(applyAnswer(S("missing"), { k: "clear", field: "amount" }, env));
    expect(amt.expense.amount).toBe(0);
    const pay = asked(applyAnswer(S("missing"), { k: "clear", field: "payer" }, env));
    expect(pay.expense.payer).toBe("");
    const spl = asked(applyAnswer(S("missing", {}, { splitMode: "unequal", owedAmount: 20 }), { k: "clear", field: "split" }, env));
    expect(spl.data.splitMode).toBeUndefined();
    expect(spl.data.owedAmount).toBeUndefined();
  });

  it("does nothing outside the missing card", () => {
    const st = S("category", { pending: false });
    expect(asked(applyAnswer(st, { k: "clear", field: "currency" }, env))).toEqual(st);
  });
});

describe("applyAnswer: cancel", () => {
  it("ยกเลิก on a draft asks delete-or-keep and remembers where it was", () => {
    const st = asked(applyAnswer(S("missing", {}, { splitMode: undefined }), { k: "cancel" }, env));
    expect(st.step).toBe("confirm_cancel");
    expect(st.data.resumeStep).toBe("missing");
  });

  it("ทำต่อ from the prompt returns to the card; keep and delete are outcomes", () => {
    const prompt = S("confirm_cancel", {}, { resumeStep: "missing", splitMode: undefined });
    const back = asked(applyAnswer(prompt, { k: "resume" }, env));
    expect(back.step).toBe("missing");
    expect(back.data.resumeStep).toBeUndefined();
    expect(applyAnswer(prompt, { k: "cancel_keep" }, env)).toEqual({ k: "keep" });
    expect(applyAnswer(prompt, { k: "cancel_delete" }, env)).toEqual({ k: "delete" });
  });

  it("delete / keep only count inside the prompt", () => {
    expect(applyAnswer(S("missing"), { k: "cancel_delete" }, env).k).toBe("ask");
  });

  it("ทำต่อ on the card re-shows it", () => {
    expect(asked(applyAnswer(S("missing", {}, { splitMode: undefined }), { k: "resume" }, env)).step).toBe("missing");
  });

  it("from a saved expense's delete prompt, ทำต่อ re-asks the prompt", () => {
    const st = asked(applyAnswer(S("edit", { pending: false }), { k: "ask_delete" }, env));
    expect(st.step).toBe("confirm_cancel");
    expect(asked(applyAnswer(st, { k: "resume" }, env)).step).toBe("confirm_cancel");
  });
});

describe("applyAnswer: editing a saved expense", () => {
  it("edit opens the picker; editfield asks that one field; the answer saves at once", () => {
    const picker = asked(applyAnswer(S("missing", { pending: false }), { k: "edit" }, env));
    expect(picker.step).toBe("edit");
    const cat = asked(applyAnswer(picker, { k: "editfield", field: "category" }, env));
    expect(cat.step).toBe("category");
    const out = applyAnswer(cat, { k: "set", bundle: { category: "ตั๋ว" } }, env);
    expect(out).toMatchObject({ k: "saved", state: { expense: { category: "ตั๋ว", pending: false } } });
  });

  it("edit does nothing on a pending draft; editfield only works from the picker", () => {
    expect(asked(applyAnswer(S("missing"), { k: "edit" }, env)).step).toBe("missing");
    expect(asked(applyAnswer(S("category", { pending: false }), { k: "editfield", field: "note" }, env)).step).toBe("category");
  });

  it("an invalid amount keeps the amount question open", () => {
    const o = applyAnswer(S("amount", { pending: false }), { k: "set", bundle: { amount: 0 } }, env);
    expect(o).toMatchObject({ k: "ask", notice: "ยอดต้องมากกว่า 0 นะ", state: { step: "amount" } });
  });

  it("changing the split to unequal asks the owed amount before saving", () => {
    const st = asked(applyAnswer(S("split", { pending: false }, { splitMode: "equal" }), { k: "set", bundle: { split: "unequal" } }, env));
    expect(st.step).toBe("owed");
    expect(applyAnswer(st, { k: "set", bundle: { owed: 20 } }, env).k).toBe("saved");
  });

  it("editing the note replaces it, including with an empty one", () => {
    const out = applyAnswer(S("note", { pending: false, description: "เก่า" }), { k: "set", bundle: { note: "" } }, env);
    expect(savedExpense(out).description).toBe("");
  });
});

describe("applyAnswer: conflict", () => {
  it("resume goes back to where the flow was; park / drop carry the pending input", () => {
    const c = S("conflict", {}, { resumeStep: "missing", splitMode: undefined, pendingText: "50 ข้าว" });
    const resumed = asked(applyAnswer(c, { k: "conflict_resume" }, env));
    expect(resumed.step).toBe("missing");
    expect(resumed.data.pendingText).toBeUndefined();
    expect(applyAnswer(c, { k: "conflict_park" }, env)).toEqual({ k: "park", pendingText: "50 ข้าว", pendingPhotoId: undefined });
    const p = S("conflict", {}, { resumeStep: "missing", pendingPhotoId: "p9" });
    expect(applyAnswer(p, { k: "conflict_drop" }, env)).toEqual({ k: "drop", pendingText: undefined, pendingPhotoId: "p9" });
  });

  it("conflict choices only count inside the conflict prompt", () => {
    expect(applyAnswer(S("missing"), { k: "conflict_drop" }, env).k).toBe("ask");
  });
});
```

- [ ] **Step 3: Append the `interpretAnswer` / `postbackToAnswer` tests**

In `lib/line-expense-answers.test.ts` change the import to
`import { interpretAnswer, interpretBundle, postbackToAnswer } from "./line-expense-answers";`
and append:

```ts
const st = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}) => ({ step, expense: exp({ amount: 120, payer: "เก่ง", ...e }), data: d });

describe("interpretAnswer", () => {
  it("accepts ยกเลิก / ทำต่อ at any step, and no longer a typed ย้อน", () => {
    expect(interpretAnswer(st("missing"), "ยกเลิก", M)).toEqual({ k: "cancel" });
    expect(interpretAnswer(st("category"), "ทำต่อ", M)).toEqual({ k: "resume" });
    expect(interpretAnswer(st("missing"), "↩ ย้อน", M)).toBeNull();
  });

  it("missing card: typed text becomes a bundle", () => {
    expect(interpretAnswer(st("missing", { payer: "" }), "HKD โอ หารเท่า", M))
      .toEqual({ k: "set", bundle: { currency: "HKD", payer: "โอ", split: "equal" } });
    expect(interpretAnswer(st("missing"), "สวัสดี", M)).toBeNull();
  });

  it("missing card: the zero-owed prompt answers", () => {
    const d: FlowData = { owedZero: true, splitMode: "unequal" };
    expect(interpretAnswer(st("missing", {}, d), "เปลี่ยนเป็นไม่หาร", M)).toEqual({ k: "owed_none" });
    expect(interpretAnswer(st("missing", {}, d), "ใส่ใหม่", M)).toEqual({ k: "owed_retry" });
  });

  it("view commands are never answers, whatever the step (so แพลน leaves the draft alone)", () => {
    for (const step of ["missing", "note", "payer", "owed"] as FlowStep[]) {
      expect(interpretAnswer(st(step), "แพลน", M)).toBeNull();
      expect(interpretAnswer(st(step), "ขอดูข้อมูล wifi", M)).toBeNull();
    }
  });

  it("edit steps read one field", () => {
    expect(interpretAnswer(st("amount"), "1,200", M)).toEqual({ k: "set", bundle: { amount: 1200 } });
    expect(interpretAnswer(st("amount"), "ข้าว", M)).toBeNull();
    expect(interpretAnswer(st("currency"), "hk", M)).toEqual({ k: "set", bundle: { currency: "HKD" } });
    expect(interpretAnswer(st("payer"), "โอ", M)).toEqual({ k: "set", bundle: { payer: "โอ" } });
    expect(interpretAnswer(st("payer"), "สวัสดี", M)).toBeNull();
    expect(interpretAnswer(st("payer"), "แม่", [])).toEqual({ k: "set", bundle: { payer: "แม่" } });
    expect(interpretAnswer(st("split"), "ไม่หาร", M)).toEqual({ k: "set", bundle: { split: "none" } });
    expect(interpretAnswer(st("split"), "หารกัน", M)).toBeNull();
    expect(interpretAnswer(st("partner"), "ต้น", M3)).toEqual({ k: "set", bundle: { partner: "ต้น" } });
    expect(interpretAnswer(st("owed"), "20", M)).toEqual({ k: "set", bundle: { owed: 20 } });
    expect(interpretAnswer(st("owed", {}, { owedZero: true }), "ใส่ใหม่", M)).toEqual({ k: "owed_retry" });
    expect(interpretAnswer(st("category"), "ตั๋ว", M)).toEqual({ k: "set", bundle: { category: "ตั๋ว" } });
    expect(interpretAnswer(st("category"), "ข้าว", M)).toBeNull();
    expect(interpretAnswer(st("note"), "ข้าวมันไก่ร้านดัง", M)).toEqual({ k: "set", bundle: { note: "ข้าวมันไก่ร้านดัง" } });
    expect(interpretAnswer(st("note"), "-", M)).toEqual({ k: "set", bundle: { note: "" } });
    expect(interpretAnswer(st("edit"), "หมวด", M)).toEqual({ k: "editfield", field: "category" });
    expect(interpretAnswer(st("edit"), "ยอดเท่าไหร่", M)).toBeNull();
  });

  it("prompt steps", () => {
    expect(interpretAnswer(st("confirm_cancel"), "ลบทิ้ง", M)).toEqual({ k: "cancel_delete" });
    expect(interpretAnswer(st("confirm_cancel"), "ลบรายการนี้", M)).toEqual({ k: "cancel_delete" });
    expect(interpretAnswer(st("confirm_cancel"), "เก็บไว้กรอกทีหลัง", M)).toEqual({ k: "cancel_keep" });
    expect(interpretAnswer(st("confirm_cancel"), "ไม่ลบ", M)).toEqual({ k: "cancel_keep" });
    expect(interpretAnswer(st("conflict"), "ทิ้งอันเก่า", M)).toEqual({ k: "conflict_drop" });
    expect(interpretAnswer(st("conflict"), "เก็บไว้ เริ่มใหม่", M)).toEqual({ k: "conflict_park" });
    expect(interpretAnswer(st("conflict"), "ทำต่ออันเก่า", M)).toEqual({ k: "conflict_resume" });
    expect(interpretAnswer(st("confirm_cancel"), "โอเค", M)).toBeNull();
  });
});

describe("postbackToAnswer", () => {
  it("x_set reads one field", () => {
    expect(postbackToAnswer({ a: "x_set", f: "payer", w: "โอ" })).toEqual({ k: "set", bundle: { payer: "โอ" } });
    expect(postbackToAnswer({ a: "x_set", f: "amount", w: "30" })).toEqual({ k: "set", bundle: { amount: 30 } });
    expect(postbackToAnswer({ a: "x_set", f: "currency", w: "HKD" })).toEqual({ k: "set", bundle: { currency: "HKD" } });
    expect(postbackToAnswer({ a: "x_set", f: "split", w: "equal" })).toEqual({ k: "set", bundle: { split: "equal" } });
    expect(postbackToAnswer({ a: "x_set", f: "partner", w: "ต้น" })).toEqual({ k: "set", bundle: { partner: "ต้น" } });
    expect(postbackToAnswer({ a: "x_set", f: "category", w: "ตั๋ว" })).toEqual({ k: "set", bundle: { category: "ตั๋ว" } });
  });

  it("rejects bad values and unknown fields", () => {
    expect(postbackToAnswer({ a: "x_set", f: "split", w: "bogus" })).toBeNull();
    expect(postbackToAnswer({ a: "x_set", f: "amount", w: "abc" })).toBeNull();
    expect(postbackToAnswer({ a: "x_set", f: "category", w: "ไม่มี" })).toBeNull();
    expect(postbackToAnswer({ a: "x_set", f: "nope", w: "x" })).toBeNull();
    expect(postbackToAnswer({ a: "x_set", f: "payer", w: "" })).toBeNull();
  });

  it("maps the other actions", () => {
    expect(postbackToAnswer({ a: "x_clear", f: "currency" })).toEqual({ k: "clear", field: "currency" });
    expect(postbackToAnswer({ a: "x_clear", f: "category" })).toBeNull();
    expect(postbackToAnswer({ a: "x_owed_zero", w: "retry" })).toEqual({ k: "owed_retry" });
    expect(postbackToAnswer({ a: "x_owed_zero", w: "none" })).toEqual({ k: "owed_none" });
    expect(postbackToAnswer({ a: "x_editfield", w: "note" })).toEqual({ k: "editfield", field: "note" });
    expect(postbackToAnswer({ a: "x_editfield", w: "bogus" })).toBeNull();
    expect(postbackToAnswer({ a: "x_edit" })).toEqual({ k: "edit" });
    expect(postbackToAnswer({ a: "x_del" })).toEqual({ k: "ask_delete" });
    expect(postbackToAnswer({ a: "x_cancel" })).toEqual({ k: "cancel" });
    expect(postbackToAnswer({ a: "x_cancel_delete" })).toEqual({ k: "cancel_delete" });
    expect(postbackToAnswer({ a: "x_cancel_keep" })).toEqual({ k: "cancel_keep" });
    expect(postbackToAnswer({ a: "x_conflict_resume" })).toEqual({ k: "conflict_resume" });
    expect(postbackToAnswer({ a: "x_conflict_park" })).toEqual({ k: "conflict_park" });
    expect(postbackToAnswer({ a: "x_conflict_drop" })).toEqual({ k: "conflict_drop" });
  });

  it("the buttons of the removed flow are not answers", () => {
    for (const a of ["x_confirm", "x_back", "x_payer", "x_currency", "x_split", "x_amount", "plan_day"]) {
      expect(postbackToAnswer({ a, v: "1" })).toBeNull();
    }
  });
});
```
Also change the type import at the top of that file to `import type { FlowData, FlowStep } from "./line-expense-flow";`.

- [ ] **Step 4: Rewrite `lib/line-expense-messages.test.ts`**

Replace the whole file with:

```ts
// lib/line-expense-messages.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import type { FlowData, FlowEnv, FlowState, FlowStep } from "./line-expense-flow";
import { amountLine, missingCard, questionMessage, savedCard, splitLine, stepMessages, MSG, reaskFor } from "./line-expense-messages";
import { actions, findNode, hasEmptyText, texts } from "./line-test-helpers";

const env: FlowEnv = { members: ["เก่ง", "โอ"], tripCurrency: "HKD", homeCurrency: "THB" };
const cc = { origin: "https://app.test", tripName: "HKG กวางโจว" };
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อาหาร", description: "ข้าว",
  amount: 120, currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [],
  splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }], pending: true,
  ...over,
});
const S = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}): FlowState => ({
  expense: exp(e), step, data: { rev: 2, asker: "เก่ง", currencyConfirmed: true, splitMode: "equal", ...d },
});
const card = (st: FlowState, e = env, notice?: string) => missingCard(st, e, cc, notice);

describe("missingCard", () => {
  const open = S("missing", { payer: "", splits: [] }, { splitMode: undefined });

  it("is one flex bubble: title, how many are left, hint, cancel, trip name", () => {
    const msgs = card(open);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("flex");
    const t = texts(msgs[0]);
    expect(t).toContain("💸 120 HKD · ข้าว");
    expect(t).toContain("เหลืออีก 2 อย่าง");
    expect(t).toContain('พิมพ์ตอบทีเดียวก็ได้ เช่น "HKD เก่ง หารเท่า"');
    expect(t).toContain("ทริป HKG กวางโจว");
    expect(t).toContain("@เก่ง");
    expect(actions(msgs[0]).map((a) => a.label)).toContain("🗑 ยกเลิก");
  });

  it("has buttons only for the missing fields, plus a tap-to-change row for each answered one", () => {
    const acts = actions(card(open)[0]).filter((a) => a.data.a !== "x_cancel");
    const sets = acts.filter((a) => a.data.a === "x_set").map((a) => [a.data.f, a.data.w]);
    expect(sets).toEqual([["payer", "เก่ง"], ["payer", "โอ"], ["split", "none"], ["split", "equal"], ["split", "unequal"]]);
    const clears = acts.filter((a) => a.data.a === "x_clear").map((a) => a.data.f);
    expect(clears).toEqual(["amount", "currency"]);
    expect(acts.every((a) => a.data.e === "e1" && a.data.v === "2")).toBe(true);
  });

  it("answered rows show ✓ label and value", () => {
    const t = texts(card(open)[0]);
    expect(t).toContain("✓ ยอด");
    expect(t).toContain("120");
    expect(t).toContain("✓ สกุลเงิน");
    expect(t).toContain("HKD");
  });

  it("asks the currency with the trip and home currency buttons", () => {
    const st = S("missing", {}, { currencyConfirmed: undefined, splitMode: "none" });
    const sets = actions(card(st)[0]).filter((a) => a.data.f === "currency").map((a) => a.data.w);
    expect(sets).toEqual(["HKD", "THB"]);
  });

  it("amount row: typing hint plus candidate buttons", () => {
    const st = S("missing", { amount: 0, description: "" }, { amountCandidates: [50, 30], currencyConfirmed: undefined, splitMode: undefined });
    const msg = card(st)[0];
    expect(texts(msg)).toContain("พิมพ์ตัวเลข เช่น 120");
    expect(actions(msg).filter((a) => a.data.f === "amount").map((a) => [a.label, a.data.w])).toEqual([["50", "50"], ["30", "30"]]);
  });

  it("title: photo-only and brand-new drafts", () => {
    const photo = S("missing", { amount: 0, description: "", slip_photo_ids: ["p1"] }, { currencyConfirmed: undefined });
    expect(texts(card(photo)[0])).toContain("💸 รับสลิปแล้ว 📸");
    expect(JSON.stringify(card(photo)[0])).toContain("https://app.test/api/img/p1");
    const blank = S("missing", { amount: 0, description: "" }, { currencyConfirmed: undefined });
    expect(texts(card(blank)[0])).toContain("💸 รายการใหม่");
  });

  it("the currency is not shown in the title until it was chosen", () => {
    const st = S("missing", {}, { currencyConfirmed: undefined });
    expect(texts(card(st)[0])).toContain("💸 120 · ข้าว");
  });

  it("owed row: wait for the total, typing hint, zero prompt, over-total warning, answered value", () => {
    const base: Partial<Expense> = { payer: "เก่ง" };
    const noTotal = card(S("missing", { ...base, amount: 0 }, { splitMode: "unequal" }))[0];
    expect(texts(noTotal)).toContain("ใส่ยอดรวมก่อน");
    const hint = card(S("missing", { ...base, amount: 500 }, { splitMode: "unequal" }))[0];
    expect(texts(hint)).toContain("ยอดที่ฝากจ่าย — พิมพ์ตัวเลข เช่น ฝาก 20");
    const zero = card(S("missing", base, { splitMode: "unequal", owedZero: true }))[0];
    expect(actions(zero).filter((a) => a.data.a === "x_owed_zero").map((a) => a.data.w)).toEqual(["none", "retry"]);
    const over = card(S("missing", { ...base, amount: 500 }, { splitMode: "unequal", owedAmount: 600 }))[0];
    expect(texts(over).join("\n")).toContain("เกินยอดรวม 500");
    const ok = card(S("missing", { ...base, amount: 500 }, { splitMode: "unequal", owedAmount: 20 }));
    expect(texts(ok[0])).toContain("20 HKD");
    expect(texts(ok[0])).toContain("เหลืออีก 0 อย่าง");
  });

  it("3 members: asks who to split with among the others", () => {
    const st = S("missing", {}, { splitMode: "equal" });
    const sets = actions(card(st, { ...env, members: ["เก่ง", "โอ", "ต้น"] })[0]).filter((a) => a.data.f === "partner").map((a) => a.data.w);
    expect(sets).toEqual(["โอ", "ต้น"]);
  });

  it("one member: only ไม่หาร is offered", () => {
    const st = S("missing", {}, { splitMode: undefined });
    const sets = actions(card(st, { ...env, members: ["เก่ง"] })[0]).filter((a) => a.data.f === "split").map((a) => a.data.w);
    expect(sets).toEqual(["none"]);
  });

  it("splits made in the app are described, not asked", () => {
    const st = S("missing", {}, { lockedSplits: true, splitMode: undefined });
    const msg = card(st)[0];
    expect(texts(msg)).toContain("⚖️ หารหลายคน (แก้ในแอป)");
    expect(actions(msg).filter((a) => a.data.f === "split")).toEqual([]);
  });

  it("puts a notice in a plain text message above the card", () => {
    const msgs = card(open, env, "ปุ่มนี้หมดอายุแล้ว");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ type: "text", text: "ปุ่มนี้หมดอายุแล้ว" });
  });

  it("never has an empty text node, long labels or oversized postback data", () => {
    const sts = [
      open,
      S("missing", { amount: 0, description: "", payer: "" }, { currencyConfirmed: undefined, splitMode: "unequal", owedZero: true, asker: undefined }),
      S("missing", { description: "" }, { lockedSplits: true }),
    ];
    for (const st of sts) {
      const msg = card(st, { ...env, members: ["เก่ง", "โอ", "ต้น"] })[0];
      expect(hasEmptyText(msg)).toBe(false);
      for (const a of actions(msg)) expect(a.label.length).toBeLessThanOrEqual(20);
    }
    for (const a of actions(card(open)[0])) expect(JSON.stringify(a).length).toBeLessThan(300);
  });
});

describe("questionMessage (editing a saved expense, and the two prompts)", () => {
  it("the picker offers the six fields", () => {
    const msg = questionMessage(S("edit", { pending: false }), env);
    expect(texts(msg)[0]).toBe("@เก่ง แก้ข้อไหน?");
    expect(actions(msg).map((a) => [a.data.a, a.data.w])).toEqual([
      ["x_editfield", "amount"], ["x_editfield", "currency"], ["x_editfield", "payer"],
      ["x_editfield", "split"], ["x_editfield", "category"], ["x_editfield", "note"],
    ]);
  });

  it("single-field questions use x_set with the rev", () => {
    const pay = questionMessage(S("payer", { pending: false }), env);
    expect(texts(pay)[0]).toBe("@เก่ง ใครจ่าย?");
    expect(actions(pay).map((a) => [a.data.a, a.data.f, a.data.w, a.data.e, a.data.v])).toEqual([
      ["x_set", "payer", "เก่ง", "e1", "2"], ["x_set", "payer", "โอ", "e1", "2"],
    ]);
    expect(actions(questionMessage(S("split", { pending: false }), env)).map((a) => a.data.w)).toEqual(["none", "equal", "unequal"]);
    expect(actions(questionMessage(S("split", { pending: false }), { ...env, members: ["เก่ง"] })).map((a) => a.data.w)).toEqual(["none"]);
    expect(actions(questionMessage(S("currency", { pending: false }), env)).map((a) => a.data.w)).toEqual(["HKD", "THB"]);
    expect(actions(questionMessage(S("category", { pending: false }), env))).toHaveLength(6);
  });

  it("note question offers a typed ไม่มีโน้ต", () => {
    const msg = questionMessage(S("note", { pending: false }), env);
    expect(JSON.stringify(msg)).toContain('"text":"-"');
  });

  it("owed question: zero prompt and over-total warning", () => {
    const zero = actions(questionMessage(S("owed", { pending: false }, { splitMode: "unequal", owedZero: true }), env));
    expect(zero.map((a) => [a.data.a, a.data.w])).toEqual([["x_owed_zero", "none"], ["x_owed_zero", "retry"]]);
    const over = texts(questionMessage(S("owed", { amount: 500, pending: false }, { splitMode: "unequal", owedAmount: 600 }), env))[0];
    expect(over).toContain("เกินยอดรวม 500");
    expect(over).toContain("โอ ฝากจ่ายเท่าไหร่?");
  });

  it("cancel prompt differs for a draft and a saved expense", () => {
    const draft = questionMessage(S("confirm_cancel"), env);
    expect(actions(draft).map((a) => [a.label, a.data.a])).toEqual([["ลบทิ้ง", "x_cancel_delete"], ["เก็บไว้กรอกทีหลัง", "x_cancel_keep"]]);
    const saved = questionMessage(S("confirm_cancel", { pending: false }), env);
    expect(texts(saved)[0]).toBe("@เก่ง รายการนี้บันทึกแล้ว ลบทิ้งจริงไหม?");
    expect(actions(saved).map((a) => [a.label, a.data.a])).toEqual([["ลบรายการนี้", "x_cancel_delete"], ["ไม่ลบ", "x_cancel_keep"]]);
  });

  it("conflict text shows the currency once chosen, and says แก้ for a saved expense", () => {
    expect(texts(questionMessage(S("conflict", {}, { currencyConfirmed: undefined }), env))[0]).toBe("@เก่ง มีรายการค้างอยู่ (120 ข้าว) จะทำยังไงดี?");
    expect(texts(questionMessage(S("conflict"), env))[0]).toBe("@เก่ง มีรายการค้างอยู่ (120 HKD ข้าว) จะทำยังไงดี?");
    expect(texts(questionMessage(S("conflict", { pending: false }), env))[0]).toBe("@เก่ง กำลังแก้รายการ (120 HKD ข้าว) อยู่ จะทำยังไงดี?");
    expect(actions(questionMessage(S("conflict"), env)).map((a) => a.data.a)).toEqual(["x_conflict_resume", "x_conflict_park", "x_conflict_drop"]);
  });

  it("puts a notice right after the @name and keeps labels within 20 characters", () => {
    expect(texts(questionMessage(S("amount", { amount: 0 }), env, "ยอดต้องมากกว่า 0 นะ"))[0])
      .toBe("@เก่ง ยอดต้องมากกว่า 0 นะ\nยอดเท่าไหร่? พิมพ์ตัวเลขมาได้เลย");
    const steps: FlowStep[] = ["payer", "amount", "currency", "split", "partner", "owed", "category", "note", "edit", "confirm_cancel", "conflict"];
    for (const step of steps) {
      for (const a of actions(questionMessage(S(step, {}, { owedZero: true }), env))) expect(a.label.length).toBeLessThanOrEqual(20);
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

describe("savedCard", () => {
  const msg = savedCard(exp({ pending: false, slip_photo_ids: ["p1"] }), { splitMode: "equal" }, "https://app.test", "HKG กวางโจว");

  it("shows ✅ บันทึกแล้ว, the summary lines and the trip name", () => {
    expect(msg.altText).toBe("บันทึกแล้ว: 120 HKD (~540฿)");
    const t = texts(msg);
    expect(t).toContain("✅ บันทึกแล้ว");
    expect(t).toContain("120 HKD (~540฿)");
    expect(t).toContain("👤 เก่ง จ่าย");
    expect(t).toContain("ทริป HKG กวางโจว");
    expect(JSON.stringify(msg)).toContain("https://app.test/api/img/p1");
  });

  it("has ✏️ แก้ and 🗑 ลบ that carry only the expense id, plus the app link", () => {
    const acts = actions(msg);
    expect(acts.filter((a) => a.type === "postback").map((a) => [a.label, a.data])).toEqual([
      ["✏️ แก้", { a: "x_edit", e: "e1" }], ["🗑 ลบ", { a: "x_del", e: "e1" }],
    ]);
    expect(acts.find((a) => a.type === "uri" && a.uri.endsWith("/trips/t1/money"))).toBeDefined();
  });

  it("has no ✅ ยืนยัน button and warns when the rate could not be fetched", () => {
    expect(actions(msg).map((a) => a.data.a)).not.toContain("x_confirm");
    const warn = savedCard(exp({ pending: false }), { splitMode: "equal", fxFailed: true }, "https://app.test", "HK");
    expect(texts(warn).join("\n")).toContain("ดึงเรตไม่ได้");
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("omits the trip line when the name is empty", () => {
    const m = savedCard(exp({ pending: false }), {}, "https://app.test", "");
    expect(texts(m).some((t) => t.startsWith("ทริป"))).toBe(false);
  });
});

describe("stepMessages / reaskFor", () => {
  it("the missing step is the card; every other step is one question", () => {
    expect(stepMessages(S("missing"), env, cc)[0].type).toBe("flex");
    expect(findNode(stepMessages(S("missing"), env, cc, "x"), (n) => n.text === "x")).toBeDefined();
    const q = stepMessages(S("category", { pending: false }), env, cc, "x");
    expect(q).toHaveLength(1);
    expect(q[0].type).toBe("text");
  });

  it("the reask text depends on the step", () => {
    expect(reaskFor("missing")).toBe(MSG.reask);
    expect(MSG.reask).toBe("ไม่เข้าใจ ลองกดปุ่ม หรือพิมพ์ เช่น HKD เก่ง หารเท่า");
    expect(reaskFor("conflict")).toBe(MSG.reaskPrompt);
    expect(reaskFor("category")).toBe(MSG.reaskPrompt);
  });
});
```

- [ ] **Step 5: Rewrite `lib/line-handlers/expense.test.ts`**

Replace the whole file with:

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
import { updateRow } from "@/lib/store";

const TRIP: Trip = {
  id: "t1", name: "HK", destination: "Hong Kong", start_date: "2026-11-20", end_date: "2026-11-25",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const KEY = "group:g1:user:u1";
const NOW = new Date("2026-11-21T03:00:00.000Z");
const member = (id: string, name: string): Member => ({ id, trip_id: "t1", name, color: "", promptpay_id: "" });
const DONE = (over: Record<string, unknown> = {}) => ({
  id: "done1", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อาหาร", description: "ข้าว", amount: 120,
  currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [],
  splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }], pending: false, ...over,
});

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
const rev = () => String((session()?.data as { rev?: number } | undefined)?.rev ?? 0);
const live = () => ({ e: expenses()[0].id, v: rev() });

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

describe("capture: one card, auto-save", () => {
  it("a complete one-line entry saves at once: pending off, no session, saved card with edit/delete and the trip", async () => {
    const reply = await say("120 บาท ข้าวมันไก่ ไม่หาร");
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0]).toMatchObject({
      amount: 120, currency: "THB", fx_rate: 1, amount_thb: 120, payer: "เก่ง",
      category: "อาหาร", description: "ข้าวมันไก่", splits: [], pending: false,
    });
    expect(session()).toBeUndefined();
    const o = out(reply);
    expect(o).toContain("✅ บันทึกแล้ว");
    expect(o).toContain("a=x_edit");
    expect(o).toContain("a=x_del");
    expect(o).toContain("ทริป HK");
    expect(o).not.toContain("x_confirm");
  });

  it("an incomplete entry is saved as a pending draft and asks everything missing in ONE card", async () => {
    const reply = await say("120 ข้าว");
    expect(expenses()[0]).toMatchObject({ amount: 120, payer: "เก่ง", pending: true });
    expect(session()).toMatchObject({ step: "missing", expense_id: expenses()[0].id });
    expect((session()?.data as { rev: number }).rev).toBe(1);
    const o = out(reply);
    expect(o).toContain("เหลืออีก 2 อย่าง");
    expect(o).toContain("f=currency");
    expect(o).toContain("f=split");
    expect(o).not.toContain("ใครจ่าย?");
    expect(reply.mock.calls.at(-1)?.[0]).toHaveLength(1);
  });

  it("buttons answer one field each and the last one saves", async () => {
    await say("120 ข้าว");
    await tap({ a: "x_set", f: "currency", w: "HKD", ...live() });
    expect(expenses()[0]).toMatchObject({ currency: "HKD", fx_rate: 4.5, amount_thb: 540, pending: true });
    expect(rev()).toBe("2");
    const reply = await tap({ a: "x_set", f: "split", w: "equal", ...live() });
    expect(expenses()[0]).toMatchObject({ pending: false, splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }] });
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("✅ บันทึกแล้ว");
    expect(out(reply)).toContain("https://app.test/trips/t1/money");
  });

  it("typing several fields at once saves", async () => {
    await say("120 ข้าว");
    const reply = await answer("HKD หารเท่า");
    expect(expenses()[0]).toMatchObject({ currency: "HKD", amount_thb: 540, pending: false });
    expect(expenses()[0].splits).toHaveLength(1);
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("บันทึกแล้ว");
  });

  it("a partial typed answer re-sends the card with fewer rows left", async () => {
    await say("120 ข้าว");
    const reply = await answer("HKD");
    expect(session()?.step).toBe("missing");
    expect(out(reply)).toContain("เหลืออีก 1 อย่าง");
    expect(expenses()[0].pending).toBe(true);
  });

  it("text that fills no field re-sends the same card with the not-understood notice", async () => {
    await say("120 ข้าว");
    const before = rev();
    const { ctx, reply } = textCtx("สวัสดี");
    await handleRoute(ctx, { kind: "flow_reask" });
    expect(out(reply)).toContain("ไม่เข้าใจ ลองกดปุ่ม หรือพิมพ์ เช่น HKD เก่ง หารเท่า");
    expect(rev()).toBe(before);
  });

  it("converts with the fetched rate and splits equally, rounding the other share up", async () => {
    await say("120 HKD ข้าว หาร");
    expect(fetchRate).toHaveBeenCalledWith("HKD");
    expect(expenses()[0]).toMatchObject({
      fx_rate: 4.5, amount_thb: 540, pending: false,
      splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }],
    });
  });

  it("falls back to rate 1 and warns on the saved card when the FX fetch fails", async () => {
    vi.mocked(fetchRate).mockRejectedValue(new Error("down"));
    const reply = await say("120 HKD ข้าว หาร");
    expect(expenses()[0]).toMatchObject({ fx_rate: 1, amount_thb: 120, pending: false });
    expect(out(reply)).toContain("ดึงเรตไม่ได้");
  });

  it("asks who paid when the LINE name matches no member, then accepts a typed name and saves", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const first = await say("120 บาท ข้าว ไม่หาร");
    expect(session()?.step).toBe("missing");
    expect(out(first)).toContain("f=payer");
    expect(out(first)).toContain("@Kengz");
    await answer("โอ");
    expect(expenses()[0]).toMatchObject({ payer: "โอ", pending: false });
    expect(session()).toBeUndefined();
  });

  it("tapping an answered row clears it and asks it again", async () => {
    await say("120 HKD ข้าว");
    const reply = await tap({ a: "x_clear", f: "currency", ...live() });
    expect((session()?.data as Record<string, unknown>).currencyConfirmed).toBeUndefined();
    expect(expenses()[0].amount_thb).toBe(0);
    expect(out(reply)).toContain("f=currency");
  });

  it("owed typed together with the total: 500 บาท เซเว่น ฝาก 20", async () => {
    await say("500 บาท เซเว่น ฝาก 20");
    expect(expenses()[0]).toMatchObject({ amount: 500, pending: false, splits: [{ name: "โอ", amount_thb: 20 }] });
  });
});

describe("saving uses the answer just given", () => {
  it("(a) the last button tap saves with the split built and shown", async () => {
    await say("120 ข้าว");
    await tap({ a: "x_set", f: "currency", w: "HKD", ...live() });
    const reply = await tap({ a: "x_set", f: "split", w: "equal", ...live() });
    expect(expenses()[0].splits).toEqual([{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }]);
    expect(out(reply)).toContain("หารเท่า: โอคืน 270฿");
    expect(out(reply)).not.toContain("⚖️ ไม่หาร");
  });

  it("(d) typing HKD หารเท่า saves with the rate fetched and the split", async () => {
    await say("120 ข้าว");
    const reply = await answer("HKD หารเท่า");
    expect(fetchRate).toHaveBeenCalledWith("HKD");
    expect(expenses()[0]).toMatchObject({ fx_rate: 4.5, amount_thb: 540, pending: false });
    expect(expenses()[0].splits).toHaveLength(1);
    expect(out(reply)).toContain("120 HKD (~540฿)");
    expect(out(reply)).toContain("หารเท่า: โอคืน 270฿");
  });

  it("(f) หารไม่เท่า then a typed owed amount saves the owed split", async () => {
    await say("500 HKD ข้าว");
    await tap({ a: "x_set", f: "split", w: "unequal", ...live() });
    expect(session()?.step).toBe("missing");
    const reply = await answer("20");
    expect(expenses()[0]).toMatchObject({ pending: false, splits: [{ name: "โอ", amount_thb: 90 }] });
    expect(out(reply)).toContain("หารไม่เท่า");
    expect(out(reply)).toContain("โอคืน 90฿");
  });

  it("editing a saved split to หารไม่เท่า then typing 20 shows the new split on the card", async () => {
    db.rows.expenses = [DONE()];
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_editfield", w: "split", e: "done1", v: rev() });
    await tap({ a: "x_set", f: "split", w: "unequal", e: "done1", v: rev() });
    const reply = await answer("20");
    expect(expenses()[0].splits).toEqual([{ name: "โอ", amount_thb: 90, paid: false, paid_slip_photo_ids: [] }]);
    expect(out(reply)).toContain("หารไม่เท่า");
    expect(out(reply)).toContain("โอคืน 90฿");
  });
});

describe("@name in the first message", () => {
  it("names the payer over the LINE name, is not part of the note, and saves at once", async () => {
    const reply = await say("120 HKD ข้าว @เก่ง หาร");
    expect(expenses()[0]).toMatchObject({ payer: "เก่ง", description: "ข้าว", pending: false });
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("บันทึกแล้ว");
  });

  it("when the LINE name matches nobody, @name means no payer question", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const reply = await say("120 HKD ข้าว @โอ หาร");
    expect(expenses()[0]).toMatchObject({ payer: "โอ", pending: false, splits: [{ name: "เก่ง" }] });
    expect(session()).toBeUndefined();
    expect(out(reply)).not.toContain("f=payer");
  });
});

describe("stale buttons", () => {
  it("a wrong revision does nothing and re-sends the current card with the expired notice", async () => {
    await say("120 ข้าว");
    const before = rev();
    const reply = await tap({ a: "x_set", f: "currency", w: "HKD", e: expenses()[0].id, v: "0" });
    expect(session()?.step).toBe("missing");
    expect(rev()).toBe(before);
    expect(expenses()[0]).toMatchObject({ currency: "HKD", amount_thb: 0 });
    expect((session()?.data as Record<string, unknown>).currencyConfirmed).toBeUndefined();
    expect(out(reply)).toContain("ปุ่มนี้หมดอายุแล้ว");
    expect(out(reply)).toContain("f=currency");
  });

  it("a button of another expense does nothing", async () => {
    await say("120 ข้าว");
    const reply = await tap({ a: "x_set", f: "currency", w: "HKD", e: "other", v: rev() });
    expect(out(reply)).toContain("ปุ่มนี้หมดอายุแล้ว");
    expect((session()?.data as Record<string, unknown>).currencyConfirmed).toBeUndefined();
  });

  it("says the expense is gone for a button about a deleted expense", async () => {
    await say("120 ข้าว");
    db.rows.expenses = [];
    const reply = await tap({ a: "x_set", f: "currency", w: "HKD", e: "ghost", v: "1" });
    expect(out(reply)).toContain("รายการนี้ถูกลบไปแล้ว");
    expect(session()).toBeUndefined();
  });

  it("with no session: an unknown expense is gone, an existing draft just says the button expired", async () => {
    expect(out(await tap({ a: "x_set", f: "currency", w: "HKD", e: "ghost", v: "1" }))).toContain("รายการนี้ถูกลบไปแล้ว");
    db.rows.expenses = [DONE({ id: "d3", pending: true })];
    expect(out(await tap({ a: "x_set", f: "currency", w: "HKD", e: "d3", v: "1" }))).toContain("ปุ่มนี้หมดอายุแล้ว");
  });

  it("a late tap on the card of an already SAVED expense just says expired, without ทำต่อ", async () => {
    await say("120 บาท ข้าว ไม่หาร");
    const id = expenses()[0].id;
    expect(session()).toBeUndefined();
    const reply = await tap({ a: "x_set", f: "currency", w: "HKD", e: id, v: "1" });
    expect(out(reply)).toContain("ปุ่มนี้หมดอายุแล้ว");
    expect(out(reply)).not.toContain("ทำต่อ");
    expect(expenses()[0].currency).toBe("THB");
  });

  it("buttons of the removed flow are answered as expired", async () => {
    expect(out(await tap({ a: "x_confirm", e: "x", s: "summary" }))).toContain("ปุ่มนี้หมดอายุแล้ว");
    expect(out(await tap({ a: "x_payer", e: "x", s: "payer", v: "โอ" }))).toContain("ปุ่มนี้หมดอายุแล้ว");
  });

  it("a button tapped after the card was replaced by the cancel prompt is stale", async () => {
    await say("120 ข้าว");
    const old = live();
    await answer("ยกเลิก");
    expect(session()?.step).toBe("confirm_cancel");
    await tap({ a: "x_set", f: "currency", w: "HKD", ...old });
    expect(session()?.step).toBe("confirm_cancel");
    expect(expenses()).toHaveLength(1);
  });
});

describe("cancel, resume, conflict", () => {
  it("typed ยกเลิก asks first; ลบทิ้ง deletes the draft", async () => {
    await say("120 ข้าว");
    await answer("ยกเลิก");
    expect(session()?.step).toBe("confirm_cancel");
    const reply = await answer("ลบทิ้ง");
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("ลบรายการแล้ว");
  });

  it("the card's 🗑 ยกเลิก button does the same", async () => {
    await say("120 ข้าว");
    await tap({ a: "x_cancel", ...live() });
    expect(session()?.step).toBe("confirm_cancel");
    await tap({ a: "x_cancel_delete", ...live() });
    expect(expenses()).toHaveLength(0);
  });

  it("a new number mid-flow prompts; park keeps the old draft pending and starts the new one", async () => {
    await say("120 ข้าว");
    const oldId = expenses()[0].id;
    const { ctx, reply } = textCtx("50 กาแฟ");
    await handleRoute(ctx, { kind: "flow_conflict", text: "50 กาแฟ" });
    expect(session()?.step).toBe("conflict");
    expect(out(reply)).toContain("มีรายการค้างอยู่");
    await tap({ a: "x_conflict_park", e: oldId, v: rev() });
    expect(expenses()).toHaveLength(2);
    expect(expenses().find((e) => e.id === oldId)).toMatchObject({ pending: true, amount: 120 });
    expect(session()?.expense_id).not.toBe(oldId);
    expect(expenses().find((e) => e.id === session()?.expense_id)?.amount).toBe(50);
  });

  it("ทิ้งอันเก่า deletes a pending draft", async () => {
    await say("120 ข้าว");
    const oldId = expenses()[0].id;
    const { ctx } = textCtx("50 กาแฟ");
    await handleRoute(ctx, { kind: "flow_conflict", text: "50 กาแฟ" });
    await tap({ a: "x_conflict_drop", e: oldId, v: rev() });
    expect(expenses().find((e) => e.id === oldId)).toBeUndefined();
    expect(expenses()).toHaveLength(1);
  });

  it("ทำต่อ with no session reopens my newest pending draft at the card", async () => {
    db.rows.expenses = [{
      id: "old", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อื่นๆ", description: "", amount: 0,
      currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "เก่ง", slip_photo_ids: ["p0"], splits: [], pending: true,
    }];
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: "old", step: "missing" });
    expect(out(reply)).toContain("พิมพ์ตัวเลข เช่น 120");
  });

  it("120 → HKD → ยกเลิก → เก็บไว้ → ทำต่อ resumes with only the split row open", async () => {
    await say("120");
    await tap({ a: "x_set", f: "currency", w: "HKD", ...live() });
    await answer("ยกเลิก");
    await answer("เก็บไว้");
    expect(session()).toBeUndefined();
    expect(expenses()[0]).toMatchObject({ pending: true, currency: "HKD", fx_rate: 4.5, amount_thb: 540 });
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: expenses()[0].id, step: "missing" });
    expect(out(reply)).toContain("เหลืออีก 1 อย่าง");
    expect(out(reply)).toContain("f=split");
    expect(out(reply)).not.toContain("f=currency&w");
  });

  it("ทำต่อ falls back to an unclaimed draft (empty payer)", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    db.rows.expenses = [{
      id: "anon", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อื่นๆ", description: "", amount: 0,
      currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: ["p0"], splits: [], pending: true,
    }];
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: "anon", step: "missing" });
    expect(out(reply)).toContain("f=payer");
  });

  it("bare ยกเลิก / ทำต่อ with nothing pending just say so, without creating a draft", async () => {
    expect(out(await say("ยกเลิก"))).toContain("ไม่มีรายการค้าง");
    expect(out(await say("ทำต่อ"))).toContain("ไม่มีรายการค้าง");
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
  });

  it("recognises every bare command the router sends as expense_new", () => {
    for (const kw of EXPENSE_COMMAND_KEYWORDS) expect(expenseCommand(kw)).not.toBeNull();
  });
});

describe("saved expense: แก้ล่าสุด, edit, delete", () => {
  it("แก้ล่าสุด opens the saved card of my newest SAVED expense, without a session or a rate fetch", async () => {
    db.rows.expenses = [
      DONE(),
      { ...DONE({ id: "draft1", pending: true, amount: 5, datetime: "2026-11-21T01:00:00.000Z" }) },
    ];
    const reply = await say("แก้ล่าสุด");
    expect(session()).toBeUndefined();
    const o = out(reply);
    expect(o).toContain("✅ บันทึกแล้ว");
    expect(o).toContain("e=done1");
    expect(o).toContain("a=x_edit");
    expect(fetchRate).not.toHaveBeenCalled();
  });

  it("แก้ล่าสุด with nothing saved / unknown member", async () => {
    expect(out(await say("แก้ล่าสุด"))).toContain("ยังไม่มีรายการที่บันทึกในชื่อเรา");
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    expect(out(await say("แก้ล่าสุด"))).toContain("ชื่อ LINE ไม่ตรงกับสมาชิก");
  });

  it("✏️ แก้ → pick a field → answer: saved over the row at once, new saved card", async () => {
    db.rows.expenses = [DONE()];
    const picker = await tap({ a: "x_edit", e: "done1" });
    expect(session()).toMatchObject({ expense_id: "done1", step: "edit" });
    expect(out(picker)).toContain("a=x_editfield");
    await tap({ a: "x_editfield", w: "category", e: "done1", v: rev() });
    expect(session()?.step).toBe("category");
    const reply = await answer("ตั๋ว");
    expect(expenses()[0]).toMatchObject({ id: "done1", category: "ตั๋ว", pending: false, splits: [{ name: "โอ", amount_thb: 270 }] });
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("✅ บันทึกแล้ว");
    expect(out(reply)).toContain("a=x_edit");
  });

  it("editing the amount recalculates the split and keeps paid / paid_slip_photo_ids", async () => {
    const paid = { name: "โอ", amount_thb: 270, paid: true, paid_slip_photo_ids: ["s1"] };
    db.rows.expenses = [DONE({ splits: [paid] })];
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_editfield", w: "amount", e: "done1", v: rev() });
    await answer("200");
    expect(expenses()[0]).toMatchObject({
      amount: 200, amount_thb: 900, pending: false,
      splits: [{ name: "โอ", amount_thb: 450, paid: true, paid_slip_photo_ids: ["s1"] }],
    });
    expect(fetchRate).not.toHaveBeenCalled();
  });

  it("editing the currency fetches the new rate", async () => {
    db.rows.expenses = [DONE({ splits: [], currency: "THB", fx_rate: 1, amount_thb: 120 })];
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_editfield", w: "currency", e: "done1", v: rev() });
    await tap({ a: "x_set", f: "currency", w: "HKD", e: "done1", v: rev() });
    expect(fetchRate).toHaveBeenCalledWith("HKD");
    expect(expenses()[0]).toMatchObject({ currency: "HKD", fx_rate: 4.5, amount_thb: 540, pending: false });
  });

  it("changing a saved split to หารไม่เท่า asks the owed amount, then saves", async () => {
    db.rows.expenses = [DONE()];
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_editfield", w: "split", e: "done1", v: rev() });
    await tap({ a: "x_set", f: "split", w: "unequal", e: "done1", v: rev() });
    expect(session()?.step).toBe("owed");
    await answer("20");
    expect(expenses()[0].splits).toEqual([{ name: "โอ", amount_thb: 90, paid: false, paid_slip_photo_ids: [] }]);
    expect(session()).toBeUndefined();
  });

  it("🗑 ลบ asks first; ไม่ลบ leaves the row untouched", async () => {
    const paidSplit = { name: "โอ", amount_thb: 270, paid: true, paid_slip_photo_ids: ["s1"] };
    const row = DONE({ splits: [paidSplit] });
    db.rows.expenses = [{ ...row }];
    const ask = await tap({ a: "x_del", e: "done1" });
    expect(expenses()).toHaveLength(1);
    expect(session()?.step).toBe("confirm_cancel");
    expect(out(ask)).toContain("ไม่ลบ");
    const kept = await tap({ a: "x_cancel_keep", e: "done1", v: rev() });
    expect(session()).toBeUndefined();
    expect(expenses()[0]).toEqual(row);
    expect(out(kept)).toContain("รายการยังอยู่เหมือนเดิม");
  });

  it("opening ✏️ แก้ or 🗑 ลบ never rewrites the saved row", async () => {
    const row = DONE({ amount_thb: 541 });
    db.rows.expenses = [{ ...row }];
    vi.mocked(updateRow).mockClear();
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_del", e: "done1" });
    await tap({ a: "x_cancel_keep", e: "done1", v: rev() });
    expect(updateRow).not.toHaveBeenCalled();
    expect(expenses()[0]).toEqual(row);
    expect(fetchRate).not.toHaveBeenCalled();
  });

  it("🗑 ลบ then ลบรายการนี้ deletes it", async () => {
    db.rows.expenses = [DONE()];
    await tap({ a: "x_del", e: "done1" });
    await tap({ a: "x_cancel_delete", e: "done1", v: rev() });
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
  });

  it("ทิ้งอันเก่า while editing a saved expense never deletes it", async () => {
    db.rows.expenses = [DONE()];
    await tap({ a: "x_edit", e: "done1" });
    const { ctx } = textCtx("50 กาแฟ");
    await handleRoute(ctx, { kind: "flow_conflict", text: "50 กาแฟ" });
    expect(session()?.step).toBe("conflict");
    const reply = await tap({ a: "x_conflict_drop", e: "done1", v: rev() });
    expect(expenses().find((e) => e.id === "done1")).toBeDefined();
    expect(expenses()).toHaveLength(2);
    expect(out(reply)).toContain("รายการเดิมยังอยู่");
  });

  it("a live draft of another expense is not overwritten by ✏️ แก้", async () => {
    await say("120 ข้าว");
    const draftId = expenses()[0].id;
    db.rows.expenses = [...expenses(), DONE()] as unknown as Record<string, unknown>[];
    const reply = await tap({ a: "x_edit", e: "done1" });
    expect(session()?.expense_id).toBe(draftId);
    expect(out(reply)).toContain("มีรายการอื่นค้างอยู่");
  });

  it("✏️ / 🗑 on an expense that no longer exists, or that is still a draft", async () => {
    expect(out(await tap({ a: "x_edit", e: "ghost" }))).toContain("รายการนี้ถูกลบไปแล้ว");
    db.rows.expenses = [DONE({ id: "d2", pending: true })];
    expect(out(await tap({ a: "x_del", e: "d2" }))).toContain("ปุ่มนี้หมดอายุแล้ว");
  });
});

describe("images", () => {
  it("a photo with no session starts a draft whose card says the slip was received and asks the amount", async () => {
    const { ctx, reply } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    expect(expenses()[0]).toMatchObject({ slip_photo_ids: ["photo-new"], payer: "เก่ง", pending: true });
    expect(session()?.step).toBe("missing");
    expect(out(reply)).toContain("รับสลิปแล้ว 📸");
    expect(out(reply)).toContain("พิมพ์ตัวเลข เช่น 120");
  });

  it("a photo mid-flow attaches to a draft that has none; a second photo asks", async () => {
    await say("120 ข้าว");
    const first = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(first.ctx);
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0].slip_photo_ids).toEqual(["photo-new"]);
    expect(out(first.reply)).toContain("แนบรูป");
    const second = makeCtx({ message: { id: "img2", type: "image" } });
    await handleImage(second.ctx);
    expect(session()?.step).toBe("conflict");
  });

  it("a number typed while the card waits fills the missing amount", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const { ctx } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    const pred = await flowAnswerPredicate(ctx, session() as LineSession);
    expect(pred("120")).toBe(true);
    const reply = await answer("120");
    expect(expenses()[0].amount).toBe(120);
    expect(session()?.step).toBe("missing");
    expect(out(reply)).toContain("f=payer");
  });
});

describe("flowAnswerPredicate", () => {
  it("accepts answers the card can use and the flow commands; rejects new entries, small talk and view commands", async () => {
    await say("120 ข้าว");
    const { ctx } = textCtx("");
    const pred = await flowAnswerPredicate(ctx, session() as LineSession);
    expect(pred("HKD")).toBe(true);
    expect(pred("หารเท่า")).toBe(true);
    expect(pred("ยกเลิก")).toBe(true);
    expect(pred("สวัสดี")).toBe(false);
    expect(pred("50 กาแฟ")).toBe(false);
    expect(pred("คู่มือ")).toBe(false);
    expect(pred("แพลน")).toBe(false);
  });

  it("is false when the session's expense is gone", async () => {
    const { ctx } = textCtx("");
    const pred = await flowAnswerPredicate(ctx, { id: KEY, trip_id: "t1", expense_id: "nope", step: "missing", updated_at: "", data: {} });
    expect(pred("HKD")).toBe(false);
  });
});
```

- [ ] **Step 6: Run to see the failures**

Run: `npm test -- lib/line-expense-flow.test.ts lib/line-expense-flow-answers.test.ts lib/line-expense-answers.test.ts lib/line-expense-messages.test.ts lib/line-handlers/expense.test.ts`
Expected: FAIL (imports of `settle`, `normalizeStep`, `missingCard`, … do not exist; old code still in place).

- [ ] **Step 7: Replace `lib/line-expense-flow.ts` with this complete file**

(The helpers `round2` … `buildSplits`, `needsRate`, `withRate`, `finalize` are unchanged; `Field`, `Bundle`, `missingFields` are the Task 1 code.)

```ts
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
```

- [ ] **Step 8: Append `interpretAnswer` and `postbackToAnswer` to `lib/line-expense-answers.ts`**

Replace the import block at the top of the file with:

```ts
// lib/line-expense-answers.ts
// Typed text / postback data → answers for the expense flow. Pure.
import type { Category, Expense } from "@/lib/models/types";
import { CATS } from "@/lib/categories";
import { isViewCommand } from "@/lib/line-router";
import { expenseCommand, matchDeposit, parseNumber, parseSplitWord, parseWholeNumber, resolveCurrency } from "@/lib/line-expense-parse";
import { otherMembers, validateOwed, type Answer, type Bundle, type EditField, type Field, type FlowData, type FlowState } from "@/lib/line-expense-flow";
```

and append at the end of the file:

```ts
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
```

- [ ] **Step 9: Replace `lib/line-expense-messages.ts` with this complete file**

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
  missingFields,
  otherMembers,
  partnerFor,
  round2,
  type EditField,
  type Field,
  type FlowData,
  type FlowEnv,
  type FlowState,
  type FlowStep,
  type SplitMode,
} from "@/lib/line-expense-flow";

// What the cards need besides the flow state: where images live and which trip this is.
export interface CardCtx {
  origin: string;
  tripName: string;
}

export const MSG = {
  noTrip: NO_TRIP_TEXT,
  goneExpense: "รายการนี้ถูกลบไปแล้ว",
  expiredButton: "ปุ่มนี้หมดอายุแล้ว พิมพ์ ทำต่อ เพื่อกรอกรายการที่ค้าง",
  staleButton: "ปุ่มนี้หมดอายุแล้ว",
  deleted: "ลบรายการแล้ว 🗑",
  kept: 'เก็บไว้ในคิว "รอกรอก" ในแอปแล้ว พิมพ์ ทำต่อ เพื่อกรอกต่อ',
  parked: 'เก็บอันเก่าไว้ในคิว "รอกรอก" แล้ว เริ่มอันใหม่เลย',
  dropped: "ทิ้งอันเก่าแล้ว เริ่มอันใหม่เลย",
  droppedEdit: "ยกเลิกการแก้ไขแล้ว รายการเดิมยังอยู่ เริ่มอันใหม่เลย",
  keptConfirmed: "ไม่ลบ รายการยังอยู่เหมือนเดิม",
  reask: "ไม่เข้าใจ ลองกดปุ่ม หรือพิมพ์ เช่น HKD เก่ง หารเท่า",
  reaskPrompt: "ยังรอคำตอบข้อนี้อยู่นะ",
  busy: "มีรายการอื่นค้างอยู่ ตอบหรือ ยกเลิก อันนั้นก่อนนะ",
  photoAttached: "แนบรูปเข้ารายการที่ค้างแล้ว 📎",
  nothingPending: "ไม่มีรายการค้าง",
  noLatest: "ยังไม่มีรายการที่บันทึกในชื่อเรา",
  unknownMember: "ชื่อ LINE ไม่ตรงกับสมาชิกในทริป ตั้งชื่อสมาชิกในแอปให้ตรงก่อนนะ",
} as const;

// The card is the question for a draft; every other step is a prompt.
export const reaskFor = (step: FlowStep): string => (step === "missing" ? MSG.reask : MSG.reaskPrompt);

export const CATEGORY_EMOJI: Record<Category, string> = {
  "อาหาร": "🍜", "เดินทาง": "🚕", "ที่พัก": "🏨", "ช้อป": "🛍️", "ตั๋ว": "🎫", "อื่นๆ": "📦",
};

type Data = Record<string, string | number | undefined>;
type Item = { label: string; data?: Data; text?: string };

const EDIT_BUTTONS: [string, EditField][] = [
  ["ยอด", "amount"], ["สกุลเงิน", "currency"], ["คนจ่าย", "payer"], ["หาร", "split"], ["หมวด", "category"], ["โน้ต", "note"],
];

const SPLIT_LABEL: Record<SplitMode, string> = { none: "ไม่หาร", equal: "หารเท่า", unequal: "หารไม่เท่า" };

// Every card button carries the expense id and the revision it was drawn for.
function pb(st: FlowState, a: string, extra: Data = {}): Data {
  return { a, e: st.expense.id, v: st.data.rev ?? 0, ...extra };
}
const setPb = (st: FlowState, f: Field | "category", w: string | number): Data => pb(st, "x_set", { f, w });

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

// ---------------------------------------------------------------------------
// One question at a time: only for editing a saved expense and the two prompts
// ---------------------------------------------------------------------------

function questionText(st: FlowState, env: FlowEnv): string {
  const e = st.expense;
  const d = st.data;
  switch (st.step) {
    case "missing": return "เหลือบางอย่างที่ต้องกรอก";
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
      return e.pending ? `มีรายการค้างอยู่ (${what}) จะทำยังไงดี?` : `กำลังแก้รายการ (${what}) อยู่ จะทำยังไงดี?`;
    }
  }
}

function questionItems(st: FlowState, env: FlowEnv): Item[] {
  const e = st.expense;
  const d = st.data;
  const others = otherMembers(e.payer, env.members);
  switch (st.step) {
    case "missing":
      return [];
    case "payer":
      return env.members.slice(0, 12).map((m) => ({ label: m, data: setPb(st, "payer", m) }));
    case "amount":
      return (d.amountCandidates ?? []).slice(0, 4).map((n) => ({ label: fmtNum(n), data: setPb(st, "amount", n) }));
    case "currency":
      return [...new Set([env.tripCurrency, env.homeCurrency].filter(Boolean))].map((c) => ({ label: c, data: setPb(st, "currency", c) }));
    case "split":
      return (others.length > 0 ? (["none", "equal", "unequal"] as SplitMode[]) : (["none"] as SplitMode[]))
        .map((m) => ({ label: SPLIT_LABEL[m], data: setPb(st, "split", m) }));
    case "partner":
      return others.slice(0, 12).map((m) => ({ label: m, data: setPb(st, "partner", m) }));
    case "owed":
      return d.owedZero
        ? [
            { label: "เปลี่ยนเป็นไม่หาร", data: pb(st, "x_owed_zero", { w: "none" }) },
            { label: "↩ ใส่ใหม่", data: pb(st, "x_owed_zero", { w: "retry" }) },
          ]
        : [];
    case "category":
      return CATS.map((c) => ({ label: c.name, data: setPb(st, "category", c.name) }));
    case "note":
      return [{ label: "ไม่มีโน้ต", text: "-" }];
    case "edit":
      return EDIT_BUTTONS.map(([label, field]) => ({ label, data: pb(st, "x_editfield", { w: field }) }));
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
  }
}

export function questionMessage(st: FlowState, env: FlowEnv, notice?: string): FlexNode {
  const prefix = st.data.asker ? `@${st.data.asker} ` : "";
  const text = `${prefix}${notice ? `${notice}\n` : ""}${questionText(st, env)}`;
  const items = questionItems(st, env).slice(0, 13);
  return textMessage(text, items.length > 0 ? quickReply(items) : undefined);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

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

// Same clay look as the old cards: cream frame, white inner card, optional slip hero.
function shell(e: Expense, origin: string, inner: FlexNode[], footer: FlexNode[]): FlexNode {
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
        { type: "box", layout: "vertical", backgroundColor: CLAY.card, cornerRadius: "18px", paddingAll: "16px", spacing: "sm", contents: inner },
      ],
    },
    footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", contents: footer },
  };
}

const tripLine = (tripName: string): FlexNode | null => (tripName ? txt(`ทริป ${tripName}`, { size: "xs", color: CLAY.muted, align: "center" }) : null);

export function savedCard(e: Expense, d: FlowData, origin: string, tripName: string): FlexNode {
  const footer = compact<FlexNode>([
    {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        { type: "button", style: "secondary", height: "sm", action: postbackAction("✏️ แก้", { a: "x_edit", e: e.id }) },
        { type: "button", style: "secondary", height: "sm", action: postbackAction("🗑 ลบ", { a: "x_del", e: e.id }) },
      ],
    },
    { type: "button", style: "link", height: "sm", action: uriAction("เปิดในแอป", `${origin}/trips/${e.trip_id}/money`) },
    tripLine(tripName),
  ]);
  const inner = compact<FlexNode>([txt("✅ บันทึกแล้ว", { weight: "bold", size: "md", color: CLAY.doneInk }), ...infoLines(e, d)]);
  return flexMessage(`บันทึกแล้ว: ${amountLine(e)}`.slice(0, 400), shell(e, origin, inner, footer));
}

const FIELD_LABEL: Record<Field, string> = {
  amount: "ยอด", currency: "สกุลเงิน", payer: "คนจ่าย", split: "หาร", partner: "หารกับ", owed: "ฝากจ่าย",
};

function visibleFields(st: FlowState, env: FlowEnv): Field[] {
  const d = st.data;
  const out: Field[] = ["amount", "currency"];
  if (env.members.length > 0) out.push("payer");
  if (d.lockedSplits) return out;
  out.push("split");
  if (d.splitMode && d.splitMode !== "none" && st.expense.payer && otherMembers(st.expense.payer, env.members).length > 1) out.push("partner");
  if (d.splitMode === "unequal") out.push("owed");
  return out;
}

function buttonRows(items: Item[]): FlexNode[] {
  const rows: FlexNode[] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: items.slice(i, i + 3).map((it) => ({
        type: "button", style: "secondary", height: "sm", flex: 1, action: postbackAction(it.label, it.data ?? {}),
      })),
    });
  }
  return rows;
}

function doneValue(field: Field, st: FlowState, env: FlowEnv): string {
  const e = st.expense;
  const d = st.data;
  switch (field) {
    case "amount": return fmtNum(e.amount);
    case "currency": return e.currency;
    case "payer": return e.payer;
    case "split": return SPLIT_LABEL[d.splitMode ?? "none"];
    case "partner": return partnerFor(e.payer, d, env.members) ?? "-";
    case "owed": return `${fmtNum(d.owedAmount ?? 0)} ${e.currency}`;
  }
}

// Answered: a tappable row; tapping clears the field and asks it again.
function doneRow(st: FlowState, env: FlowEnv, field: Field): FlexNode {
  const label = FIELD_LABEL[field];
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    action: postbackAction(`แก้${label}`, pb(st, "x_clear", { f: field })),
    contents: compact<FlexNode>([
      txt(`✓ ${label}`, { size: "sm", color: CLAY.doneInk, flex: 3 }),
      txt(doneValue(field, st, env), { size: "sm", weight: "bold", color: CLAY.ink, flex: 4, align: "end" }),
    ]),
  };
}

function todoBody(field: Field, st: FlowState, env: FlowEnv): FlexNode[] {
  const e = st.expense;
  const d = st.data;
  switch (field) {
    case "amount":
      return compact<FlexNode>([
        txt("พิมพ์ตัวเลข เช่น 120", { size: "sm", color: CLAY.ink }),
        ...buttonRows((d.amountCandidates ?? []).slice(0, 4).map((n) => ({ label: fmtNum(n), data: setPb(st, "amount", n) }))),
      ]);
    case "currency":
      return buttonRows([...new Set([env.tripCurrency, env.homeCurrency].filter(Boolean))].map((c) => ({ label: c, data: setPb(st, "currency", c) })));
    case "payer":
      return buttonRows(env.members.slice(0, 9).map((m) => ({ label: m, data: setPb(st, "payer", m) })));
    case "split": {
      const modes: SplitMode[] = env.members.length > 1 ? ["none", "equal", "unequal"] : ["none"];
      return buttonRows(modes.map((m) => ({ label: SPLIT_LABEL[m], data: setPb(st, "split", m) })));
    }
    case "partner":
      return buttonRows(otherMembers(e.payer, env.members).slice(0, 9).map((m) => ({ label: m, data: setPb(st, "partner", m) })));
    case "owed": {
      if (d.owedZero) {
        return compact<FlexNode>([
          txt("ฝากจ่าย 0 — เปลี่ยนเป็นไม่หารไหม?", { size: "sm", color: CLAY.coral }),
          ...buttonRows([
            { label: "เปลี่ยนเป็นไม่หาร", data: pb(st, "x_owed_zero", { w: "none" }) },
            { label: "ใส่ใหม่", data: pb(st, "x_owed_zero", { w: "retry" }) },
          ]),
        ]);
      }
      if (!(e.amount > 0)) return compact<FlexNode>([txt("ใส่ยอดรวมก่อน", { size: "sm", color: CLAY.ink })]);
      const owed = d.owedAmount;
      const over = owed != null && owed > e.amount;
      return compact<FlexNode>([
        over ? txt(`ฝากจ่าย ${fmtNum(owed)} เกินยอดรวม ${fmtNum(e.amount)} ใส่ใหม่นะ`, { size: "sm", color: CLAY.coral }) : null,
        txt("ยอดที่ฝากจ่าย — พิมพ์ตัวเลข เช่น ฝาก 20", { size: "sm", color: CLAY.ink }),
      ]);
    }
  }
}

function todoRow(field: Field, st: FlowState, env: FlowEnv): FlexNode {
  const label = field === "partner" ? "หารกับใคร" : FIELD_LABEL[field];
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: compact<FlexNode>([txt(label, { size: "sm", color: CLAY.muted }), ...todoBody(field, st, env)]),
  };
}

function cardTitle(st: FlowState): string {
  const e = st.expense;
  const parts: string[] = [];
  if (e.amount > 0) parts.push(`${fmtNum(e.amount)}${st.data.currencyConfirmed ? ` ${e.currency}` : ""}`);
  if (e.description) parts.push(e.description);
  if (parts.length > 0) return `💸 ${parts.join(" · ")}`;
  return e.slip_photo_ids.length > 0 ? "💸 รับสลิปแล้ว 📸" : "💸 รายการใหม่";
}

// The one card of a draft: everything known as ✓ rows, everything missing as
// buttons or a typing hint. A notice goes in a plain text message above it.
export function missingCard(st: FlowState, env: FlowEnv, cc: CardCtx, notice?: string): FlexNode[] {
  const e = st.expense;
  const d = st.data;
  const missing = missingFields(e, d, env.members);
  const rows = visibleFields(st, env).map((f) => (missing.includes(f) ? todoRow(f, st, env) : doneRow(st, env, f)));
  const title = cardTitle(st);
  const inner = compact<FlexNode>([
    d.asker ? txt(`@${d.asker}`, { size: "xs", color: CLAY.muted }) : null,
    txt(title, { weight: "bold", size: "md", color: CLAY.coral }),
    txt(`เหลืออีก ${missing.length} อย่าง`, { size: "xs", color: CLAY.muted }),
    ...rows,
    d.lockedSplits ? txt(splitLine(e, d), { size: "sm", color: CLAY.ink }) : null,
    txt('พิมพ์ตอบทีเดียวก็ได้ เช่น "HKD เก่ง หารเท่า"', { size: "xs", color: CLAY.muted }),
  ]);
  const footer = compact<FlexNode>([
    { type: "button", style: "secondary", height: "sm", action: postbackAction("🗑 ยกเลิก", pb(st, "x_cancel")) },
    tripLine(cc.tripName),
  ]);
  const card = flexMessage(`${title} · เหลืออีก ${missing.length} อย่าง`.slice(0, 400), shell(e, cc.origin, inner, footer));
  return notice ? [textMessage(notice), card] : [card];
}

export function stepMessages(st: FlowState, env: FlowEnv, cc: CardCtx, notice?: string): FlexNode[] {
  if (st.step === "missing") return missingCard(st, env, cc, notice);
  return [questionMessage(st, env, notice)];
}
```

- [ ] **Step 10: Replace `lib/line-handlers/expense.ts` with this complete file**

```ts
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
```

- [ ] **Step 11: Run everything**

Run:
```bash
npm test -- lib/line-expense-flow.test.ts lib/line-expense-flow-answers.test.ts lib/line-expense-answers.test.ts lib/line-expense-messages.test.ts lib/line-handlers/expense.test.ts
npm test
npx tsc --noEmit
npx eslint lib/line-expense-flow.ts lib/line-expense-flow.test.ts lib/line-expense-flow-answers.test.ts lib/line-expense-answers.ts lib/line-expense-answers.test.ts lib/line-expense-messages.ts lib/line-expense-messages.test.ts lib/line-handlers/expense.ts lib/line-handlers/expense.test.ts
```
Expected: all PASS; tsc and eslint print nothing. If a handler test fails on `a=x_set` string matching, check `out()` — `JSON.stringify` keeps `&` and Thai unescaped, so the data string `a=x_set&f=currency&w=HKD&e=…&v=1` is searchable. If `line-dispatch.test.ts` fails, it must not: it mocks the whole expense module.

- [ ] **Step 12: Commit**

```bash
git add lib/line-expense-flow.ts lib/line-expense-flow.test.ts lib/line-expense-flow-answers.test.ts lib/line-expense-answers.ts lib/line-expense-answers.test.ts lib/line-expense-messages.ts lib/line-expense-messages.test.ts lib/line-handlers/expense.ts lib/line-handlers/expense.test.ts
git commit -m "$(cat <<'EOF'
feat(line): one-card expense questions with auto-save, edit and delete on the saved card

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Guide module (`lib/line-guide.ts`) + `messageAction`

**Files:**
- Modify: `lib/line-flex.ts` (add `messageAction` after `clipboardAction`)
- Modify: `lib/line-flex.test.ts` (one test)
- Create: `lib/line-guide.ts`
- Create: `lib/line-guide.test.ts`

**Interfaces:**
- Produces (flex): `messageAction(label: string, text: string): FlexNode` → `{ type: "message", label (≤20 chars), text }`.
- Produces (guide): `type GuideTopic = "expense" | "plan" | "booking" | "places" | "info" | "transport" | "other"`; `GUIDE_KEYWORDS = ["คู่มือการใช้งาน", "คู่มือ"] as const`; `GUIDE_TOPICS: GuideTopicData[]`; `matchGuide(text: string): { topic: GuideTopic | null } | null`; `topicFromId(id: string | undefined): GuideTopic | null`; `buildGuideMessage(topic: GuideTopic | null): FlexNode`.
- `lib/line-guide.ts` must import only `@/lib/line-flex` and `@/lib/line-text` (the router and the menu import it; importing them back would create a cycle).

- [ ] **Step 1: Write the failing tests**

In `lib/line-flex.test.ts`, add `messageAction,` to the import list from `./line-flex` and append:

```ts
describe("messageAction", () => {
  it("is a message action that sends the text, with the label clipped to 20 characters", () => {
    expect(messageAction("ลอง แพลน", "แพลน")).toEqual({ type: "message", label: "ลอง แพลน", text: "แพลน" });
    expect((messageAction("ก".repeat(30), "x").label as string).length).toBe(20);
  });
});
```

Create `lib/line-guide.test.ts`:

```ts
// lib/line-guide.test.ts
import { describe, it, expect } from "vitest";
import * as router from "./line-router";
import { GUIDE_KEYWORDS, GUIDE_TOPICS, buildGuideMessage, matchGuide, topicFromId, type GuideTopic } from "./line-guide";
import { actions, findNode, hasEmptyText, walk, type Node } from "./line-test-helpers";

const ids = GUIDE_TOPICS.map((t) => t.id);
const messageActions = (root: unknown): Node[] => {
  const out: Node[] = [];
  walk(root, (n) => {
    if (n.type === "message") out.push(n);
  });
  return out;
};
const bubbleFor = (t: GuideTopic) => (buildGuideMessage(t).contents as Node);

describe("GUIDE_TOPICS", () => {
  it("has the 7 topics, each with 4-6 commands and 2-3 examples", () => {
    expect(ids).toEqual(["expense", "plan", "booking", "places", "info", "transport", "other"]);
    for (const t of GUIDE_TOPICS) {
      expect(t.commands.length).toBeGreaterThanOrEqual(4);
      expect(t.commands.length).toBeLessThanOrEqual(6);
      expect(t.examples.length).toBeGreaterThanOrEqual(2);
      expect(t.examples.length).toBeLessThanOrEqual(3);
    }
  });

  it("[ลองเลย] texts are only side-effect-free view commands", () => {
    const allowed = new Set(["แพลน", "ต่อไป", "จอง", "ร้าน", "ที่เที่ยว", "ข้อมูล", "โน้ต", "เดินทาง"]);
    for (const t of GUIDE_TOPICS) for (const x of t.tries) expect(allowed.has(x.text)).toBe(true);
  });
});

describe("buildGuideMessage", () => {
  it("null topic → a carousel: contents page + one bubble per topic", () => {
    const msg = buildGuideMessage(null);
    expect(msg.type).toBe("flex");
    const carousel = msg.contents as Node;
    expect(carousel.type).toBe("carousel");
    expect((carousel.contents as Node[]).length).toBe(8);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("the contents page jumps to each topic with menu_go postbacks", () => {
    const toc = ((buildGuideMessage(null).contents as Node).contents as Node[])[0];
    const acts = actions(toc);
    expect(acts.map((a) => [a.data.a, a.data.t, a.data.q])).toEqual(ids.map((id) => ["menu_go", "guide", id]));
    for (const a of acts) expect(a.label.length).toBeLessThanOrEqual(20);
  });

  it("a topic → one bubble with title, command rows, examples and a way back to the contents", () => {
    const msg = buildGuideMessage("plan");
    expect(msg.altText).toContain("แพลน");
    const bubble = msg.contents as Node;
    expect(bubble.type).toBe("bubble");
    const json = JSON.stringify(bubble);
    for (const c of GUIDE_TOPICS.find((t) => t.id === "plan")!.commands) expect(json).toContain(c.cmd);
    expect(actions(bubble).some((a) => a.data.a === "menu_go" && a.data.t === "guide" && a.data.q === undefined)).toBe(true);
  });

  it("the expense bubble has NO message action (a tap would save a real expense) but offers copy", () => {
    expect(messageActions(bubbleFor("expense"))).toEqual([]);
    expect(messageActions(buildGuideMessage(null))).not.toEqual([]); // other topics do have [ลองเลย]
    const copy = actions(bubbleFor("expense")).find((a) => a.type === "clipboard");
    expect(copy?.label).toBe("คัดลอกตัวอย่าง");
  });

  it("view-command topics have [ลองเลย] message buttons", () => {
    const sent = messageActions(bubbleFor("plan")).map((n) => n.text);
    expect(sent).toEqual(["แพลน", "ต่อไป"]);
    expect(messageActions(bubbleFor("transport")).map((n) => n.text)).toEqual(["เดินทาง"]);
    expect(messageActions(bubbleFor("other"))).toEqual([]);
  });

  it("is built from the topic data (every command and example appears in the carousel)", () => {
    const json = JSON.stringify(buildGuideMessage(null));
    for (const t of GUIDE_TOPICS) {
      for (const c of t.commands) expect(json).toContain(c.cmd);
      for (const x of t.examples) expect(json).toContain(x);
    }
    expect(findNode(buildGuideMessage(null), (n) => n.type === "text" && String(n.text).includes("คู่มือการใช้งาน"))).toBeDefined();
  });
});

describe("matchGuide", () => {
  it.each([
    ["คู่มือการใช้งาน", null],
    ["คู่มือ", null],
    ["ขอดูคู่มือ", null],
    ["  คู่มือ  ", null],
    ["คู่มือ ค่าใช้จ่าย", "expense"],
    ["คู่มือ แพลน", "plan"],
    ["คู่มือการใช้งาน แพลน", "plan"],
    ["คู่มือ plan", "plan"],
    ["คู่มือ จอง", "booking"],
    ["คู่มือ ตั๋ว", "booking"],
    ["คู่มือ เอกสาร", "booking"],
    ["คู่มือ ร้าน", "places"],
    ["คู่มือ ที่เที่ยว", "places"],
    ["คู่มือ ข้อมูล", "info"],
    ["คู่มือ โน้ต", "info"],
    ["คู่มือ เดินทาง", "transport"],
    ["คู่มือ อื่นๆ", "other"],
    ["คู่มือ เรื่องอะไรสักอย่าง", null],
  ])("%s", (text, topic) => {
    expect(matchGuide(text)).toEqual({ topic });
  });

  it("คู่มือ จอง and คู่มือ ตั๋ว are the same topic", () => {
    expect(matchGuide("คู่มือ จอง")).toEqual(matchGuide("คู่มือ ตั๋ว"));
  });

  it("returns null for everything that is not the guide command", () => {
    for (const t of ["แพลน", "เมนู", "120 ข้าว", "สวัสดี", "ตั๋วรถ 50", "ทำคู่มือ"]) expect(matchGuide(t)).toBeNull();
  });

  it("topicFromId only knows real topics", () => {
    expect(topicFromId("plan")).toBe("plan");
    expect(topicFromId("nope")).toBeNull();
    expect(topicFromId(undefined)).toBeNull();
  });
});

describe("keyword coverage: every command word the router knows is in the guide", () => {
  const lists = Object.entries(router).filter(([name]) => name.endsWith("_KEYWORDS")) as [string, readonly string[]][];

  it("finds the router's keyword lists (guards the dynamic lookup)", () => {
    expect(lists.length).toBeGreaterThanOrEqual(10);
  });

  it("appears in the guide at least once", () => {
    const text = JSON.stringify(buildGuideMessage(null));
    for (const [name, words] of [...lists, ["GUIDE_KEYWORDS", GUIDE_KEYWORDS] as [string, readonly string[]]]) {
      for (const w of words) expect({ name, w, found: text.includes(w) }).toEqual({ name, w, found: true });
    }
  });
});
```

Note: `line-test-helpers.ts` exports `walk`, `findNode`, `actions`, `hasEmptyText` and `type Node`. `matchGuide("ทำคู่มือ")` must be null because keywords only match at the start.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- lib/line-flex.test.ts lib/line-guide.test.ts`
Expected: FAIL (`messageAction` and `./line-guide` do not exist).

- [ ] **Step 3: Add `messageAction`**

In `lib/line-flex.ts`, directly after `clipboardAction`:

```ts
// Sends `text` as if the user typed it. Only for commands with no side effects.
export function messageAction(label: string, text: string): FlexNode {
  return { type: "message", label: clip(label, QUICK_REPLY_LABEL_MAX), text };
}
```

- [ ] **Step 4: Create `lib/line-guide.ts`**

```ts
// lib/line-guide.ts
// คู่มือการใช้งาน: static help cards. Pure. Imports only the flex / text
// helpers (the router and the menu import THIS file).
import { CLAY, clipboardAction, compact, flexMessage, messageAction, postbackAction, txt, type FlexNode } from "@/lib/line-flex";
import { matchKeyword } from "@/lib/line-text";

export type GuideTopic = "expense" | "plan" | "booking" | "places" | "info" | "transport" | "other";

// Longest first is handled by matchKeyword; listed here for the router-consistency test.
export const GUIDE_KEYWORDS = ["คู่มือการใช้งาน", "คู่มือ"] as const;

export interface GuideTopicData {
  id: GuideTopic;
  title: string;
  aliases: readonly string[];                       // what can follow "คู่มือ "
  commands: { cmd: string; does: string }[];        // 4-6 rows: type → get
  examples: string[];                               // 2-3
  tries: { label: string; text: string }[];         // [ลองเลย]: ONLY side-effect-free view commands
  copy?: string;                                    // [คัดลอกตัวอย่าง] (the expense topic: a tap must not save)
}

export const GUIDE_TOPICS: GuideTopicData[] = [
  {
    id: "expense",
    title: "💸 บันทึกค่าใช้จ่าย",
    aliases: ["ค่าใช้จ่าย", "บันทึกค่าใช้จ่าย", "จ่าย", "เงิน", "สลิป"],
    commands: [
      { cmd: "120 บาท ข้าว", does: "บันทึก บอทถามเฉพาะที่ขาดในการ์ดใบเดียว" },
      { cmd: "120 HKD ข้าว หาร", does: "หารเท่า ครบแล้วบันทึกเลย" },
      { cmd: "500 บาท เซเว่น ฝาก 20", does: "หารไม่เท่า อีกคนฝากจ่าย 20" },
      { cmd: "ส่งรูปสลิป", does: "บอทรับรูป แล้วถามยอด" },
      { cmd: "ทำต่อ · ยกเลิก", does: "กรอกรายการที่ค้างต่อ · ลบหรือเก็บไว้" },
      { cmd: "แก้ล่าสุด", does: "เปิดการ์ดรายการล่าสุด กด แก้ / ลบ" },
    ],
    examples: ["120 บาท ข้าวมันไก่ ไม่หาร", "120 HKD ข้าว หาร", "500 บาท เซเว่น ฝาก 20"],
    tries: [],
    copy: "120 HKD ข้าว หาร",
  },
  {
    id: "plan",
    title: "📅 แพลน",
    aliases: ["แพลน", "plan", "ต่อไป"],
    commands: [
      { cmd: "แพลน · plan", does: "แพลนวันนี้" },
      { cmd: "แพลน พรุ่งนี้ · แพลน 20/11", does: "แพลนของวันนั้น" },
      { cmd: "แพลน 2 · #2", does: "รายละเอียดรายการที่ 2" },
      { cmd: "ต่อไป · next", does: "รายการถัดไปจากเวลาตอนนี้" },
      { cmd: "ตอนนี้ · now", does: "รายการที่อยู่ในช่วงเวลานี้" },
    ],
    examples: ["แพลน พรุ่งนี้", "แพลน วันที่ 3"],
    tries: [{ label: "ลอง แพลน", text: "แพลน" }, { label: "ลอง ต่อไป", text: "ต่อไป" }],
  },
  {
    id: "booking",
    title: "🎫 ตั๋วและการจอง",
    aliases: ["จอง", "ตั๋ว", "เอกสาร", "การจอง"],
    commands: [
      { cmd: "จอง · ตั๋ว · เอกสาร", does: "การจองทั้งหมด" },
      { cmd: "ตั๋วเครื่อง", does: "เฉพาะเครื่องบิน" },
      { cmd: "การจองโรงแรม", does: "เฉพาะโรงแรม" },
      { cmd: "ตั๋ว ดิสนีย์", does: "ค้นชื่อ / เลขจอง" },
      { cmd: "จอง พรุ่งนี้ · จอง 21/11", does: "การจองของวันนั้น" },
    ],
    examples: ["จอง", "ตั๋วเครื่อง", "จอง 21/11"],
    tries: [{ label: "ลองเลย", text: "จอง" }],
  },
  {
    id: "places",
    title: "🍜 ร้านและที่เที่ยว",
    aliases: ["ร้าน", "ร้านอาหาร", "ที่เที่ยว", "กิน", "อยากไป", "สถานที่"],
    commands: [
      { cmd: "ร้าน · ร้านอาหาร · กิน", does: "ร้านอาหารที่บันทึกไว้" },
      { cmd: "ที่เที่ยว · อยากไป · สถานที่", does: "ที่ที่อยากไป" },
      { cmd: "ร้าน มงก๊ก", does: "กรองย่าน / ค้นชื่อ" },
      { cmd: "ร้าน ต้องลอง", does: "เฉพาะที่ติดดาว" },
      { cmd: "ร้าน ยังไม่ไป", does: "เฉพาะที่ยังไม่ได้ไป" },
    ],
    examples: ["ร้าน", "ที่เที่ยว ดาว"],
    tries: [{ label: "ลอง ร้าน", text: "ร้าน" }, { label: "ลอง ที่เที่ยว", text: "ที่เที่ยว" }],
  },
  {
    id: "info",
    title: "ℹ️ ข้อมูลด่วนและโน้ต",
    aliases: ["ข้อมูล", "ข้อมูลด่วน", "โน้ต", "โน๊ต"],
    commands: [
      { cmd: "ข้อมูล · ข้อมูลด่วน", does: "ข้อมูลด่วนทั้งหมด (wifi เบอร์ ฯลฯ)" },
      { cmd: "ข้อมูล wifi", does: "ค้นหัวข้อ / ค่า" },
      { cmd: "โน้ต · โน๊ต", does: "รายการโน้ต" },
      { cmd: "โน้ต วีซ่า", does: "ค้นหัวข้อ / เนื้อหา" },
    ],
    examples: ["ข้อมูล wifi", "โน้ต วีซ่า"],
    tries: [{ label: "ลอง ข้อมูล", text: "ข้อมูล" }, { label: "ลอง โน้ต", text: "โน้ต" }],
  },
  {
    id: "transport",
    title: "🚌 การเดินทาง",
    aliases: ["เดินทาง", "การเดินทาง"],
    commands: [
      { cmd: "เดินทาง · การเดินทาง", does: "การเดินทางวันนี้" },
      { cmd: "เดินทาง พรุ่งนี้", does: "การเดินทางของวันนั้น" },
      { cmd: "เดินทาง ดิสนีย์", does: "ค้นต้นทาง / ปลายทาง" },
      { cmd: "รอบต่อไป · รถรอบถัดไป", does: "เที่ยวถัดไปของวันนี้" },
    ],
    examples: ["เดินทาง", "รอบต่อไป"],
    tries: [{ label: "ลองเลย", text: "เดินทาง" }],
  },
  {
    id: "other",
    title: "⚙️ อื่นๆ",
    aliases: ["อื่นๆ", "เมนู"],
    commands: [
      { cmd: "เมนู · ?", does: "การ์ดเมนูและปุ่มลัด" },
      { cmd: "คู่มือการใช้งาน · คู่มือ", does: "คู่มือนี้ (คู่มือ แพลน = เฉพาะหัวข้อ)" },
      { cmd: "ขอดู / ขอ นำหน้า", does: "ใช้กับคำสั่งดูข้อมูลได้ เช่น ขอดูแพลน" },
      { cmd: "ทริปที่ใช้", does: 'บอทใช้ทริปที่สถานะ "กำลังเที่ยว"' },
      { cmd: "แก้ไขข้อมูล", does: "ทำในแอป (LINE ทำได้แค่บันทึกค่าใช้จ่าย ติ๊กแพลน ติ๊กร้านว่าไปแล้ว)" },
    ],
    examples: ["เมนู", "คู่มือ แพลน"],
    tries: [],
  },
];

export function topicFromId(id: string | undefined): GuideTopic | null {
  return GUIDE_TOPICS.find((t) => t.id === id)?.id ?? null;
}

// "คู่มือ" / "คู่มือการใช้งาน" (+ optional "ขอดู" prefix) → the whole guide;
// "คู่มือ <หัวข้อ>" → that topic; an unknown word after it → the whole guide.
export function matchGuide(text: string): { topic: GuideTopic | null } | null {
  const m = matchKeyword(text, GUIDE_KEYWORDS);
  if (!m) return null;
  const word = m.rest.trim().toLowerCase();
  if (!word) return { topic: null };
  const topic = GUIDE_TOPICS.find((t) => t.aliases.some((a) => a.toLowerCase() === word));
  return { topic: topic?.id ?? null };
}

function header(title: string): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: CLAY.coral,
    paddingAll: "14px",
    contents: compact<FlexNode>([txt(title, { weight: "bold", size: "lg", color: "#FFFFFF" })]),
  };
}

const button = (action: FlexNode, style: "secondary" | "link" = "secondary"): FlexNode => ({
  type: "button", style, height: "sm", ...(style === "secondary" ? { color: CLAY.card } : {}), action,
});

function commandRow(cmd: string, does: string): FlexNode {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: compact<FlexNode>([
      txt(cmd, { size: "sm", weight: "bold", color: CLAY.ink, flex: 5 }),
      txt(does, { size: "sm", color: CLAY.muted, flex: 5 }),
    ]),
  };
}

function topicBubble(t: GuideTopicData, withContentsButton: boolean): FlexNode {
  const buttons = compact<FlexNode>([
    ...t.tries.map((x) => button(messageAction(x.label, x.text))),
    t.copy ? button(clipboardAction("คัดลอกตัวอย่าง", t.copy)) : null,
    withContentsButton ? button(postbackAction("📖 สารบัญคู่มือ", { a: "menu_go", t: "guide" }), "link") : null,
  ]);
  return {
    type: "bubble",
    size: "kilo",
    header: header(t.title),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      paddingAll: "14px",
      contents: compact<FlexNode>([
        txt("พิมพ์ → ได้อะไร", { size: "xs", color: CLAY.muted }),
        ...t.commands.map((c) => commandRow(c.cmd, c.does)),
        txt("ตัวอย่าง", { size: "xs", color: CLAY.muted, margin: "md" }),
        ...t.examples.map((x) => txt(x, { size: "sm", color: CLAY.ink })),
      ]),
    },
    ...(buttons.length > 0 ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "10px", contents: buttons } } : {}),
  };
}

function contentsBubble(): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    header: header("📖 คู่มือการใช้งาน"),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      paddingAll: "12px",
      contents: compact<FlexNode>([
        txt("เลือกหัวข้อ หรือเลื่อนดูทีละใบ →", { size: "sm", color: CLAY.muted }),
        ...GUIDE_TOPICS.map((t) => button(postbackAction(t.title, { a: "menu_go", t: "guide", q: t.id }))),
      ]),
    },
  };
}

export function buildGuideMessage(topic: GuideTopic | null): FlexNode {
  const found = GUIDE_TOPICS.find((t) => t.id === topic);
  if (found) return flexMessage(`คู่มือ: ${found.title}`, topicBubble(found, true));
  return flexMessage("คู่มือการใช้งาน", {
    type: "carousel",
    contents: [contentsBubble(), ...GUIDE_TOPICS.map((t) => topicBubble(t, false))],
  });
}
```

- [ ] **Step 5: Run the tests and the three checks**

Run:
```bash
npm test -- lib/line-flex.test.ts lib/line-guide.test.ts
npm test
npx tsc --noEmit
npx eslint lib/line-flex.ts lib/line-flex.test.ts lib/line-guide.ts lib/line-guide.test.ts
```
Expected: PASS / clean. (The coverage test passes because every router keyword — including `plan`, `next`, `now`, `โน๊ต`, `อยากไป`, `สถานที่`, `กิน`, `รถรอบถัดไป`, `การเดินทาง`, `?` — appears in a command row, and `GUIDE_KEYWORDS` appear in the `other` topic.)

- [ ] **Step 6: Commit**

```bash
git add lib/line-flex.ts lib/line-flex.test.ts lib/line-guide.ts lib/line-guide.test.ts
git commit -m "$(cat <<'EOF'
feat(line): guide topics, matcher and carousel builder

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire the guide in (router, menu, HINT_TEXT, dispatch)

**Files:**
- Modify: `lib/line-router.ts`, `lib/line-router.test.ts`
- Modify: `lib/line-menu.ts`, `lib/line-menu.test.ts`
- Modify: `lib/line-dispatch.ts`, `lib/line-dispatch.test.ts`
- Modify: `lib/line-expense-answers.test.ts` (one test)

**Interfaces:**
- Consumes (Task 3): `matchGuide`, `topicFromId`, `buildGuideMessage`, `GuideTopic`.
- Produces: `Route` gains `{ kind: "guide"; topic: GuideTopic | null }`; `isViewCommand("คู่มือ…")` is true; `menuGoRoute({ t: "guide", q? })` → guide route; menu bubble 1 has a `menu_go&t=guide` button; `HINT_TEXT` changes. `app/api/line/webhook/route.ts` needs no change (the guide route is answered before the trip is loaded).

- [ ] **Step 1: Write the failing tests**

`lib/line-router.test.ts`:
- In the `it.each([...])("%s", …)` table of `describe("step 2: view commands"`, append these rows before the closing `])`:
```ts
    ["คู่มือการใช้งาน", { kind: "guide", topic: null }],
    ["คู่มือ", { kind: "guide", topic: null }],
    ["ขอดูคู่มือ", { kind: "guide", topic: null }],
    ["คู่มือ แพลน", { kind: "guide", topic: "plan" }],
    ["คู่มือ ตั๋ว", { kind: "guide", topic: "booking" }],
    ["คู่มือ ค่าใช้จ่าย", { kind: "guide", topic: "expense" }],
    ["คู่มือ 2", { kind: "guide", topic: null }],
```
- Replace the test `it("a pending flow does not block view commands", …)` with:
```ts
  it("a pending flow does not block view commands, including the guide", () => {
    expect(classifyText("แพลน", ctx({ flowStep: "amount", isFlowAnswer: never }))).toEqual({ kind: "plan", rest: "" });
    expect(classifyText("คู่มือ", ctx({ flowStep: "missing", isFlowAnswer: never }))).toEqual({ kind: "guide", topic: null });
    expect(classifyText("คู่มือ จอง", ctx({ flowStep: "missing", isFlowAnswer: never }))).toEqual({ kind: "guide", topic: "booking" });
  });

  it("the guide works in a group and in 1:1 alike", () => {
    expect(classifyText("คู่มือ", ctx({ isGroup: true }))).toEqual({ kind: "guide", topic: null });
    expect(classifyText("คู่มือ", ctx({ isGroup: false }))).toEqual({ kind: "guide", topic: null });
  });
```
- In `describe("isViewCommand"`, add `"คู่มือ"`, `"คู่มือการใช้งาน"`, `"คู่มือ แพลน"`, `"ขอดูคู่มือ"` to the `it.each([...])` list of view commands; add `"ทำคู่มือ"` to the list of non-view commands.

`lib/line-menu.test.ts`:
- Change the HINT_TEXT expectation to `expect(HINT_TEXT).toBe("ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ คู่มือการใช้งาน");`
- Add `import { classifyText } from "./line-router";` is NOT needed. Add inside `describe("buildMenuMessage"`:
```ts
  it("bubble 1 has the คู่มือการใช้งาน button (menu_go → guide)", () => {
    const bubble1 = (carousel.contents as FlexNode[])[0];
    const footerButtons = ((bubble1.footer as FlexNode).contents as FlexNode[]).filter((n) => n.type === "button");
    expect(footerButtons).toHaveLength(1);
    const action = footerButtons[0].action as FlexNode;
    expect(action.label).toBe("📖 คู่มือการใช้งาน");
    expect(decodePostback(action.data as string)).toEqual({ a: "menu_go", t: "guide" });
  });
```
- Add inside `describe("menuGoRoute"`:
```ts
  it("maps the guide, with or without a topic", () => {
    expect(menuGoRoute({ a: "menu_go", t: "guide" })).toEqual({ kind: "guide", topic: null });
    expect(menuGoRoute({ a: "menu_go", t: "guide", q: "plan" })).toEqual({ kind: "guide", topic: "plan" });
    expect(menuGoRoute({ a: "menu_go", t: "guide", q: "bogus" })).toEqual({ kind: "guide", topic: null });
  });
```

`lib/line-expense-answers.test.ts`: add inside `describe("interpretAnswer"`:
```ts
  it("คู่มือ (a view command now) is never an answer, so it leaves a pending draft alone", () => {
    for (const step of ["missing", "note", "payer", "owed"] as FlowStep[]) {
      expect(interpretAnswer(st(step), "คู่มือ", M)).toBeNull();
      expect(interpretAnswer(st(step), "คู่มือ จอง", M)).toBeNull();
    }
    expect(interpretAnswer(st("missing"), "คู่มือ HKD", M)).toBeNull();
  });
```

`lib/line-dispatch.test.ts`: add `import { buildGuideMessage } from "@/lib/line-guide";` after the `line-menu` import, then add inside `describe("text"`:
```ts
  it("answers คู่มือ without a trip and without loading one", async () => {
    const ctx = ctxFor(textEvent("คู่มือการใช้งาน"), { trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([buildGuideMessage(null)]);
    expect(plan.handleRoute).not.toHaveBeenCalled();
  });

  it("answers คู่มือ <topic> with that topic's bubble, even in a group", async () => {
    const ctx = ctxFor(textEvent("คู่มือ แพลน"), { isGroup: true });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([buildGuideMessage("plan")]);
  });

  it("คู่มือ is a view command: it does not touch a pending expense flow", async () => {
    vi.mocked(readFlowSession).mockResolvedValue({ ...SESSION, step: "missing" });
    vi.mocked(expense.flowAnswerPredicate).mockResolvedValue(() => false);
    const ctx = ctxFor(textEvent("คู่มือ"));
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([buildGuideMessage(null)]);
    expect(expense.handleRoute).not.toHaveBeenCalled();
  });
```
and inside `describe("postbacks"` (after the `menu_go runs the shortcut's route` test):
```ts
  it("menu_go with t=guide replies the guide without a trip; q picks a topic", async () => {
    const all = ctxFor(postbackEvent({ a: "menu_go", t: "guide" }), { trip: null });
    await dispatchEvent(all);
    expect(all.reply).toHaveBeenCalledWith([buildGuideMessage(null)]);
    const one = ctxFor(postbackEvent({ a: "menu_go", t: "guide", q: "booking" }), { trip: null });
    await dispatchEvent(one);
    expect(one.reply).toHaveBeenCalledWith([buildGuideMessage("booking")]);
  });
```
Also in the existing test `"never loads the trip for small talk, hints or the menu"` add one more line before the `expect`: `await dispatchEventWithTrip(baseFor(textEvent("คู่มือ")), loadTrip);`

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- lib/line-router.test.ts lib/line-menu.test.ts lib/line-dispatch.test.ts lib/line-expense-answers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the router change**

In `lib/line-router.ts`:

1. Add to the imports: `import { matchGuide, type GuideTopic } from "@/lib/line-guide";`
2. In the `Route` union add (after the `menu` line): `  | { kind: "guide"; topic: GuideTopic | null }`
3. In `matchViewCommand`, directly after the `if (s === MENU_EXACT) return { kind: "menu" };` line add:
```ts
  const guide = matchGuide(s);
  if (guide) return { kind: "guide", topic: guide.topic };
```
4. Update the comment above `isViewCommand` to read: `// True when the text is a step-2 VIEW command (แพลน/plan, ต่อไป/next, ตอนนี้/now, #<n>, เมนู, exactly ?, ข้อมูล/ข้อมูลด่วน, โน้ต/โน๊ต, คู่มือ/คู่มือการใช้งาน [หัวข้อ]). ...` (keep the rest of the comment).

- [ ] **Step 4: Implement the menu change**

In `lib/line-menu.ts`:

1. Imports: change the first line to also import the guide topic helper: add `import { topicFromId } from "@/lib/line-guide";`
2. `HINT_TEXT`: `export const HINT_TEXT = "ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ คู่มือการใช้งาน";`
3. In `expenseBubble()` add a footer after the `body` property (inside the returned bubble object):
```ts
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        { type: "button", style: "secondary", height: "sm", color: CLAY.card, action: postbackAction("📖 คู่มือการใช้งาน", { a: "menu_go", t: "guide" }) },
      ],
    },
```
4. In `menuGoRoute`, add the case before `default`: `    case "guide": return { kind: "guide", topic: topicFromId(q) };`

- [ ] **Step 5: Implement the dispatch change**

In `lib/line-dispatch.ts`:

1. Add `import { buildGuideMessage } from "@/lib/line-guide";` after the `line-menu` import.
2. In `routeTo`, directly after the `if (route.kind === "menu") { … return; }` block add:
```ts
  if (route.kind === "guide") {
    await base.reply([buildGuideMessage(route.topic)]);
    return;
  }
```
(The trailing `switch (route.kind)` stays exhaustive because `guide` is already narrowed away.)

- [ ] **Step 6: Run the tests and the three checks**

Run:
```bash
npm test -- lib/line-router.test.ts lib/line-menu.test.ts lib/line-dispatch.test.ts lib/line-guide.test.ts lib/line-expense-answers.test.ts
npm test
npx tsc --noEmit
npx eslint lib/line-router.ts lib/line-router.test.ts lib/line-menu.ts lib/line-menu.test.ts lib/line-dispatch.ts lib/line-dispatch.test.ts lib/line-expense-answers.test.ts
```
Expected: PASS / clean. (The guide coverage test now also covers the router: nothing new is added to router keyword lists, so it still passes.)

- [ ] **Step 7: Commit**

```bash
git add lib/line-router.ts lib/line-router.test.ts lib/line-menu.ts lib/line-menu.test.ts lib/line-dispatch.ts lib/line-dispatch.test.ts lib/line-expense-answers.test.ts
git commit -m "$(cat <<'EOF'
feat(line): คู่มือการใช้งาน command, menu button and hint

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update `docs/line-bot-how-to.md`

**Files:**
- Modify: `docs/line-bot-how-to.md`

- [ ] **Step 1: Replace section 1**

Replace everything from the line `## 1. บันทึกค่าใช้จ่าย` up to (not including) the `---` line that precedes `## 2. แพลน` with:

````markdown
## 1. บันทึกค่าใช้จ่าย

พิมพ์ยอดมาได้เลย บอทถาม **เฉพาะที่ขาด ในการ์ดใบเดียว** — ครบเมื่อไหร่ **บันทึกให้อัตโนมัติ** ไม่ต้องกดยืนยัน

### ข้อมูลที่ต้องมี
| ข้อมูล | ถ้าไม่บอก |
|---|---|
| **ยอดเงิน** | การ์ดถาม (พิมพ์ตัวเลข) |
| **สกุลเงิน** | การ์ดถาม (ปุ่ม HKD / THB) |
| **คนจ่าย** | ใช้คนที่ส่งข้อความ (ชื่อ LINE ต้องตรงกับชื่อสมาชิกในแอป ไม่ตรง → การ์ดถาม) |
| **หาร** | การ์ดถาม (ปุ่ม ไม่หาร / หารเท่า / หารไม่เท่า) |
| ยอดฝากจ่าย | ถามเมื่อเลือก หารไม่เท่า (พิมพ์ตัวเลข) |
| หมวด | บอทเดาเอง (แก้ได้หลังบันทึก) |
| โน้ต | คำที่เหลือในข้อความ |

### การหาร
| แบบ | ความหมาย |
|---|---|
| **ไม่หาร** | คนจ่ายจ่ายของตัวเอง |
| **หารเท่า** | แบ่งครึ่ง 2 คน (ทริปที่มีมากกว่า 2 คน การ์ดถามเพิ่มว่า "หารกับใคร") |
| **หารไม่เท่า** | อีกคนฝากจ่ายบางส่วน — พิมพ์ยอดที่ฝาก เช่น `ฝาก 20` |

### พิมพ์แบบไหนก็ได้
```
120 บาท ข้าวมันไก่ ไม่หาร          → ครบ บันทึกเลย
120 HKD ข้าว หาร                 → ครบ บันทึกเลย (หารเท่า)
500 บาท เซเว่น ฝาก 20             → ครบ บันทึกเลย (หารไม่เท่า อีกคนคืน 20)
120 ข้าวมันไก่                    → การ์ดถาม สกุลเงิน + หาร
120                              → การ์ดถาม สกุลเงิน + หาร
```
คำสกุลเงิน: `HKD` `hk` `ดอลฮ่องกง` = HKD · `บาท` `฿` `THB` = THB
บอทใช้ **ทริปที่สถานะ "กำลังเที่ยว"** — การ์ดมีบรรทัดเล็ก `ทริป …` บอกว่าบันทึกลงทริปไหน

### การ์ดถามที่ขาด (ใบเดียว)
```
💸 120 · ข้าวมันไก่
เหลืออีก 2 อย่าง
✓ ยอด        120
สกุลเงิน     [HKD] [THB]
✓ คนจ่าย     เก่ง
หาร          [ไม่หาร] [หารเท่า] [หารไม่เท่า]

พิมพ์ตอบทีเดียวก็ได้ เช่น "HKD เก่ง หารเท่า"
[🗑 ยกเลิก]
```
- **กดปุ่ม** ทีละข้อ หรือ **พิมพ์ครั้งเดียวหลายข้อ** เช่น `HKD เก่ง หารเท่า` · `ฝาก 20` · `120`
- แตะแถวที่ตอบแล้ว (✓) = ล้างค่านั้น แล้วเลือกใหม่
- พิมพ์ไม่เข้าใจ → การ์ดเดิมขึ้นซ้ำพร้อมคำแนะนำ
- กดปุ่มบนการ์ดเก่า → "ปุ่มนี้หมดอายุแล้ว" แล้วส่งการ์ดปัจจุบันให้ใหม่
- เริ่มรายการใหม่ทั้งที่อันเก่าค้าง → บอทถาม ทำต่ออันเก่า / เก็บไว้ก่อน / ทิ้งอันเก่า

### ส่งรูปสลิป
ส่งรูป → การ์ด "รับสลิปแล้ว 📸" ถามยอด + ที่ขาด (พิมพ์ยอดตามมาภายใน 30 นาที บอทรวมเข้ากับรูปให้)

### การ์ด "✅ บันทึกแล้ว"
```
✅ บันทึกแล้ว
120 HKD (~540฿)
🍜 อาหาร · 📝 ข้าวมันไก่
👤 เก่ง จ่าย
⚖️ หารเท่า: โอคืน 270฿
[✏️ แก้] [🗑 ลบ]
ทริป HKG กวางโจว
```
- **✏️ แก้** → เลือกข้อ (ยอด / สกุลเงิน / คนจ่าย / หาร / หมวด / โน้ต) → ตอบข้อนั้น → **บันทึกทับทันที** แล้วส่งการ์ดใหม่ (แก้ยอด → คำนวณการหารใหม่ ติ๊ก "จ่ายแล้ว" ที่เคยทำไว้ยังอยู่)
- **🗑 ลบ** → ถามก่อน: ลบรายการนี้ / ไม่ลบ
- ดึงเรตแลกเปลี่ยนไม่ได้ → การ์ดเตือน "ดึงเรตไม่ได้" ใช้เรต 1 ไปก่อน แก้ในแอป

### ระหว่างทาง
| พิมพ์ / กด | ผล |
|---|---|
| `ยกเลิก` · ปุ่ม 🗑 ยกเลิก | เลือก ลบทิ้ง / เก็บไว้กรอกทีหลัง |
| `ทำต่อ` | กลับมากรอกรายการที่ค้าง |
| `แก้ล่าสุด` | เปิดการ์ด "บันทึกแล้ว" ของรายการล่าสุดที่เราบันทึก (กด แก้ / ลบ ต่อได้) |

- เงียบเกิน 30 นาที → รายการที่ยังไม่ครบค้างอยู่ในคิว "รอกรอก" ในแอป ไม่หาย
- กำลังกรอกอยู่แล้วพิมพ์คำสั่งดูข้อมูล (เช่น `แพลน` `คู่มือ`) ได้ — รายการที่กรอกค้างยังอยู่
- กำลังกรอกอยู่ ส่งรูปแนบเข้ารายการที่ยังไม่มีรูปได้ · ส่งรูปที่สอง → บอทถามว่าจะทำยังไง
- ถ้ามีรายการค้างอยู่แล้วกด ✏️ แก้ บนรายการเก่า → บอทให้จัดการรายการที่ค้างก่อน
````

- [ ] **Step 2: Add the guide to section 8**

In `## 8. อื่นๆ`, replace the table with:

```markdown
| พิมพ์ | ผล |
|---|---|
| `เมนู` · `?` | การ์ดสอนใช้ + ปุ่มลัดทุกคำสั่ง (ใบแรกมีปุ่ม 📖 คู่มือการใช้งาน) |
| `คู่มือการใช้งาน` · `คู่มือ` | คู่มือแบบเลื่อนดู: สารบัญ + 1 ใบต่อหัวข้อ (ใช้ได้โดยไม่ต้องมีทริป และในกลุ่มด้วย) |
| `คู่มือ ค่าใช้จ่าย` · `คู่มือ แพลน` · `คู่มือ จอง` (หรือ `ตั๋ว` `เอกสาร`) · `คู่มือ ร้าน` (หรือ `ที่เที่ยว`) · `คู่มือ ข้อมูล` (หรือ `โน้ต`) · `คู่มือ เดินทาง` | เฉพาะหัวข้อนั้น 1 ใบ |

ในคู่มือ ปุ่ม **ลองเลย** ใช้ได้กับคำสั่งดูข้อมูลเท่านั้น (แพลน ต่อไป จอง ร้าน ที่เที่ยว ข้อมูล โน้ต เดินทาง) · หัวข้อบันทึกค่าใช้จ่ายมีปุ่ม **คัดลอกตัวอย่าง** แทน เพราะกดส่งแล้วจะบันทึกจริง
```

and change the first bullet below the table's sibling list so it reads (keep the other bullets): `- ทุกคำสั่งพิมพ์ \`ขอดู\` / \`ขอ\` นำหน้าได้ เช่น \`ขอดูแพลนพรุ่งนี้\``. Also change the intro line at the top of the file from `ตอบเฉพาะข้อความที่มีตัวเลข, รูป, หรือขึ้นต้นด้วยคำสั่ง` to `ตอบเฉพาะข้อความที่มีตัวเลข, รูป, หรือขึ้นต้นด้วยคำสั่ง (รวม \`คู่มือ\`)`.

- [ ] **Step 3: Verify and commit**

Run (docs only, but confirm nothing else regressed):
```bash
npm test
npx tsc --noEmit
```
Expected: PASS / clean.

```bash
git add docs/line-bot-how-to.md
git commit -m "$(cat <<'EOF'
docs(line): how-to for the one-card expense flow, saved-card edit/delete and the guide command

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| `missingFields` (all subsets, payer from LINE name, unequal needs owed, owed unaskable w/o amount) | 1 (tests + impl) |
| `interpretBundle` (all token kinds, bare-number rules, unknown tokens, conflicts, null) | 1 |
| auto-finalize on complete (typed once / button by button / fx failure warning), using the post-answer state | 2 (`settle` → `saved.state`, `saveDone`; handler tests "saves at once", "saving uses the answer just given", "falls back to rate 1") |
| rev-based stale buttons, `e`+`v`, re-send card with `ปุ่มนี้หมดอายุแล้ว`, per-person sessions | 2 (`applyAnswer` rev, `handlePostback`; "stale buttons" tests) |
| `x_set`, `x_clear`, `x_edit`, `x_del` postbacks; `x_confirm` retired | 2 (`postbackToAnswer`, handler; "buttons of the removed flow are answered as expired") |
| `missingCard` (rows, hint, cancel, trip name A2, no empty text nodes, buttons only for missing) | 2 (messages + tests) |
| `savedCard` with ✏️/🗑 + trip name | 2 |
| edit-after-confirm saves immediately; keeps `paid`; delete asks first; `แก้ล่าสุด` opens saved card | 2 (handler tests "✏️ แก้ → …", "keeps paid", "🗑 ลบ asks first", "แก้ล่าสุด opens the saved card") |
| keep: fx warning, paid carry-over, photo attach & conflict, ยกเลิก, ทำต่อ, TTL | 2 (tests listed; TTL lives in unchanged `lib/line-session.ts`/its test, `readFlowSession` still gates every path) |
| guide route + `lib/line-guide.ts` + `isViewCommand` + menu button + `HINT_TEXT` + dispatch | 3, 4 |
| keyword-coverage consistency test (dynamic over every router `*_KEYWORDS`), expense topic has no `message` action, `คู่มือ <topic>` jump, `คู่มือ จอง`=`คู่มือ ตั๋ว` | 3 |
| router: `คู่มือการใช้งาน` / `คู่มือ แพลน` → guide even with flow pending; `isViewCommand("คู่มือ")` | 4 |
| docs/line-bot-how-to.md | 5 |
| Old tests asserting old behavior updated/replaced | listed in "File Structure"; done in Task 2 / Task 4 |

**2. Placeholder scan:** no TBD/TODO; every code step has complete code; every command has expected output.

**3. Type consistency checks**
- `Field`, `Bundle`, `missingFields`, `FlowData.rev`: defined in Task 1, reproduced identically in Task 2's full `flow.ts`.
- `interpretBundle(text, { expense, data, members })` (Task 1) is called from `interpretAnswer` (Task 2) with the same shape; `interpretAnswer(st, text, members)` is called by the handler (`interpretAnswer(st, text, env.members)`) and by `flowAnswerPredicate` (`st` built as `{ expense, step, data }`).
- `stateFromExpense(expense, tripCurrency, asker?)` and `initialState(p)` (no `members`) match every call site in the handler and tests.
- `savedCard(e, d, origin, tripName)` matches handler (`savedCard(ready.expense, ready.data, ctx.origin, trip.name)`) and tests.
- `stepMessages(st, env, cc, notice?)` / `missingCard(st, env, cc, notice?)` use `CardCtx`.
- Postback keys `a, f, w, e, v` are produced in messages (`pb`, `setPb`) and consumed in `postbackToAnswer` / `handlePostback`; the saved card's `{ a, e }` pair is consumed by `handleSavedAction`.
- `Outcome` `{ k: "saved"; state: FlowState }` replaces `confirm`; every consumer re-checked: `settle` (producer), `applyAnswer` wrapper (passes non-ask outcomes through), `runOutcome` calls `saveDone(ctx, trip, outcome.state, env, lead)`, tests use `savedState` / `savedExpense` (= `state.expense`) and `toMatchObject({ k: "saved", state: ... })`.
- `extractAtMember` (Task 1) is consumed by `startDraft`; `normalizeStep` is now also used by `leave`.
- `Route.guide` (Task 4) is produced by `matchViewCommand` and `menuGoRoute`, consumed in `routeTo`.
- Regexes used: `/@/g`, `/\s/`, `/\s+/` (checked; no `/s+/`).

**Known deliberate behaviors worth a reviewer's glance:** an unplaceable number makes text a non-answer (ambiguity 6); `ทิ้งอันเก่า` never deletes a saved expense (ambiguity 11); `แก้ล่าสุด` ignores pending drafts (ambiguity 9).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-22-line-expense-one-card-and-guide.md`. Two execution options:

**1. Subagent-Driven (recommended)** - fresh subagent per task, review between tasks. Task 2 is the one large atomic swap; give it to a single subagent with the whole task text.

**2. Inline Execution** - execute tasks in this session using executing-plans, with a checkpoint after Task 2.
