# LINE Bot Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared LINE-bot backbone (text/date/flex/maps helpers, router, sessions, menu, handler contract, dispatch, thin webhook). The current photo → "who?" → "note?" → confirmation-card flow keeps working, moved into `lib/line-handlers/expense.ts`.

**Architecture:** Pure modules (`lib/line-text.ts`, `lib/line-date.ts`, `lib/line-flex.ts`, `lib/line-maps.ts`, `lib/line-router.ts`, `lib/line-menu.ts`) hold all parsing and message building, and vitest tests them without network mocks. I/O happens only in `lib/line-session.ts` (through `lib/store`), `lib/line-handlers/*` and the webhook route. The webhook verifies the request, builds one `HandlerCtx` per event and calls `dispatchEvent`. `dispatchEvent` routes postbacks by action prefix, sends images to expense, and passes text through `classifyText` to the right feature handler. Every feature handler except expense is a stub that later plans replace whole-file.

**Tech Stack:** Next.js 16 route handler (`NextRequest`, `req.nextUrl.origin`), TypeScript strict, vitest 4 (`npm test -- <path>`, default env jsdom; I/O tests opt into `// @vitest-environment node`), Google Sheets via `lib/store`.

**Source of truth:** `docs/superpowers/specs/2026-11-21-line-bot-shared-design.md` (overrides the per-feature `2026-11-19-line-*-design.md` specs). User-facing copy reference: `docs/line-bot-how-to.md`.

## Global Constraints

- Exported names/signatures MUST match the shared spec exactly. Other plans (expense, plan+transport, booking+places+info) are written against them in parallel.
- `lib/line-*.ts` without I/O must be **pure**: no `fetch`, no `lib/store` import, no `Date.now()`/`new Date()` without arguments. Time always comes in as a `now: Date` parameter.
- Reply only (`/v2/bot/message/reply`), ≤ 5 messages per reply.
- Flex: carousel ≤ 12 bubbles · no empty text node · altText ≤ 400 chars.
- Postback data ≤ 300 chars.
- Quick reply ≤ 13 items, label ≤ 20 chars.
- Images: `${origin}/api/img/{id}` (public).
- Postback action prefixes: `x_` expense · `plan_` plan · `bk_` booking · `pl_` places · `qi_` `qn_` info · `tr_` transport · `amb_` ambiguity · `menu` menu.
- `LineSession.data` is appended as the LAST mapper column (kind `"j"`). Old rows read `[]` there, and that must be normalized to `{}`.
- Flow-session TTL: `SESSION_TTL_MS = 30 * 60 * 1000`. Ctx rows (`{userKey}#ctx`) never expire.
- No-trip reply copy (exact): `ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ`
- Hint copy (exact): `ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ เมนู`
- Stub copy (exact): `ฟีเจอร์นี้กำลังพัฒนา`
- Next.js here has breaking changes vs older versions. Before touching `app/api/line/webhook/route.ts`, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. Keep the existing `NextRequest` / `NextResponse.json` / `req.nextUrl.origin` usage, which already works in this version.
- Don't start a local dev server or open a browser preview. Verify with `npm test`, `npx tsc --noEmit` and `npx eslint`.
- Regexes that use lookbehind (`(?<!…)`) must be built with `new RegExp("…")` strings, not regex literals (tsconfig `target` is ES2017, and TS rejects lookbehind literals below ES2018).
- Commit messages end with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (use a second `-m`).
- **`npx tsc --noEmit` must be clean before EVERY commit**, including test files. The user deploys `main` straight to Vercel, which type-checks the build, so no commit may leave the tree broken.
- **The foundation must stay quiet in the group chat if it ships alone.** Stub features reply only in 1:1, and in a group they say nothing.

## Decisions where the spec is silent or self-contradictory

These are binding for this plan (and documented so parallel plans can rely on them):

1. **`plan` route `rest` for token commands.** For `แพลน`/`plan`, `rest` is the text after the keyword (`แพลน พรุ่งนี้ 2` → `"พรุ่งนี้ 2"`). For `ต่อไป` `next` `ตอนนี้` `now` and `#<n>`, `rest` is the **whole polite-stripped text, keyword included** (`ต่อไป` → `"ต่อไป"`, `#2` → `"#2"`, `ขอดู now` → `"now"`). The plan handler parses those tokens. The menu shortcut "ต่อไป" sends `rest: "ต่อไป"` too.
2. **Route `rest` values are NOT date-stripped.** `จอง 21/11` → `{ kind: "booking", rest: "21/11" }`. Features run `extractDate` themselves.
3. **`ambiguous.text`** is the original message, trimmed. `amb_go` rebuilds the feature route from it via the exported `commandRoute(target, text)`.
4. **English keywords need a word boundary** (`plan` matches `plan 20/11` and `PLAN`, not `planet`). Thai keywords are pure prefix match (Thai has no spaces).
5. **Extra keywords:** `การเดินทาง` (transport, since the menu says "การเดินทาง") and `โน๊ต` (a common misspelling of `โน้ต`).
6. **Expense commands with no flow session** (`ทำต่อ` `แก้ล่าสุด` `ยกเลิก`, exact match after polite strip) route to `{ kind: "expense_new", text }` at step 3.5 (after collision commands, before the digit check). The `Route` union has no dedicated kind for them, so the expense handler recognizes the command from `text` (`EXPENSE_COMMAND_KEYWORDS` is exported for that).
7. **`classifyText` with `dateCtx === null`** still strips date tokens for the digit check, using a fixed fallback ctx (`2000-01-01`). The route is the same either way, so dispatch always classifies with `dateCtx: null`. That lets it classify **before** loading the trip.
8. **`mapButtons` with `mapsLink` but empty `query`** returns only the Google button. An Amap search with no keyword is useless.
9. **Postbacks and images need a trip** (except `menu`, `menu_go`, and `amb_*`, which go through route-kind checks). With `trip === null` they get the no-trip reply.
10. **All stubs** (the feature stub files and the expense stub routes `expense_new`, `flow_conflict`, `flow_reask`, plus expense postbacks) are silent in groups and reply `ฟีเจอร์นี้กำลังพัฒนา` in 1:1. This keeps today's production behavior, where the group never hears from the bot except during the slip flow.
11. **Menu shortcut postback:** `a=menu_go&t=<plan|booking|places|info|notes|transport>`, optional `k=r|w` (places) and `q=<rest>`. `menuGoRoute(data)` in `lib/line-menu.ts` turns it into a `Route`.
12. **Ctx row on trip change:** `writeCtx` drops the previous `data` when the stored `trip_id` differs from the new `tripId` (a stale `lastPlanDate` from another trip is useless).
13. **Thai date label example:** the spec's `"พฤ 20 พ.ย."` is illustrative only. 2026-11-20 is a Friday, so `thaiDateLabel("2026-11-20")` is `"ศ 20 พ.ย."`.
14. **`?` is an exact-match menu keyword:** only the whole message `?` opens the menu, while `เมนู` stays a prefix keyword.
15. **Postback encoding is NOT URLSearchParams.** `encodePostback` escapes only `%` `&` `=` `+` (as `%25` `%26` `%3D` `%2B`) and leaves everything else raw, including Thai and spaces, so Thai text costs 1 char per char against the 300 limit. `decodePostback` is its exact inverse. Feature plans must always use these two functions and never `URLSearchParams` on postback data.
16. **Old photo flow lets view commands through:** while `awaiting_name` / `awaiting_note`, any text is the answer **except** a view command as recognized by `isViewCommand(text)`, a new export in `lib/line-router.ts` that covers the step-2 view keywords, `#<n>` and exactly `?`. Those route normally and the flow stays pending. Collision words (`ร้าน`, `กิน`, `จอง`, `ตั๋ว`, `เดินทาง`, …) are still taken as the name or note, so `ร้านนี้อร่อย` gets saved. **The expense plan should import `isViewCommand` from `lib/line-router.ts` instead of defining its own** (same semantics).
17. **Lazy trip loading.** The webhook calls `dispatchEventWithTrip(base, loadTrip)` (new export). Dispatch classifies first and calls `loadTrip()` only when the event needs a trip, so `menu`, `hint` and `ignore` never read the trips tab. The webhook caches the active trip for 30 seconds, but only a positive hit. When no trip is active, every request reads fresh, so switching a trip to "กำลังเที่ยว" takes effect immediately. `dispatchEvent(ctx: HandlerCtx)` keeps its spec signature and wraps the lazy version with `ctx.trip`.
18. **Missing `userId`:** LINE omits `source.userId` for group/room members who haven’t accepted the OA terms, and production serves them today, so those events are **handled**. `userKey` gives them the shared key `group:{groupId}:user:unknown` / `room:{roomId}:user:unknown`, which is acceptable. `isHandledEvent` skips an event only when its source has no id at all (no `userId`, `groupId` or `roomId`).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/line.ts` | modify | + `LineEvent.postback`, `userKey`, `isGroupChat` (keep `sourceKey`) |
| `lib/line-text.ts` | create | polite prefix strip, keyword match, digit test |
| `lib/line-date.ts` | create | tz today/now, `extractDate`, day math, Thai label, `tripDateCtx` |
| `lib/line-flex.ts` | create | `CLAY`, Flex primitives, postback encode/decode, actions, album, messages, quick reply |
| `lib/line-maps.ts` | create | Google Maps / Amap URLs and buttons |
| `lib/models/types.ts` | modify | `LineSession.data` |
| `lib/models/mappers.ts` | modify | `line_sessions` + `["data","j"]` |
| `lib/line-session.ts` | create | flow session (TTL) + ctx row I/O via `lib/store` |
| `lib/line-router.ts` | create | `Route`, `RouteCtx`, keyword lists, `classifyText`, `commandRoute` |
| `lib/line-menu.ts` | create | copy constants, menu carousel, `menuGoRoute`, ambiguity question |
| `lib/line-handlers/types.ts` | create | `HandlerCtx`, `PostbackData` |
| `lib/line-handlers/{plan,booking,places,info,transport}.ts` | create | stubs |
| `lib/line-handlers/expense.ts` | create | photo flow moved from the route + stubbed text routes |
| `lib/line-dispatch.ts` | create | `isHandledEvent`, `dispatchEvent`, `dispatchEventWithTrip` |
| `app/api/line/webhook/route.ts` | modify (Task 6), rewrite (Task 12) | verify → base ctx + cached trip loader → `dispatchEventWithTrip` |

Tests: `lib/line.test.ts` (extend), `lib/line-text.test.ts`, `lib/line-date.test.ts`, `lib/line-flex.test.ts`, `lib/line-maps.test.ts`, `lib/models/mappers.test.ts` (extend), `lib/line-session.test.ts`, `lib/line-router.test.ts`, `lib/line-menu.test.ts`, `lib/line-handlers/stubs.test.ts`, `lib/line-handlers/expense.test.ts`, `lib/line-dispatch.test.ts`.

---

### Task 1: `lib/line.ts` — postback field, `userKey`, `isGroupChat`

**Files:**
- Modify: `lib/line.ts` (the `LineEvent` interface near the top; add two functions right after `sourceKey`)
- Test: `lib/line.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `interface LineEvent { type: string; replyToken?: string; source: LineSource; message?: { id: string; type: string; text?: string }; postback?: { data: string } }`
  - `userKey(source: LineSource): string`. Group → `"group:{groupId}:user:{userId}"`, room → `"room:{roomId}:user:{userId}"`, otherwise `"user:{userId}"`. A missing `userId` becomes `"unknown"`.
  - `isGroupChat(source: LineSource): boolean`. True for `type` `"group"` or `"room"`.

- [ ] **Step 1: Write the failing tests**

In `lib/line.test.ts`, replace the import block at the top:

```ts
import {
  verifyLineSignature,
  matchMemberName,
  sourceKey,
  userKey,
  isGroupChat,
  buildNameQuickReply,
  buildSkipQuickReply,
  buildConfirmationFlex,
} from "./line";
```

Then append at the end of the file:

```ts
describe("userKey", () => {
  it("gives two people in the same group different keys", () => {
    const a = userKey({ type: "group", groupId: "g1", userId: "u1" });
    const b = userKey({ type: "group", groupId: "g1", userId: "u2" });
    expect(a).toBe("group:g1:user:u1");
    expect(b).toBe("group:g1:user:u2");
  });

  it("scopes a room member by room and user", () => {
    expect(userKey({ type: "room", roomId: "r1", userId: "u1" })).toBe("room:r1:user:u1");
  });

  it("uses just the userId for a 1:1 chat", () => {
    expect(userKey({ type: "user", userId: "u1" })).toBe("user:u1");
  });

  it("falls back to a shared 'unknown' key when LINE omits the userId", () => {
    expect(userKey({ type: "group", groupId: "g1" })).toBe("group:g1:user:unknown");
    expect(userKey({ type: "room", roomId: "r1" })).toBe("room:r1:user:unknown");
  });
});

describe("isGroupChat", () => {
  it("is true for groups and rooms", () => {
    expect(isGroupChat({ type: "group", groupId: "g1", userId: "u1" })).toBe(true);
    expect(isGroupChat({ type: "room", roomId: "r1", userId: "u1" })).toBe(true);
  });

  it("is false for a 1:1 chat", () => {
    expect(isGroupChat({ type: "user", userId: "u1" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line.test.ts`
Expected: FAIL, with `userKey is not a function` (or a TS import error for `userKey` / `isGroupChat`).

- [ ] **Step 3: Implement**

In `lib/line.ts`, replace the `LineEvent` interface with:

```ts
export interface LineEvent {
  type: string; // "message" | "postback" | ...
  replyToken?: string;
  source: LineSource;
  message?: { id: string; type: string; text?: string };
  postback?: { data: string };
}
```

Directly after the `sourceKey` function, add:

```ts
// One key per *person* per chat -- two people in the same family group get
// different keys, so each can be midway through their own expense (or have
// their own "last viewed plan day") without stepping on the other.
export function userKey(source: LineSource): string {
  const uid = source.userId ?? "unknown";
  if (source.type === "group" && source.groupId) return `group:${source.groupId}:user:${uid}`;
  if (source.type === "room" && source.roomId) return `room:${source.roomId}:user:${uid}`;
  return `user:${uid}`;
}

export function isGroupChat(source: LineSource): boolean {
  return source.type === "group" || source.type === "room";
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line.test.ts`
Expected: PASS (all old and new tests).

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line.ts lib/line.test.ts
git commit -m "feat(line): per-person userKey, isGroupChat, postback event field" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `lib/line-text.ts` — polite prefix, keyword match, digits

**Files:**
- Create: `lib/line-text.ts`
- Test: `lib/line-text.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `stripPolitePrefix(text: string): string`. Removes leading `ขอดู` / `ขอ` (repeatable), trims, and collapses runs of whitespace to one space.
  - `matchKeyword(text: string, keywords: readonly string[]): { keyword: string; rest: string } | null`. Prefix match after `stripPolitePrefix`. Longest keyword wins, case is ignored, and a keyword ending in an ASCII letter or digit must not be followed by another ASCII letter or digit. `keyword` is returned exactly as given in the list, and `rest` is trimmed.
  - `hasDigit(text: string): boolean`. True for any Arabic (`0-9`) or Thai (`๐-๙`) digit.

- [ ] **Step 1: Write the failing tests**

Create `lib/line-text.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripPolitePrefix, matchKeyword, hasDigit } from "./line-text";

describe("stripPolitePrefix", () => {
  it("removes ขอดู and ขอ, even stacked", () => {
    expect(stripPolitePrefix("ขอดูแพลนพรุ่งนี้")).toBe("แพลนพรุ่งนี้");
    expect(stripPolitePrefix("ขอแพลน")).toBe("แพลน");
    expect(stripPolitePrefix("ขอดูขอแพลน")).toBe("แพลน");
    expect(stripPolitePrefix("ขอ ขอดู แพลน พรุ่งนี้")).toBe("แพลน พรุ่งนี้");
  });

  it("returns empty for a message that is only polite words", () => {
    expect(stripPolitePrefix("ขอดูขอ")).toBe("");
  });

  it("trims and collapses repeated whitespace", () => {
    expect(stripPolitePrefix("   แพลน    พรุ่งนี้  ")).toBe("แพลน พรุ่งนี้");
  });

  it("leaves text without a polite prefix alone", () => {
    expect(stripPolitePrefix("120 ข้าว")).toBe("120 ข้าว");
  });
});

describe("matchKeyword", () => {
  it("prefers the longer keyword (ข้อมูลด่วน over ข้อมูล)", () => {
    expect(matchKeyword("ข้อมูลด่วน wifi", ["ข้อมูล", "ข้อมูลด่วน"])).toEqual({ keyword: "ข้อมูลด่วน", rest: "wifi" });
  });

  it("prefers the longer keyword (ร้านอาหาร over ร้าน)", () => {
    expect(matchKeyword("ร้านอาหาร มงก๊ก", ["ร้าน", "ร้านอาหาร"])).toEqual({ keyword: "ร้านอาหาร", rest: "มงก๊ก" });
    expect(matchKeyword("ร้าน มงก๊ก", ["ร้าน", "ร้านอาหาร"])).toEqual({ keyword: "ร้าน", rest: "มงก๊ก" });
  });

  it("ignores case and returns the keyword as listed", () => {
    expect(matchKeyword("PLAN 20/11", ["plan"])).toEqual({ keyword: "plan", rest: "20/11" });
  });

  it("matches Thai keywords glued to the rest of the text", () => {
    expect(matchKeyword("แพลนพรุ่งนี้", ["แพลน"])).toEqual({ keyword: "แพลน", rest: "พรุ่งนี้" });
  });

  it("strips polite prefixes before matching", () => {
    expect(matchKeyword("ขอดูแพลนพรุ่งนี้", ["แพลน"])).toEqual({ keyword: "แพลน", rest: "พรุ่งนี้" });
  });

  it("requires a word boundary after an English keyword", () => {
    expect(matchKeyword("planet", ["plan"])).toBeNull();
    expect(matchKeyword("nowhere", ["now"])).toBeNull();
  });

  it("only matches at the start", () => {
    expect(matchKeyword("ดูเมนู", ["เมนู"])).toBeNull();
  });

  it("returns empty rest when the keyword is the whole message", () => {
    expect(matchKeyword("โน้ต", ["โน้ต"])).toEqual({ keyword: "โน้ต", rest: "" });
  });

  it("ignores empty keywords", () => {
    expect(matchKeyword("อะไรก็ได้", [""])).toBeNull();
  });
});

describe("hasDigit", () => {
  it("detects Arabic and Thai digits", () => {
    expect(hasDigit("ข้าว 120")).toBe(true);
    expect(hasDigit("ข้าว ๑๒๐")).toBe(true);
  });

  it("is false without digits", () => {
    expect(hasDigit("สวัสดี")).toBe(false);
    expect(hasDigit("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line-text.test.ts`
Expected: FAIL, with `Failed to resolve import "./line-text"`.

- [ ] **Step 3: Implement**

Create `lib/line-text.ts`:

```ts
// Text helpers shared by every LINE command parser. Pure.

const POLITE_PREFIXES = ["ขอดู", "ขอ"] as const;
const ASCII_WORD_CHAR = /[a-z0-9]/i;

// "ขอดูขอแพลน" -> "แพลน". Repeatable, so stacked politeness still parses.
// Note: this also eats the "ขอ" of words like "ขอบคุณ" -- harmless, since
// routing only cares whether a known command keyword follows.
export function stripPolitePrefix(text: string): string {
  let s = text.replace(/\s+/g, " ").trim();
  for (;;) {
    const prefix = POLITE_PREFIXES.find((p) => s.startsWith(p));
    if (!prefix) return s;
    s = s.slice(prefix.length).trim();
  }
}

// Keyword must START the (polite-stripped) message. Longest keyword wins so
// "ข้อมูลด่วน" beats "ข้อมูล". Thai has no spaces, so Thai keywords are a
// plain prefix match; an English keyword needs a word boundary after it so
// "plan" doesn't fire on "planet".
export function matchKeyword(text: string, keywords: readonly string[]): { keyword: string; rest: string } | null {
  const s = stripPolitePrefix(text);
  const lower = s.toLowerCase();
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const keyword of sorted) {
    const k = keyword.toLowerCase();
    if (!k || !lower.startsWith(k)) continue;
    const last = k[k.length - 1];
    const next = lower.charAt(k.length);
    if (ASCII_WORD_CHAR.test(last) && next !== "" && ASCII_WORD_CHAR.test(next)) continue;
    return { keyword, rest: s.slice(k.length).trim() };
  }
  return null;
}

export function hasDigit(text: string): boolean {
  return /[0-9๐-๙]/.test(text);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line-text.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-text.ts lib/line-text.test.ts
git commit -m "feat(line): text helpers for polite prefix, keyword match, digits" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `lib/line-date.ts` — timezone, `extractDate`, day math

**Files:**
- Create: `lib/line-date.ts`
- Test: `lib/line-date.test.ts`

**Interfaces:**
- Consumes: `Trip` type from `@/lib/models/types` (type-only)
- Produces:
  - `interface TripDateCtx { start: string; end: string; today: string }` (ISO `yyyy-mm-dd`)
  - `todayInTz(tz: string, now: Date): string`. An empty or invalid `tz` falls back to `"Asia/Bangkok"`.
  - `nowHHMMInTz(tz: string, now: Date): string` (`"13:18"`, 24h)
  - `extractDate(text: string, ctx: TripDateCtx): { date: string | null; rest: string; outOfRange: boolean }`
  - `tripDayIndex(date: string, start: string): number` (start → 1)
  - `addDays(date: string, n: number): string`
  - `thaiDateLabel(date: string): string` (`"พฤ 19 พ.ย."`)
  - `tripDateCtx(trip: Pick<Trip, "start_date" | "end_date" | "trip_timezone">, now: Date): TripDateCtx` (extra helper used by dispatch and features)

Test calendar facts: 2026-11-19 is a Thursday, 2026-11-20 a Friday, 2026-11-24 a Tuesday.

- [ ] **Step 1: Write the failing tests**

Create `lib/line-date.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  todayInTz,
  nowHHMMInTz,
  extractDate,
  tripDayIndex,
  addDays,
  thaiDateLabel,
  tripDateCtx,
  type TripDateCtx,
} from "./line-date";

// Thu 19 Nov 2026 .. Tue 24 Nov 2026, "today" = Fri 20 Nov.
const CTX: TripDateCtx = { start: "2026-11-19", end: "2026-11-24", today: "2026-11-20" };
// Trip that crosses New Year.
const NY: TripDateCtx = { start: "2026-12-28", end: "2027-01-03", today: "2026-12-30" };

describe("todayInTz / nowHHMMInTz", () => {
  it("Asia/Hong_Kong at 23:30 UTC is already the next day", () => {
    const now = new Date("2026-11-19T23:30:00Z");
    expect(todayInTz("Asia/Hong_Kong", now)).toBe("2026-11-20");
    expect(nowHHMMInTz("Asia/Hong_Kong", now)).toBe("07:30");
  });

  it("empty tz falls back to Asia/Bangkok", () => {
    const now = new Date("2026-11-19T16:30:00Z"); // HK 00:30 on the 20th, BKK 23:30 on the 19th
    expect(todayInTz("Asia/Hong_Kong", now)).toBe("2026-11-20");
    expect(todayInTz("", now)).toBe("2026-11-19");
    expect(nowHHMMInTz("Asia/Hong_Kong", now)).toBe("00:30");
    expect(nowHHMMInTz("", now)).toBe("23:30");
  });

  it("an invalid tz falls back to Asia/Bangkok instead of throwing", () => {
    const now = new Date("2026-11-19T16:30:00Z");
    expect(todayInTz("Not/AZone", now)).toBe("2026-11-19");
  });

  it("midnight renders as 00, never 24", () => {
    expect(nowHHMMInTz("Asia/Hong_Kong", new Date("2026-11-19T16:05:00Z"))).toBe("00:05");
  });
});

describe("extractDate: relative words", () => {
  it.each([
    ["วันนี้", "2026-11-20"],
    ["พรุ่งนี้", "2026-11-21"],
    ["มะรืน", "2026-11-22"],
    ["มะรืนนี้", "2026-11-22"],
    ["เมื่อวาน", "2026-11-19"],
    ["เมื่อวานนี้", "2026-11-19"],
  ])("%s -> %s", (word, date) => {
    expect(extractDate(word, CTX)).toEqual({ date, rest: "", outOfRange: false });
  });

  it("removes the token from the middle and keeps the rest", () => {
    expect(extractDate("ร้าน พรุ่งนี้ มงก๊ก", CTX)).toEqual({ date: "2026-11-21", rest: "ร้าน มงก๊ก", outOfRange: false });
  });
});

describe("extractDate: numeric d/m", () => {
  it("d/m uses the trip year", () => {
    expect(extractDate("21/11", CTX)).toEqual({ date: "2026-11-21", rest: "", outOfRange: false });
  });

  it("d/m/yyyy uses the given year", () => {
    expect(extractDate("21/11/2026", CTX).date).toBe("2026-11-21");
  });

  it("a Buddhist-era year is converted", () => {
    expect(extractDate("21/11/2569", CTX).date).toBe("2026-11-21");
  });

  it("a year outside 2000-2699 is not a year (and not a d/m date)", () => {
    expect(extractDate("21/11/1500", CTX).date).toBeNull();
  });

  it("flags a date outside the trip", () => {
    expect(extractDate("1/12", CTX)).toEqual({ date: "2026-12-01", rest: "", outOfRange: true });
  });

  it("an impossible date is not a date token", () => {
    expect(extractDate("31/2", CTX)).toEqual({ date: null, rest: "31/2", outOfRange: false });
  });

  it("accepts a leading วันที่", () => {
    expect(extractDate("วันที่ 21/11", CTX)).toEqual({ date: "2026-11-21", rest: "", outOfRange: false });
  });
});

describe("extractDate: day + month name", () => {
  it.each([
    ["20 พ.ย.", "2026-11-20"],
    ["20 พย", "2026-11-20"],
    ["22พ.ย.", "2026-11-22"],
    ["22 พฤศจิกายน", "2026-11-22"],
    ["20 nov", "2026-11-20"],
    ["20 November", "2026-11-20"],
    ["วันที่ 20 พ.ย.", "2026-11-20"],
  ])("%s -> %s", (text, date) => {
    expect(extractDate(text, CTX)).toEqual({ date, rest: "", outOfRange: false });
  });

  it("keeps the words around the token", () => {
    expect(extractDate("plan 20 nov 2", CTX)).toEqual({ date: "2026-11-20", rest: "plan 2", outOfRange: false });
  });

  it("accepts a CE or BE year after the month", () => {
    expect(extractDate("20 พ.ย. 2026", CTX)).toEqual({ date: "2026-11-20", rest: "", outOfRange: false });
    expect(extractDate("20 พ.ย. 2569", CTX)).toEqual({ date: "2026-11-20", rest: "", outOfRange: false });
  });

  it("does not take an amount as the year", () => {
    expect(extractDate("ตั๋ว 20 พ.ย. 1500", CTX)).toEqual({ date: "2026-11-20", rest: "ตั๋ว 1500", outOfRange: false });
  });

  it("does not match a Thai month abbreviation inside a Thai word", () => {
    expect(extractDate("3 มีคน", CTX)).toEqual({ date: null, rest: "3 มีคน", outOfRange: false });
    expect(extractDate("3 พยาบาล", CTX)).toEqual({ date: null, rest: "3 พยาบาล", outOfRange: false });
  });
});

describe("extractDate: trip day N", () => {
  it("วันที่ 3 is the third day of the trip", () => {
    expect(extractDate("วันที่ 3", CTX)).toEqual({ date: "2026-11-21", rest: "", outOfRange: false });
  });

  it("day 3 (English) works too", () => {
    expect(extractDate("day 3", CTX).date).toBe("2026-11-21");
  });

  it("a day number past the trip is out of range", () => {
    expect(extractDate("วันที่ 10", CTX)).toEqual({ date: "2026-11-28", rest: "", outOfRange: true });
  });

  it("'monday' is a weekday, not a 'day' token", () => {
    expect(extractDate("monday", CTX).date).toBe("2026-11-23");
  });
});

describe("extractDate: weekday names", () => {
  it("picks the first matching day on/after today inside the trip", () => {
    expect(extractDate("ศุกร์", CTX).date).toBe("2026-11-20");
    expect(extractDate("วันจันทร์", CTX)).toEqual({ date: "2026-11-23", rest: "", outOfRange: false });
    expect(extractDate("mon", CTX).date).toBe("2026-11-23");
    expect(extractDate("Sunday", CTX).date).toBe("2026-11-22");
  });

  it("falls back to the first matching trip day before today", () => {
    expect(extractDate("พฤหัส", CTX)).toEqual({ date: "2026-11-19", rest: "", outOfRange: false });
  });

  it("a weekday the trip never hits is out of range", () => {
    expect(extractDate("วันพุธ", CTX)).toEqual({ date: "2026-11-25", rest: "", outOfRange: true });
  });
});

describe("extractDate: year inference across New Year", () => {
  it("January dates land in the end year", () => {
    expect(extractDate("2/1", NY).date).toBe("2027-01-02");
    expect(extractDate("2 ม.ค.", NY).date).toBe("2027-01-02");
  });

  it("December dates stay in the start year", () => {
    expect(extractDate("30/12", NY).date).toBe("2026-12-30");
  });
});

describe("extractDate: first token wins / no token", () => {
  it("returns the earliest token and leaves later ones in rest", () => {
    expect(extractDate("พรุ่งนี้ 21/11", CTX)).toEqual({ date: "2026-11-21", rest: "21/11", outOfRange: false });
  });

  it("no token -> date null, rest is the cleaned text", () => {
    expect(extractDate("  ข้าวมันไก่   120 ", CTX)).toEqual({ date: null, rest: "ข้าวมันไก่ 120", outOfRange: false });
    expect(extractDate("รถ 50", CTX).date).toBeNull();
  });
});

describe("day math and labels", () => {
  it("tripDayIndex counts from 1", () => {
    expect(tripDayIndex("2026-11-19", "2026-11-19")).toBe(1);
    expect(tripDayIndex("2026-11-21", "2026-11-19")).toBe(3);
  });

  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("thaiDateLabel uses a short weekday and month", () => {
    expect(thaiDateLabel("2026-11-19")).toBe("พฤ 19 พ.ย.");
    expect(thaiDateLabel("2026-11-20")).toBe("ศ 20 พ.ย.");
  });

  it("tripDateCtx uses the trip timezone for today", () => {
    const ctx = tripDateCtx({ start_date: "2026-11-19", end_date: "2026-11-24", trip_timezone: "Asia/Hong_Kong" }, new Date("2026-11-19T16:30:00Z"));
    expect(ctx).toEqual({ start: "2026-11-19", end: "2026-11-24", today: "2026-11-20" });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line-date.test.ts`
Expected: FAIL, with `Failed to resolve import "./line-date"`.

- [ ] **Step 3: Implement**

Create `lib/line-date.ts`:

```ts
import type { Trip } from "@/lib/models/types";

// Date parsing for LINE commands ("แพลน พรุ่งนี้", "จอง 21/11", ...). Pure:
// every function takes `now` / the trip window explicitly.

export interface TripDateCtx { start: string; end: string; today: string } // ISO yyyy-mm-dd

const DEFAULT_TZ = "Asia/Bangkok";
const DAY_MS = 86_400_000;

function tzParts(tz: string, now: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz || DEFAULT_TZ, ...opts });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TZ, ...opts });
  }
  return Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
}

export function todayInTz(tz: string, now: Date): string {
  const p = tzParts(tz, now, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

export function nowHHMMInTz(tz: string, now: Date): string {
  const p = tzParts(tz, now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${hour}:${p.minute}`;
}

function toUTC(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUTC(toUTC(date) + n * DAY_MS);
}

export function tripDayIndex(date: string, start: string): number {
  return Math.round((toUTC(date) - toUTC(start)) / DAY_MS) + 1;
}

function weekday(date: string): number {
  return new Date(toUTC(date)).getUTCDay();
}

// Validated y/m/d -> ISO; null for impossible dates like 31/2.
function isoOf(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return fromUTC(dt.getTime());
}

const THAI_DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const THAI_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_MONTH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const EN_MONTH_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function thaiDateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${THAI_DOW_SHORT[weekday(date)]} ${d} ${THAI_MONTH_SHORT[m - 1]}`;
}

export function tripDateCtx(trip: Pick<Trip, "start_date" | "end_date" | "trip_timezone">, now: Date): TripDateCtx {
  return { start: trip.start_date, end: trip.end_date, today: todayInTz(trip.trip_timezone, now) };
}

// ---- month words ---------------------------------------------------------

// word (lowercase, dots removed) -> month 1..12
const MONTH_LOOKUP: Record<string, number> = {};
THAI_MONTH_FULL.forEach((w, i) => (MONTH_LOOKUP[w] = i + 1));
THAI_MONTH_SHORT.forEach((w, i) => (MONTH_LOOKUP[w.replace(/\./g, "")] = i + 1));
EN_MONTH_FULL.forEach((w, i) => {
  MONTH_LOOKUP[w] = i + 1;
  MONTH_LOOKUP[w.slice(0, 3)] = i + 1;
});
MONTH_LOOKUP["sept"] = 9;

function monthFromWord(word: string): number | null {
  return MONTH_LOOKUP[word.toLowerCase().replace(/[.\s]/g, "")] ?? null;
}

// "พ.ย." -> "พ\.?ย\.?" so "พย", "พ.ย", "พ.ย." all match.
const THAI_ABBR_PATTERNS = THAI_MONTH_SHORT.map((a) => a.split(".").filter(Boolean).join("\\.?") + "\\.?");
const EN_MONTH_WORDS = [...EN_MONTH_FULL, "sept", ...EN_MONTH_FULL.map((w) => w.slice(0, 3))];
// Each alternative carries its own "not followed by a letter" guard, so
// "3 มีคน" / "3 พยาบาล" / "3 marchers" aren't dates.
const MONTH_ALT = [
  ...[...THAI_MONTH_FULL, ...THAI_ABBR_PATTERNS].map((w) => `${w}(?![ก-๙])`),
  ...EN_MONTH_WORDS.map((w) => `${w}(?![a-z])`),
]
  .sort((a, b) => b.length - a.length)
  .join("|");

// ---- token patterns (no "g" flag: exec() always returns the first match) --

const RELATIVE_OFFSET: Record<string, number> = {
  "เมื่อวานนี้": -1,
  "เมื่อวาน": -1,
  "มะรืนนี้": 2,
  "มะรืน": 2,
  "พรุ่งนี้": 1,
  "วันนี้": 0,
};
const RELATIVE_RE = new RegExp(`(${Object.keys(RELATIVE_OFFSET).sort((a, b) => b.length - a.length).join("|")})`);
// Explicit years are 2000-2699 only (CE, or BE 2400-2699), so an amount like
// "1500" after a date is never swallowed as the year.
const YEAR = "(2[0-6]\\d\\d)";
const DMY_RE = new RegExp(`(?<![\\d/])(?:วันที่\\s*)?(\\d{1,2})/(\\d{1,2})(?:/${YEAR})?(?![\\d/])`);
const D_MONTH_RE = new RegExp(`(?<![\\d/])(?:วันที่\\s*)?(\\d{1,2})\\s*(${MONTH_ALT})(?:\\s*${YEAR}(?!\\d))?`, "i");
const TRIP_DAY_RE = new RegExp("(?:วันที่|(?<![a-z])day)\\s*(\\d{1,2})(?![\\d/])", "i");

const THAI_DOW: Record<string, number> = {
  "อาทิตย์": 0, "จันทร์": 1, "อังคาร": 2, "พุธ": 3, "พฤหัสบดี": 4, "พฤหัส": 4, "ศุกร์": 5, "เสาร์": 6,
};
const EN_DOW: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const byLengthDesc = (o: Record<string, number>) => Object.keys(o).sort((a, b) => b.length - a.length).join("|");
const THAI_DOW_RE = new RegExp(`(?:วัน)?(${byLengthDesc(THAI_DOW)})`);
const EN_DOW_RE = new RegExp(`(?<![a-z])(${byLengthDesc(EN_DOW)})(?![a-z])`, "i");

function yearFor(explicit: string | undefined, month: number, ctx: TripDateCtx): number {
  if (explicit) {
    const y = Number(explicit);
    return y >= 2400 ? y - 543 : y; // Buddhist era (regex only admits 2000-2699)
  }
  const startYear = Number(ctx.start.slice(0, 4));
  const startMonth = Number(ctx.start.slice(5, 7));
  const endYear = Number(ctx.end.slice(0, 4));
  return endYear > startYear && month < startMonth ? endYear : startYear;
}

// First trip day >= today with that weekday; else first trip day with it;
// else (trip never hits that weekday) the next one from today -> out of range.
function resolveWeekday(target: number, ctx: TripDateCtx): string {
  const from = ctx.today > ctx.start ? ctx.today : ctx.start;
  for (let d = from; d <= ctx.end; d = addDays(d, 1)) if (weekday(d) === target) return d;
  for (let d = ctx.start; d <= ctx.end; d = addDays(d, 1)) if (weekday(d) === target) return d;
  let d = ctx.today;
  while (weekday(d) !== target) d = addDays(d, 1);
  return d;
}

interface Hit { index: number; length: number; date: string }

function firstHit(re: RegExp, text: string, resolve: (m: RegExpExecArray) => string | null): Hit | null {
  const m = re.exec(text);
  if (!m) return null;
  const date = resolve(m);
  return date ? { index: m.index, length: m[0].length, date } : null;
}

export function extractDate(text: string, ctx: TripDateCtx): { date: string | null; rest: string; outOfRange: boolean } {
  const clean = text.replace(/\s+/g, " ").trim();
  const hits = [
    firstHit(RELATIVE_RE, clean, (m) => addDays(ctx.today, RELATIVE_OFFSET[m[1]])),
    firstHit(DMY_RE, clean, (m) => {
      const month = Number(m[2]);
      return isoOf(yearFor(m[3], month, ctx), month, Number(m[1]));
    }),
    firstHit(D_MONTH_RE, clean, (m) => {
      const month = monthFromWord(m[2]);
      return month ? isoOf(yearFor(m[3], month, ctx), month, Number(m[1])) : null;
    }),
    firstHit(TRIP_DAY_RE, clean, (m) => addDays(ctx.start, Number(m[1]) - 1)),
    firstHit(THAI_DOW_RE, clean, (m) => resolveWeekday(THAI_DOW[m[1]], ctx)),
    firstHit(EN_DOW_RE, clean, (m) => resolveWeekday(EN_DOW[m[1].toLowerCase()], ctx)),
  ]
    .filter((h): h is Hit => h !== null)
    // earliest token wins; on a tie the longer one ("วันที่ 20 พ.ย." beats "วันที่ 20")
    .sort((a, b) => a.index - b.index || b.length - a.length);

  const hit = hits[0];
  if (!hit) return { date: null, rest: clean, outOfRange: false };
  const rest = `${clean.slice(0, hit.index)} ${clean.slice(hit.index + hit.length)}`.replace(/\s+/g, " ").trim();
  return { date: hit.date, rest, outOfRange: hit.date < ctx.start || hit.date > ctx.end };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line-date.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-date.ts lib/line-date.test.ts
git commit -m "feat(line): date helpers with timezone today/now and extractDate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `lib/line-flex.ts` — Flex primitives, postback, album, messages

**Files:**
- Create: `lib/line-flex.ts`
- Test: `lib/line-flex.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces (exact spec signatures):
  - `CLAY` (const color map), `type FlexNode = Record<string, unknown>`
  - `txt(text: string | null | undefined, opts?: Record<string, unknown>): FlexNode | null`. Returns `null` for empty or whitespace text. Defaults to `wrap: true`.
  - `compact<T>(nodes: (T | null | undefined | false)[]): T[]`
  - `encodePostback(data: Record<string, string | number | undefined>): string`. Writes `k=v&k=v` and escapes only `%` `&` `=` `+` (to `%25` `%26` `%3D` `%2B`); Thai, spaces and everything else stay raw. Skips `undefined`, and if the result is still over 300 chars it shortens `q` as a last resort.
  - `decodePostback(data: string): Record<string, string>`, the exact inverse. Do not use URLSearchParams.
  - `postbackAction(label, data, displayText?)`, `uriAction(label, uri)`, `clipboardAction(label, text)`, each returning `FlexNode`
  - `imageUrl(origin: string, photoId: string): string`
  - `buildPhotoAlbum(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode`. Returns a carousel of ≤ 12 bubbles. For N > 12 it shows 11 photos plus a bubble reading "ดูอีก {N-11} รูปในแอป". Zero photos gives one "ยังไม่มีรูป" bubble.
  - `flexMessage(altText: string, contents: FlexNode, quickReply?: FlexNode): FlexNode`
  - `textMessage(text: string, quickReply?: FlexNode): FlexNode`
  - `quickReply(items: { label: string; data?: Record<string, string | number | undefined>; text?: string }[]): FlexNode`. Keeps ≤ 13 items and clips each label to 20 chars. Items with `data` become postback actions (`displayText = text ?? label`); the rest become message actions (`text ?? label`).

- [ ] **Step 1: Write the failing tests**

Create `lib/line-flex.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CLAY,
  txt,
  compact,
  encodePostback,
  decodePostback,
  postbackAction,
  uriAction,
  clipboardAction,
  imageUrl,
  buildPhotoAlbum,
  flexMessage,
  textMessage,
  quickReply,
  type FlexNode,
} from "./line-flex";

describe("txt / compact", () => {
  it("returns null for empty or whitespace text (Flex rejects text: \"\")", () => {
    expect(txt("")).toBeNull();
    expect(txt("   ")).toBeNull();
    expect(txt(null)).toBeNull();
    expect(txt(undefined)).toBeNull();
  });

  it("builds a wrapping text node and merges options", () => {
    expect(txt("สวัสดี", { size: "sm", color: CLAY.ink })).toEqual({ type: "text", text: "สวัสดี", wrap: true, size: "sm", color: "#5B4636" });
  });

  it("compact drops null/undefined/false", () => {
    expect(compact([txt("a"), null, undefined, false, txt("")])).toEqual([{ type: "text", text: "a", wrap: true }]);
  });
});

describe("encodePostback / decodePostback", () => {
  it("round-trips and skips undefined values", () => {
    const encoded = encodePostback({ a: "bk_open", id: "b1", n: 3, skip: undefined });
    expect(encoded).not.toContain("skip");
    expect(decodePostback(encoded)).toEqual({ a: "bk_open", id: "b1", n: "3" });
  });

  it("round-trips Thai text and special characters", () => {
    const data = { a: "amb_go", t: "booking", q: "ตั๋วรถ 50 & อื่นๆ=? 1+1 100% %3D" };
    expect(decodePostback(encodePostback(data))).toEqual(data);
  });

  it("escapes only % & = + and leaves Thai raw", () => {
    expect(encodePostback({ a: "amb_expense", q: "ข้าว 50+20 & น้ำ=10 100%" })).toBe("a=amb_expense&q=ข้าว 50%2B20 %26 น้ำ%3D10 100%25");
  });

  it("keeps a 40-char Thai message ending in an amount intact", () => {
    const q = "ค่าตั๋วรถไฟความเร็วสูงไปเซินเจิ้นสองคน 120";
    expect(Array.from(q).length).toBeGreaterThanOrEqual(40);
    const encoded = encodePostback({ a: "amb_expense", q });
    expect(encoded.length).toBeLessThanOrEqual(300);
    expect(decodePostback(encoded)).toEqual({ a: "amb_expense", q });
  });

  it("shortens q (last resort) so the data stays within 300 characters", () => {
    const longQ = "ตั๋วรถไฟความเร็วสูง".repeat(20); // 380 chars
    const encoded = encodePostback({ a: "amb_expense", q: longQ });
    expect(encoded.length).toBeLessThanOrEqual(300);
    const decoded = decodePostback(encoded);
    expect(decoded.a).toBe("amb_expense");
    expect(decoded.q.length).toBeGreaterThan(0);
    expect(longQ.startsWith(decoded.q)).toBe(true);
  });

  it("leaves short data untouched", () => {
    expect(encodePostback({ a: "menu" })).toBe("a=menu");
  });
});

describe("actions", () => {
  it("postbackAction encodes data and only sets displayText when given", () => {
    expect(postbackAction("ดู", { a: "plan_day", d: "2026-11-20" })).toEqual({ type: "postback", label: "ดู", data: "a=plan_day&d=2026-11-20" });
    expect(postbackAction("ดู", { a: "menu" }, "เมนู")).toEqual({ type: "postback", label: "ดู", data: "a=menu", displayText: "เมนู" });
  });

  it("uriAction and clipboardAction", () => {
    expect(uriAction("เปิด", "https://x.test")).toEqual({ type: "uri", label: "เปิด", uri: "https://x.test" });
    expect(clipboardAction("📋 คัดลอก", "ABC123")).toEqual({ type: "clipboard", label: "📋 คัดลอก", clipboardText: "ABC123" });
  });

  it("imageUrl encodes the id", () => {
    expect(imageUrl("https://app.test", "a/b c")).toBe("https://app.test/api/img/a%2Fb%20c");
  });
});

describe("buildPhotoAlbum", () => {
  const base = { origin: "https://app.test", title: "ร้าน A", moreUrl: "https://app.test/trips/t1/places" };
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const bubbles = (album: FlexNode) => album.contents as FlexNode[];

  it("one bubble per photo, hero taps open the full image", () => {
    const album = buildPhotoAlbum({ ...base, photoIds: ids(3) });
    expect(album.type).toBe("carousel");
    expect(bubbles(album)).toHaveLength(3);
    const hero = bubbles(album)[0].hero as FlexNode;
    expect(hero.url).toBe("https://app.test/api/img/p1");
    expect((hero.action as FlexNode).uri).toBe("https://app.test/api/img/p1");
  });

  it("exactly 12 photos -> 12 photo bubbles, no 'more' bubble", () => {
    const album = buildPhotoAlbum({ ...base, photoIds: ids(12) });
    expect(bubbles(album)).toHaveLength(12);
    expect(JSON.stringify(album)).not.toContain("ดูอีก");
  });

  it("more than 12 -> 11 photos + a 'more in app' bubble", () => {
    const album = buildPhotoAlbum({ ...base, photoIds: ids(15) });
    const list = bubbles(album);
    expect(list).toHaveLength(12);
    expect(list.slice(0, 11).every((b) => b.hero)).toBe(true);
    const last = JSON.stringify(list[11]);
    expect(last).toContain("ดูอีก 4 รูปในแอป");
    expect(last).toContain(base.moreUrl);
  });

  it("no photos -> a single placeholder bubble", () => {
    const album = buildPhotoAlbum({ ...base, photoIds: [] });
    expect(bubbles(album)).toHaveLength(1);
    expect(JSON.stringify(album)).toContain("ยังไม่มีรูป");
  });

  it("never emits an empty text node", () => {
    const album = buildPhotoAlbum({ ...base, title: "", photoIds: ids(13) });
    expect(JSON.stringify(album)).not.toContain('"text":""');
  });
});

describe("messages", () => {
  it("flexMessage clips altText to 400 and attaches quickReply only when given", () => {
    const msg = flexMessage("ก".repeat(500), { type: "bubble" });
    expect(msg.type).toBe("flex");
    expect((msg.altText as string).length).toBe(400);
    expect("quickReply" in msg).toBe(false);
    const qr = quickReply([{ label: "x" }]);
    expect(flexMessage("alt", { type: "bubble" }, qr).quickReply).toBe(qr);
  });

  it("flexMessage never sends an empty altText", () => {
    expect(flexMessage("  ", { type: "bubble" }).altText).toBe("TravelAss");
  });

  it("textMessage", () => {
    expect(textMessage("hi")).toEqual({ type: "text", text: "hi" });
    const qr = quickReply([{ label: "x" }]);
    expect(textMessage("hi", qr)).toEqual({ type: "text", text: "hi", quickReply: qr });
  });
});

describe("quickReply", () => {
  it("caps at 13 items", () => {
    const qr = quickReply(Array.from({ length: 20 }, (_, i) => ({ label: `n${i}` })));
    expect((qr.items as unknown[]).length).toBe(13);
  });

  it("clips labels to 20 characters", () => {
    const qr = quickReply([{ label: "123456789012345678901234" }]);
    const action = (qr.items as FlexNode[])[0].action as FlexNode;
    expect(action.label).toBe("12345678901234567890");
  });

  it("data -> postback action, otherwise message action", () => {
    const qr = quickReply([
      { label: "💸 บันทึก", data: { a: "amb_expense", q: "ตั๋ว 50" } },
      { label: "ข้าม" },
      { label: "เก่ง", text: "ชื่อ เก่ง" },
    ]);
    const actions = (qr.items as FlexNode[]).map((i) => i.action as FlexNode);
    expect(actions[0]).toEqual({ type: "postback", label: "💸 บันทึก", data: encodePostback({ a: "amb_expense", q: "ตั๋ว 50" }), displayText: "💸 บันทึก" });
    expect(actions[1]).toEqual({ type: "message", label: "ข้าม", text: "ข้าม" });
    expect(actions[2]).toEqual({ type: "message", label: "เก่ง", text: "ชื่อ เก่ง" });
    expect((qr.items as FlexNode[]).every((i) => i.type === "action")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line-flex.test.ts`
Expected: FAIL, with `Failed to resolve import "./line-flex"`.

- [ ] **Step 3: Implement**

Create `lib/line-flex.ts`:

```ts
// Flex Message building blocks shared by every LINE feature. Pure.
// Flex has no box-shadow, so the "clay" look is a cream base + white cards +
// big radii (same palette as the existing slip confirmation card).

export const CLAY = {
  cream: "#FFF3E8", card: "#FFFFFF", coral: "#F97362", peach: "#F5B78F",
  ink: "#5B4636", muted: "#8A7968", line: "#EADBCB",
  doneBg: "#E6F4EA", doneInk: "#2E7D4F", nextBg: "#E3F0FB", nextInk: "#1E5FA8", grayInk: "#A89A8C",
} as const;

export type FlexNode = Record<string, unknown>;

const POSTBACK_MAX = 300;
const ALT_TEXT_MAX = 400;
const TEXT_MAX = 5000;
const CLIPBOARD_MAX = 1000;
const QUICK_REPLY_MAX = 13;
const QUICK_REPLY_LABEL_MAX = 20;
const ALBUM_MAX = 12;

// Clip by code point so a Thai/emoji character is never cut in half.
function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("") : s;
}

export function txt(text: string | null | undefined, opts: Record<string, unknown> = {}): FlexNode | null {
  if (text == null || text.trim() === "") return null;
  return { type: "text", text, wrap: true, ...opts };
}

export function compact<T>(nodes: (T | null | undefined | false)[]): T[] {
  return nodes.filter((n): n is T => n !== null && n !== undefined && n !== false);
}

// Minimal escaping on purpose: URLSearchParams turns every Thai character
// into 9 chars ("%E0%B8%81"), which would blow the 300-char budget after
// ~30 Thai letters and cut off the amount at the end of "ตั๋วรถ ... 120".
// Only the four characters that mean something to this format are escaped.
function escapePart(s: string): string {
  return s.replace(/[%&=+]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function unescapePart(s: string): string {
  return s.replace(/%(25|26|3D|2B)/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

// LINE caps postback data at 300 chars. Only `q` (free text echoed back,
// e.g. the original message in an ambiguity question) is ever long, so
// that's the field that gets shortened -- as a last resort.
export function encodePostback(data: Record<string, string | number | undefined>): string {
  const entries: [string, string][] = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)]);
  const build = () => entries.map(([k, v]) => `${escapePart(k)}=${escapePart(v)}`).join("&");
  let out = build();
  const qi = entries.findIndex(([k]) => k === "q");
  if (out.length <= POSTBACK_MAX || qi === -1) return out;
  let chars = Array.from(entries[qi][1]);
  while (out.length > POSTBACK_MAX && chars.length > 0) {
    chars = chars.slice(0, -1);
    entries[qi] = ["q", chars.join("")];
    out = build();
  }
  return out;
}

export function decodePostback(data: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of data.split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const key = unescapePart(i === -1 ? pair : pair.slice(0, i));
    out[key] = i === -1 ? "" : unescapePart(pair.slice(i + 1));
  }
  return out;
}

export function postbackAction(label: string, data: Record<string, string | number | undefined>, displayText?: string): FlexNode {
  return { type: "postback", label, data: encodePostback(data), ...(displayText ? { displayText } : {}) };
}

export function uriAction(label: string, uri: string): FlexNode {
  return { type: "uri", label, uri };
}

export function clipboardAction(label: string, text: string): FlexNode {
  return { type: "clipboard", label, clipboardText: clip(text, CLIPBOARD_MAX) };
}

export function imageUrl(origin: string, photoId: string): string {
  return `${origin}/api/img/${encodeURIComponent(photoId)}`;
}

function photoBubble(url: string, caption: string): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    hero: { type: "image", url, size: "full", aspectRatio: "1:1", aspectMode: "cover", action: uriAction("ดูรูป", url) },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      backgroundColor: CLAY.cream,
      contents: compact([txt(caption, { size: "xs", color: CLAY.muted, align: "center" })]),
    },
  };
}

function moreBubble(message: string, moreUrl: string): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    action: uriAction("เปิดแอป", moreUrl),
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      paddingAll: "20px",
      backgroundColor: CLAY.cream,
      contents: compact([txt(message, { weight: "bold", color: CLAY.ink, align: "center" })]),
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "button", style: "primary", color: CLAY.peach, height: "sm", action: uriAction("เปิดแอป", moreUrl) }],
    },
  };
}

export function buildPhotoAlbum(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode {
  const n = p.photoIds.length;
  if (n === 0) return { type: "carousel", contents: [moreBubble("ยังไม่มีรูป", p.moreUrl)] };
  const shown = n > ALBUM_MAX ? p.photoIds.slice(0, ALBUM_MAX - 1) : p.photoIds;
  const bubbles = shown.map((id, i) => photoBubble(imageUrl(p.origin, id), `${p.title} ${i + 1}/${n}`.trim()));
  if (n > ALBUM_MAX) bubbles.push(moreBubble(`ดูอีก ${n - (ALBUM_MAX - 1)} รูปในแอป`, p.moreUrl));
  return { type: "carousel", contents: bubbles };
}

export function flexMessage(altText: string, contents: FlexNode, quickReply?: FlexNode): FlexNode {
  return {
    type: "flex",
    altText: clip(altText.trim() || "TravelAss", ALT_TEXT_MAX),
    contents,
    ...(quickReply ? { quickReply } : {}),
  };
}

export function textMessage(text: string, quickReply?: FlexNode): FlexNode {
  return { type: "text", text: clip(text, TEXT_MAX), ...(quickReply ? { quickReply } : {}) };
}

export function quickReply(items: { label: string; data?: Record<string, string | number | undefined>; text?: string }[]): FlexNode {
  return {
    items: items.slice(0, QUICK_REPLY_MAX).map((it) => {
      const label = clip(it.label, QUICK_REPLY_LABEL_MAX);
      const action = it.data
        ? { type: "postback", label, data: encodePostback(it.data), displayText: it.text ?? it.label }
        : { type: "message", label, text: it.text ?? it.label };
      return { type: "action", action };
    }),
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line-flex.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-flex.ts lib/line-flex.test.ts
git commit -m "feat(line): flex primitives, postback codec, photo album, quick reply" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `lib/line-maps.ts` — Google Maps + Amap buttons

**Files:**
- Create: `lib/line-maps.ts`
- Test: `lib/line-maps.test.ts`

**Interfaces:**
- Consumes: `uriAction`, `type FlexNode` from `@/lib/line-flex`
- Produces:
  - `googleSearchUrl(query: string): string`. Returns `https://www.google.com/maps/search/?api=1&query=…`.
  - `googleDirUrl(destination: string, travelmode: "transit" | "driving" | "walking"): string`. Returns `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=…` with no origin, so Maps uses the current location.
  - `amapSearchUrl(query: string): string`. Returns `https://uri.amap.com/search?keyword=…`.
  - `toTravelMode(mode: string): "transit" | "driving" | "walking"` (extra export)
  - `mapButtons(p: { query: string; mapsLink?: string; directions?: { mode: string } }): FlexNode[]`. Returns `[Google, 高德 Amap]` button nodes, or `[]` when there is neither query nor mapsLink. When present, `mapsLink` is used for the Google button. With no query, only the Google button is returned.

- [ ] **Step 1: Write the failing tests**

Create `lib/line-maps.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapButtons, googleSearchUrl, googleDirUrl, amapSearchUrl, toTravelMode } from "./line-maps";
import type { FlexNode } from "./line-flex";

const uriOf = (b: FlexNode) => (b.action as FlexNode).uri as string;
const labelOf = (b: FlexNode) => (b.action as FlexNode).label as string;

describe("URL builders", () => {
  it("encodes Chinese place names", () => {
    const enc = encodeURIComponent("迪士尼");
    expect(googleSearchUrl("迪士尼")).toBe(`https://www.google.com/maps/search/?api=1&query=${enc}`);
    expect(amapSearchUrl("迪士尼")).toBe(`https://uri.amap.com/search?keyword=${enc}`);
    expect(amapSearchUrl("迪士尼")).not.toContain("迪");
  });

  it("Google directions has a destination and travel mode but no origin", () => {
    const url = googleDirUrl("Hong Kong Disneyland", "transit");
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=Hong%20Kong%20Disneyland&travelmode=transit");
    expect(url).not.toContain("origin");
  });
});

describe("toTravelMode", () => {
  it("maps free-text transport modes", () => {
    expect(toTravelMode("เดิน")).toBe("walking");
    expect(toTravelMode("Walk")).toBe("walking");
    expect(toTravelMode("แท็กซี่")).toBe("driving");
    expect(toTravelMode("Taxi")).toBe("driving");
    expect(toTravelMode("รถไฟ MTR")).toBe("transit");
    expect(toTravelMode("")).toBe("transit");
  });
});

describe("mapButtons", () => {
  it("returns [] with neither query nor mapsLink", () => {
    expect(mapButtons({ query: "  " })).toEqual([]);
    expect(mapButtons({ query: "", mapsLink: "" })).toEqual([]);
  });

  it("returns Google + Amap search buttons for a query", () => {
    const buttons = mapButtons({ query: "Mong Kok" });
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.type === "button")).toBe(true);
    expect(labelOf(buttons[0])).toBe("Google Maps");
    expect(uriOf(buttons[0])).toBe(googleSearchUrl("Mong Kok"));
    expect(labelOf(buttons[1])).toBe("高德 Amap");
    expect(uriOf(buttons[1])).toBe(amapSearchUrl("Mong Kok"));
  });

  it("prefers the saved mapsLink for the Google button", () => {
    const buttons = mapButtons({ query: "Mong Kok", mapsLink: "https://maps.app.goo.gl/abc" });
    expect(uriOf(buttons[0])).toBe("https://maps.app.goo.gl/abc");
    expect(uriOf(buttons[1])).toBe(amapSearchUrl("Mong Kok"));
  });

  it("mapsLink wins even in directions mode", () => {
    const buttons = mapButtons({ query: "迪士尼", mapsLink: "https://maps.app.goo.gl/abc", directions: { mode: "รถไฟ" } });
    expect(uriOf(buttons[0])).toBe("https://maps.app.goo.gl/abc");
  });

  it("directions mode uses a Google directions URL", () => {
    const buttons = mapButtons({ query: "迪士尼", directions: { mode: "รถไฟ" } });
    expect(labelOf(buttons[0])).toBe("Google Maps นำทาง");
    expect(uriOf(buttons[0])).toBe(googleDirUrl("迪士尼", "transit"));
  });

  it("mapsLink without a query -> Google button only", () => {
    const buttons = mapButtons({ query: "", mapsLink: "https://maps.app.goo.gl/abc" });
    expect(buttons).toHaveLength(1);
    expect(uriOf(buttons[0])).toBe("https://maps.app.goo.gl/abc");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line-maps.test.ts`
Expected: FAIL, with `Failed to resolve import "./line-maps"`.

- [ ] **Step 3: Implement**

Create `lib/line-maps.ts`:

```ts
import { uriAction, type FlexNode } from "@/lib/line-flex";

// Map buttons for LINE cards. Google Maps doesn't work inside mainland
// China, so every place also gets an Amap (高德) button. Pure.

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// No origin on purpose: Google Maps then routes from the phone's current location.
export function googleDirUrl(destination: string, travelmode: "transit" | "driving" | "walking"): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${travelmode}`;
}

export function amapSearchUrl(query: string): string {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(query)}`;
}

export function toTravelMode(mode: string): "transit" | "driving" | "walking" {
  const m = mode.toLowerCase();
  if (/เดิน|walk/.test(m)) return "walking";
  if (/แท็กซี่|taxi|รถยนต์|ขับ|car|drive|uber|grab|didi/.test(m)) return "driving";
  return "transit";
}

function mapButton(label: string, uri: string): FlexNode {
  return { type: "button", style: "secondary", height: "sm", action: uriAction(label, uri) };
}

export function mapButtons(p: { query: string; mapsLink?: string; directions?: { mode: string } }): FlexNode[] {
  const query = p.query.trim();
  const link = (p.mapsLink ?? "").trim();
  if (!query && !link) return [];
  const googleUri = link || (p.directions ? googleDirUrl(query, toTravelMode(p.directions.mode)) : googleSearchUrl(query));
  const buttons = [mapButton(p.directions ? "Google Maps นำทาง" : "Google Maps", googleUri)];
  if (query) buttons.push(mapButton("高德 Amap", amapSearchUrl(query)));
  return buttons;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line-maps.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-maps.ts lib/line-maps.test.ts
git commit -m "feat(line): Google Maps and Amap button helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `LineSession.data` + `lib/line-session.ts`

**Files:**
- Modify: `lib/models/types.ts` (the `LineSession` comment + interface, last lines of the file)
- Modify: `lib/models/mappers.ts` (the `line_sessions:` entry)
- Modify: `lib/models/mappers.test.ts`
- Modify: `app/api/line/webhook/route.ts` (only its `writeSession` helper, which adds `data: {}` so tsc stays clean until Task 12 rewrites the file)
- Create: `lib/line-session.ts`
- Test: `lib/line-session.test.ts`

**Interfaces:**
- Consumes: `listRows`, `updateRow`, `deleteRow` from `@/lib/store`
- Produces:
  - `interface LineSession { id: string; trip_id: string; expense_id: string; step: string; updated_at: string; data: Record<string, unknown> }`
  - `SESSION_TTL_MS = 30 * 60 * 1000`
  - `isExpired(updatedAt: string, now: Date): boolean`. Pure. True when the timestamp is unparsable or older than the TTL (exactly 30 min still counts as fresh).
  - `normalizeSessionData(raw: unknown): Record<string, unknown>` (extra export). Returns `{}` for arrays, null and primitives.
  - `readFlowSession(key: string, now: Date): Promise<LineSession | null>`. Deletes an expired row and returns null.
  - `writeFlowSession(s: Omit<LineSession, "updated_at">, now: Date): Promise<void>`
  - `deleteFlowSession(key: string): Promise<void>`
  - `readCtx(key: string): Promise<Record<string, unknown>>`. Reads row `${key}#ctx` and never expires it.
  - `writeCtx(key: string, tripId: string, patch: Record<string, unknown>, now: Date): Promise<void>`. Merges into the existing data when it belongs to the same trip and replaces it when the trip changed. Row values: `step: "ctx"`, `expense_id: ""`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/models/mappers.test.ts`. First change its type import line to:

```ts
import type { Expense, Transport, LineSession } from "./types";
```

and add at the end of the file:

```ts
describe("line_sessions mapper", () => {
  it("roundtrips the data JSON column", () => {
    const s: LineSession = {
      id: "group:g1:user:u1#ctx", trip_id: "t1", expense_id: "", step: "ctx",
      updated_at: "2026-11-20T03:00:00.000Z", data: { lastPlanDate: "2026-11-20" },
    };
    const { toRow, fromRow } = ENTITIES.line_sessions;
    expect(toRow(s)[5]).toBe('{"lastPlanDate":"2026-11-20"}');
    expect(fromRow(toRow(s))).toEqual(s);
  });

  it("an old row without the data column reads data as [] (normalized later by line-session)", () => {
    const s = ENTITIES.line_sessions.fromRow(["user:u1", "t1", "e1", "awaiting_name", "2026-11-20T03:00:00.000Z"]);
    expect(s.step).toBe("awaiting_name");
    expect(s.data).toEqual([]);
  });
});
```

Create `lib/line-session.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/store", () => ({
  listRows: vi.fn(),
  updateRow: vi.fn().mockResolvedValue(undefined),
  deleteRow: vi.fn().mockResolvedValue(undefined),
}));

import { listRows, updateRow, deleteRow } from "@/lib/store";
import {
  SESSION_TTL_MS,
  isExpired,
  normalizeSessionData,
  readFlowSession,
  writeFlowSession,
  deleteFlowSession,
  readCtx,
  writeCtx,
} from "./line-session";
import type { LineSession } from "@/lib/models/types";

const NOW = new Date("2026-11-20T03:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const KEY = "group:g1:user:u1";

function row(over: Partial<LineSession>): LineSession {
  return { id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_name", updated_at: minutesAgo(1), data: {}, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listRows).mockResolvedValue([]);
});

describe("isExpired", () => {
  it("TTL is 30 minutes", () => {
    expect(SESSION_TTL_MS).toBe(1_800_000);
  });

  it("fresh within 30 minutes, expired after", () => {
    expect(isExpired(minutesAgo(29), NOW)).toBe(false);
    expect(isExpired(minutesAgo(30), NOW)).toBe(false);
    expect(isExpired(minutesAgo(31), NOW)).toBe(true);
  });

  it("an empty or garbage timestamp counts as expired", () => {
    expect(isExpired("", NOW)).toBe(true);
    expect(isExpired("not a date", NOW)).toBe(true);
  });
});

describe("normalizeSessionData", () => {
  it("turns [] (the mapper's empty-cell value) into {}", () => {
    expect(normalizeSessionData([])).toEqual({});
  });

  it("turns null / primitives into {}", () => {
    expect(normalizeSessionData(null)).toEqual({});
    expect(normalizeSessionData("x")).toEqual({});
    expect(normalizeSessionData(3)).toEqual({});
  });

  it("keeps a real object", () => {
    expect(normalizeSessionData({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("readFlowSession", () => {
  it("returns null when there is no row", async () => {
    expect(await readFlowSession(KEY, NOW)).toBeNull();
  });

  it("returns a fresh row with data normalized from [] to {}", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ data: [] as unknown as Record<string, unknown> })]);
    const s = await readFlowSession(KEY, NOW);
    expect(s?.step).toBe("awaiting_name");
    expect(s?.data).toEqual({});
    expect(listRows).toHaveBeenCalledWith("line_sessions");
  });

  it("deletes an expired row and returns null", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ updated_at: minutesAgo(45) })]);
    expect(await readFlowSession(KEY, NOW)).toBeNull();
    expect(deleteRow).toHaveBeenCalledWith("line_sessions", KEY);
  });

  it("does not confuse the ctx row with the flow row", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, step: "ctx" })]);
    expect(await readFlowSession(KEY, NOW)).toBeNull();
  });
});

describe("writeFlowSession / deleteFlowSession", () => {
  it("stamps updated_at with now", async () => {
    await writeFlowSession({ id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_note", data: { a: 1 } }, NOW);
    expect(updateRow).toHaveBeenCalledWith("line_sessions", KEY, {
      id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_note", data: { a: 1 }, updated_at: NOW.toISOString(),
    });
  });

  it("deletes by key", async () => {
    await deleteFlowSession(KEY);
    expect(deleteRow).toHaveBeenCalledWith("line_sessions", KEY);
  });
});

describe("readCtx / writeCtx", () => {
  it("readCtx returns {} when there is no ctx row", async () => {
    expect(await readCtx(KEY)).toEqual({});
  });

  it("readCtx never expires and normalizes data", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, step: "ctx", updated_at: minutesAgo(60 * 24 * 7), data: { lastPlanDate: "2026-11-20" } })]);
    expect(await readCtx(KEY)).toEqual({ lastPlanDate: "2026-11-20" });
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, data: [] as unknown as Record<string, unknown> })]);
    expect(await readCtx(KEY)).toEqual({});
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("writeCtx merges into existing data for the same trip", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, step: "ctx", trip_id: "t1", data: { keep: true, lastPlanDate: "2026-11-19" } })]);
    await writeCtx(KEY, "t1", { lastPlanDate: "2026-11-20" }, NOW);
    expect(updateRow).toHaveBeenCalledWith("line_sessions", `${KEY}#ctx`, {
      id: `${KEY}#ctx`, trip_id: "t1", expense_id: "", step: "ctx", updated_at: NOW.toISOString(),
      data: { keep: true, lastPlanDate: "2026-11-20" },
    });
  });

  it("writeCtx starts fresh when the stored ctx belongs to another trip", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, trip_id: "old", data: { lastPlanDate: "2025-01-01" } })]);
    await writeCtx(KEY, "t1", { lastPlanDate: "2026-11-20" }, NOW);
    expect(vi.mocked(updateRow).mock.calls[0][2]).toMatchObject({ trip_id: "t1", data: { lastPlanDate: "2026-11-20" } });
  });

  it("writeCtx creates the row when none exists", async () => {
    await writeCtx(KEY, "t1", { lastPlanDate: "2026-11-20" }, NOW);
    expect(vi.mocked(updateRow).mock.calls[0][2]).toMatchObject({ id: `${KEY}#ctx`, data: { lastPlanDate: "2026-11-20" } });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/models/mappers.test.ts lib/line-session.test.ts`
Expected: FAIL. The mapper test fails because `toRow(s)[5]` is `undefined`, and the session test fails with `Failed to resolve import "./line-session"`.

- [ ] **Step 3: Implement**

In `lib/models/types.ts`, replace the final comment block and `LineSession` interface with:

```ts
// LINE bot per-person state (see lib/line-session.ts). Two kinds of row:
// - id = userKey (lib/line.ts): an in-flight expense capture flow, pointed
//   at the pending expense it created; expires after 30 minutes idle.
// - id = `${userKey}#ctx`: viewing context (e.g. data.lastPlanDate); never
//   expires.
// `data` was appended last so older sheet rows (no column) keep every other
// field aligned -- they read back as [] and get normalized to {}.
export interface LineSession { id: string; trip_id: string; expense_id: string; step: string; updated_at: string; data: Record<string, unknown>; }
```

In `lib/models/mappers.ts`, replace the `line_sessions:` line with:

```ts
  // data appended at the end (JSON) so existing rows stay aligned.
  line_sessions: makeMapper<LineSession>([["id","s"],["trip_id","s"],["expense_id","s"],["step","s"],["updated_at","s"],["data","j"]]),
```

Create `lib/line-session.ts`:

```ts
import { listRows, updateRow, deleteRow } from "@/lib/store";
import type { LineSession } from "@/lib/models/types";

// Per-person LINE state, stored in the line_sessions sheet tab.
//   `${userKey}`      -> expense capture flow (30-minute TTL)
//   `${userKey}#ctx`  -> viewing context like lastPlanDate (no TTL)

export const SESSION_TTL_MS = 30 * 60 * 1000;
const CTX_SUFFIX = "#ctx";

export function isExpired(updatedAt: string, now: Date): boolean {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > SESSION_TTL_MS;
}

// The "j" mapper kind reads an empty cell (rows written before the data
// column existed) as [] -- sessions always want an object.
export function normalizeSessionData(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

async function findRow(id: string): Promise<LineSession | null> {
  const rows = await listRows<LineSession>("line_sessions");
  const found = rows.find((r) => r.id === id);
  return found ? { ...found, data: normalizeSessionData(found.data) } : null;
}

export async function readFlowSession(key: string, now: Date): Promise<LineSession | null> {
  const s = await findRow(key);
  if (!s) return null;
  if (isExpired(s.updated_at, now)) {
    // The pending expense it pointed at stays in the in-app queue.
    await deleteRow("line_sessions", key);
    return null;
  }
  return s;
}

export async function writeFlowSession(s: Omit<LineSession, "updated_at">, now: Date): Promise<void> {
  const row: LineSession = { ...s, data: normalizeSessionData(s.data), updated_at: now.toISOString() };
  // updateRow appends when the id isn't in the sheet yet.
  await updateRow<LineSession>("line_sessions", s.id, row);
}

export async function deleteFlowSession(key: string): Promise<void> {
  await deleteRow("line_sessions", key);
}

export async function readCtx(key: string): Promise<Record<string, unknown>> {
  return (await findRow(key + CTX_SUFFIX))?.data ?? {};
}

export async function writeCtx(key: string, tripId: string, patch: Record<string, unknown>, now: Date): Promise<void> {
  const id = key + CTX_SUFFIX;
  const prev = await findRow(id);
  const base = prev && prev.trip_id === tripId ? prev.data : {};
  const row: LineSession = { id, trip_id: tripId, expense_id: "", step: "ctx", updated_at: now.toISOString(), data: { ...base, ...patch } };
  await updateRow<LineSession>("line_sessions", id, row);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/models/mappers.test.ts lib/line-session.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Keep the old webhook compiling**

`LineSession` now requires `data`, and the old route's `writeSession` builds one without it. Until Task 12 replaces the file, change only that helper in `app/api/line/webhook/route.ts`. Replace:

```ts
  const session: LineSession = { id, trip_id: tripId, expense_id: expenseId, step, updated_at: new Date().toISOString() };
```

with:

```ts
  const session: LineSession = { id, trip_id: tripId, expense_id: expenseId, step, updated_at: new Date().toISOString(), data: {} };
```

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS (whole suite).

- [ ] **Step 6: Commit**

```bash
git add lib/models/types.ts lib/models/mappers.ts lib/models/mappers.test.ts lib/line-session.ts lib/line-session.test.ts app/api/line/webhook/route.ts
git commit -m "feat(line): session data column and flow/ctx session helpers with TTL" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `lib/line-router.ts` — `classifyText`, `commandRoute`, keyword lists

**Files:**
- Create: `lib/line-router.ts`
- Test: `lib/line-router.test.ts`

**Interfaces:**
- Consumes: `stripPolitePrefix`, `matchKeyword`, `hasDigit` (Task 2); `extractDate`, `type TripDateCtx` (Task 3)
- Produces:
  - `type Route` (exact union from the spec, reproduced in the code below)
  - `interface RouteCtx { flowStep: string | null; isFlowAnswer: (text: string) => boolean; isGroup: boolean; dateCtx: TripDateCtx | null }`
  - `classifyText(text: string, ctx: RouteCtx): Route`
  - `commandRoute(target: "booking" | "places" | "transport", text: string): Route`. Rebuilds the feature route for `amb_go`.
  - `isViewCommand(text: string): boolean`. True when the text matches a step-2 view command: the view keywords, `#<n>`, or exactly `?`. Collision words don't count. The slip photo flow's predicate uses it, and the expense plan should import it rather than defining its own.
  - Keyword constants: `MENU_KEYWORDS`, `PLAN_KEYWORDS`, `PLAN_TOKEN_KEYWORDS`, `INFO_KEYWORDS`, `NOTES_KEYWORDS`, `BOOKING_KEYWORDS`, `BOOKING_FILLERS`, `RESTAURANT_KEYWORDS`, `WISH_KEYWORDS`, `TRANSPORT_KEYWORDS`, `TRANSPORT_NEXT_KEYWORDS`, `EXPENSE_COMMAND_KEYWORDS`

Decision order (first match wins):
1. `flowStep && isFlowAnswer(text)` → `flow_answer`
2. View commands (never asks back, a pending flow doesn't block): `เมนู` (prefix) or exactly `?` → menu. `แพลน` `plan` → plan (rest after keyword). `ต่อไป` `next` `ตอนนี้` `now` `#<n>` → plan (rest = whole stripped text). `ข้อมูลด่วน` `ข้อมูล` → info. `โน้ต` `โน๊ต` → notes.
3. Collision commands: booking (`จอง` `ตั๋ว` `เอกสาร`, after stripping leading `การ` / `ของ`). Places: `ร้านอาหาร` `ร้าน` `กิน` → r, `ที่เที่ยว` `อยากไป` `สถานที่` → w. Transport: `การเดินทาง` `เดินทาง` → next=false, `รอบต่อไป` `รถรอบถัดไป` → next=true. If a digit remains after `extractDate(rest)`, return `ambiguous`. Otherwise return the feature route with the un-stripped `rest`.
3.5. Exactly `ทำต่อ` / `แก้ล่าสุด` / `ยกเลิก` → `expense_new` (text).
4. `hasDigit(text)` → `flow_conflict` if a flow is pending, else `expense_new`.
5. Flow pending → `flow_reask`.
6. Group → `ignore`. 1:1 → `hint`.

- [ ] **Step 1: Write the failing tests**

Create `lib/line-router.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyText, commandRoute, isViewCommand, type RouteCtx } from "./line-router";

const DATE_CTX = { start: "2026-11-19", end: "2026-11-24", today: "2026-11-20" };
const never = () => false;
const always = () => true;

function ctx(over: Partial<RouteCtx> = {}): RouteCtx {
  return { flowStep: null, isFlowAnswer: never, isGroup: true, dateCtx: DATE_CTX, ...over };
}

describe("step 1: pending flow answer", () => {
  it("routes to flow_answer when the flow accepts the text", () => {
    expect(classifyText("เก่ง", ctx({ flowStep: "awaiting_name", isFlowAnswer: always }))).toEqual({ kind: "flow_answer" });
  });

  it("flow_answer beats commands when the flow claims the text", () => {
    expect(classifyText("แพลน", ctx({ flowStep: "awaiting_note", isFlowAnswer: always }))).toEqual({ kind: "flow_answer" });
  });

  it("ignores isFlowAnswer when there is no flow", () => {
    expect(classifyText("เก่ง", ctx({ flowStep: null, isFlowAnswer: always }))).toEqual({ kind: "ignore" });
  });
});

describe("step 2: view commands", () => {
  it.each([
    ["เมนู", { kind: "menu" }],
    ["?", { kind: "menu" }],
    ["แพลน", { kind: "plan", rest: "" }],
    ["PLAN", { kind: "plan", rest: "" }],
    ["แพลน 20/11", { kind: "plan", rest: "20/11" }],
    ["แพลน พรุ่งนี้ 2", { kind: "plan", rest: "พรุ่งนี้ 2" }],
    ["ขอดูแพลนพรุ่งนี้", { kind: "plan", rest: "พรุ่งนี้" }],
    ["ต่อไป", { kind: "plan", rest: "ต่อไป" }],
    ["next", { kind: "plan", rest: "next" }],
    ["ตอนนี้", { kind: "plan", rest: "ตอนนี้" }],
    ["ขอดู now", { kind: "plan", rest: "now" }],
    ["#2", { kind: "plan", rest: "#2" }],
    ["ข้อมูล wifi 5G", { kind: "info", rest: "wifi 5G" }],
    ["ข้อมูลด่วน", { kind: "info", rest: "" }],
    ["โน้ต วีซ่า", { kind: "notes", rest: "วีซ่า" }],
    ["โน๊ต", { kind: "notes", rest: "" }],
  ])("%s", (text, route) => {
    expect(classifyText(text, ctx())).toEqual(route);
  });

  it("a pending flow does not block view commands", () => {
    expect(classifyText("แพลน", ctx({ flowStep: "amount", isFlowAnswer: never }))).toEqual({ kind: "plan", rest: "" });
  });

  it("'planet' is not the plan command", () => {
    expect(classifyText("planet", ctx({ isGroup: false }))).toEqual({ kind: "hint" });
  });

  it("'?' only opens the menu as the whole message", () => {
    expect(classifyText("  ?  ", ctx())).toEqual({ kind: "menu" });
    expect(classifyText("?ราคา", ctx())).toEqual({ kind: "ignore" });
    expect(classifyText("? 120", ctx())).toEqual({ kind: "expense_new", text: "? 120" });
  });
});

describe("isViewCommand", () => {
  it.each(["แพลน", "plan 20/11", "ต่อไป", "next", "ตอนนี้", "now", "#2", "เมนู", "?", "ข้อมูล wifi", "ข้อมูลด่วน", "โน้ต", "โน๊ต", "ขอดูแพลน"])(
    "%s is a view command",
    (text) => expect(isViewCommand(text)).toBe(true),
  );

  it.each(["เก่ง", "ค่าแท็กซี่", "ข้าม", "120 ข้าว", "?ราคา", "ร้านนี้อร่อย", "กินข้าว", "จอง", "ตั๋วรถ 50", "เอกสาร", "ที่เที่ยว", "อยากไป", "สถานที่", "เดินทาง", "รอบต่อไป"])(
    "%s is not a view command",
    (text) => expect(isViewCommand(text)).toBe(false),
  );
});

describe("step 3: collision commands", () => {
  it.each([
    ["ตั๋วรถ 50", { kind: "ambiguous", target: "booking", text: "ตั๋วรถ 50" }],
    ["กินข้าว 120", { kind: "ambiguous", target: "places", text: "กินข้าว 120" }],
    ["เดินทาง 2 ทุ่ม", { kind: "ambiguous", target: "transport", text: "เดินทาง 2 ทุ่ม" }],
  ])("%s -> ambiguous", (text, route) => {
    expect(classifyText(text, ctx())).toEqual(route);
  });

  it.each([
    ["จอง 21/11", { kind: "booking", rest: "21/11" }],
    ["จอง วันที่ 3", { kind: "booking", rest: "วันที่ 3" }],
    ["จอง", { kind: "booking", rest: "" }],
    ["ตั๋วเครื่อง", { kind: "booking", rest: "เครื่อง" }],
    ["การจองโรงแรม", { kind: "booking", rest: "โรงแรม" }],
    ["เอกสารการจองโรงแรม", { kind: "booking", rest: "การจองโรงแรม" }],
    ["ตั๋ว ดิสนีย์", { kind: "booking", rest: "ดิสนีย์" }],
    ["ร้าน", { kind: "places", placeKind: "r", rest: "" }],
    ["ร้านอาหาร มงก๊ก", { kind: "places", placeKind: "r", rest: "มงก๊ก" }],
    ["กิน", { kind: "places", placeKind: "r", rest: "" }],
    ["ที่เที่ยว ดาว", { kind: "places", placeKind: "w", rest: "ดาว" }],
    ["อยากไป", { kind: "places", placeKind: "w", rest: "" }],
    ["สถานที่", { kind: "places", placeKind: "w", rest: "" }],
    ["เดินทาง", { kind: "transport", rest: "", next: false }],
    ["การเดินทาง", { kind: "transport", rest: "", next: false }],
    ["เดินทาง พรุ่งนี้", { kind: "transport", rest: "พรุ่งนี้", next: false }],
    ["เดินทาง 21/11", { kind: "transport", rest: "21/11", next: false }],
    ["รอบต่อไป", { kind: "transport", rest: "", next: true }],
    ["รถรอบถัดไป", { kind: "transport", rest: "", next: true }],
  ])("%s", (text, route) => {
    expect(classifyText(text, ctx())).toEqual(route);
  });

  it("an amount after a date is not eaten as the year", () => {
    expect(classifyText("ตั๋ว 20 พ.ย. 1500", ctx())).toEqual({ kind: "ambiguous", target: "booking", text: "ตั๋ว 20 พ.ย. 1500" });
  });

  it("an impossible date still counts as a number", () => {
    expect(classifyText("จอง 31/2", ctx())).toEqual({ kind: "ambiguous", target: "booking", text: "จอง 31/2" });
  });

  it("still strips dates when there is no active trip (dateCtx null)", () => {
    expect(classifyText("จอง 21/11", ctx({ dateCtx: null }))).toEqual({ kind: "booking", rest: "21/11" });
    expect(classifyText("ตั๋วรถ 50", ctx({ dateCtx: null }))).toEqual({ kind: "ambiguous", target: "booking", text: "ตั๋วรถ 50" });
  });
});

describe("step 3.5: expense commands", () => {
  it.each(["ทำต่อ", "แก้ล่าสุด", "ยกเลิก"])("%s -> expense_new", (text) => {
    expect(classifyText(text, ctx())).toEqual({ kind: "expense_new", text });
  });

  it("needs an exact match", () => {
    expect(classifyText("ยกเลิกแล้วนะ", ctx())).toEqual({ kind: "ignore" });
  });
});

describe("steps 4-6: numbers, pending flow, fallback", () => {
  it("120 ข้าว -> expense_new", () => {
    expect(classifyText("120 ข้าว", ctx())).toEqual({ kind: "expense_new", text: "120 ข้าว" });
  });

  it("pending flow + a non-answer with a number -> flow_conflict", () => {
    expect(classifyText("50 ข้าว", ctx({ flowStep: "split", isFlowAnswer: never }))).toEqual({ kind: "flow_conflict", text: "50 ข้าว" });
  });

  it("pending flow + unrelated text -> flow_reask", () => {
    expect(classifyText("สวัสดี", ctx({ flowStep: "split", isFlowAnswer: never }))).toEqual({ kind: "flow_reask" });
  });

  it("group + small talk -> ignore", () => {
    expect(classifyText("สวัสดี", ctx({ isGroup: true }))).toEqual({ kind: "ignore" });
  });

  it("1:1 + small talk -> hint", () => {
    expect(classifyText("สวัสดี", ctx({ isGroup: false }))).toEqual({ kind: "hint" });
  });

  it("empty text -> ignore in a group", () => {
    expect(classifyText("", ctx())).toEqual({ kind: "ignore" });
  });
});

describe("commandRoute (amb_go)", () => {
  it("rebuilds the feature route from the original text", () => {
    expect(commandRoute("booking", "ตั๋วรถ 50")).toEqual({ kind: "booking", rest: "รถ 50" });
    expect(commandRoute("places", "กินข้าว 120")).toEqual({ kind: "places", placeKind: "r", rest: "ข้าว 120" });
    expect(commandRoute("places", "ที่เที่ยว 3 ที่")).toEqual({ kind: "places", placeKind: "w", rest: "3 ที่" });
    expect(commandRoute("transport", "รอบต่อไป 5")).toEqual({ kind: "transport", rest: "5", next: true });
  });

  it("falls back to the whole text when the keyword doesn't match the target", () => {
    expect(commandRoute("booking", "ขอดู 50 อะไร")).toEqual({ kind: "booking", rest: "50 อะไร" });
    expect(commandRoute("places", "xyz")).toEqual({ kind: "places", placeKind: "r", rest: "xyz" });
    expect(commandRoute("transport", "xyz")).toEqual({ kind: "transport", rest: "xyz", next: false });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line-router.test.ts`
Expected: FAIL, with `Failed to resolve import "./line-router"`.

- [ ] **Step 3: Implement**

Create `lib/line-router.ts`:

```ts
import { stripPolitePrefix, matchKeyword, hasDigit } from "@/lib/line-text";
import { extractDate, type TripDateCtx } from "@/lib/line-date";

// Decides what an incoming LINE text message is. Pure -- the caller supplies
// the pending flow step, the flow's own answer predicate and the trip dates.

export type Route =
  | { kind: "flow_answer" }
  | { kind: "menu" }
  | { kind: "plan"; rest: string }
  | { kind: "info"; rest: string }
  | { kind: "notes"; rest: string }
  | { kind: "booking"; rest: string }
  | { kind: "places"; placeKind: "r" | "w"; rest: string }
  | { kind: "transport"; rest: string; next: boolean }
  | { kind: "ambiguous"; target: "booking" | "places" | "transport"; text: string }
  | { kind: "expense_new"; text: string }
  | { kind: "flow_conflict"; text: string }
  | { kind: "flow_reask" }
  | { kind: "ignore" }
  | { kind: "hint" };

export interface RouteCtx {
  flowStep: string | null;
  isFlowAnswer: (text: string) => boolean;
  isGroup: boolean;
  dateCtx: TripDateCtx | null;
}

export const MENU_KEYWORDS = ["เมนู", "?"] as const;
export const PLAN_KEYWORDS = ["แพลน", "plan"] as const;
// These are passed to the plan handler as the whole token (rest = full text).
export const PLAN_TOKEN_KEYWORDS = ["ต่อไป", "next", "ตอนนี้", "now"] as const;
export const INFO_KEYWORDS = ["ข้อมูลด่วน", "ข้อมูล"] as const;
export const NOTES_KEYWORDS = ["โน้ต", "โน๊ต"] as const;
export const BOOKING_KEYWORDS = ["จอง", "ตั๋ว", "เอกสาร"] as const;
export const BOOKING_FILLERS = ["การ", "ของ"] as const;
export const RESTAURANT_KEYWORDS = ["ร้านอาหาร", "ร้าน", "กิน"] as const;
export const WISH_KEYWORDS = ["ที่เที่ยว", "อยากไป", "สถานที่"] as const;
export const TRANSPORT_KEYWORDS = ["การเดินทาง", "เดินทาง"] as const;
export const TRANSPORT_NEXT_KEYWORDS = ["รอบต่อไป", "รถรอบถัดไป"] as const;
// Expense flow commands that may arrive with no flow pending; routed as
// expense_new with the command as `text`.
export const EXPENSE_COMMAND_KEYWORDS = ["ทำต่อ", "แก้ล่าสุด", "ยกเลิก"] as const;

type AmbiguousTarget = "booking" | "places" | "transport";

// Used only to strip date tokens before the digit check when there's no
// active trip -- the resolved date itself is thrown away.
const FALLBACK_DATE_CTX: TripDateCtx = { start: "2000-01-01", end: "2000-01-01", today: "2000-01-01" };

const has = (list: readonly string[], k: string) => list.includes(k);

// "?" only counts as the whole message ("?ราคา" / "? 120" are not the menu).
const MENU_EXACT = "?";

function matchViewCommand(text: string): Route | null {
  const s = stripPolitePrefix(text);
  if (s === MENU_EXACT) return { kind: "menu" };
  if (/^#\s*\d+/.test(s)) return { kind: "plan", rest: s };
  const prefixMenu = MENU_KEYWORDS.filter((k) => k !== MENU_EXACT);
  const m = matchKeyword(s, [...prefixMenu, ...PLAN_KEYWORDS, ...PLAN_TOKEN_KEYWORDS, ...INFO_KEYWORDS, ...NOTES_KEYWORDS]);
  if (!m) return null;
  if (has(MENU_KEYWORDS, m.keyword)) return { kind: "menu" };
  if (has(PLAN_KEYWORDS, m.keyword)) return { kind: "plan", rest: m.rest };
  if (has(PLAN_TOKEN_KEYWORDS, m.keyword)) return { kind: "plan", rest: s };
  if (has(INFO_KEYWORDS, m.keyword)) return { kind: "info", rest: m.rest };
  return { kind: "notes", rest: m.rest };
}

function stripBookingFillers(s: string): string {
  let out = s;
  for (;;) {
    const filler = BOOKING_FILLERS.find((f) => out.startsWith(f));
    if (!filler) return out;
    out = out.slice(filler.length).trim();
  }
}

function matchCollisionCommand(text: string): { target: AmbiguousTarget; rest: string; route: Route } | null {
  const s = stripPolitePrefix(text);

  const booking = matchKeyword(stripBookingFillers(s), BOOKING_KEYWORDS);
  if (booking) return { target: "booking", rest: booking.rest, route: { kind: "booking", rest: booking.rest } };

  const transportNext = matchKeyword(s, TRANSPORT_NEXT_KEYWORDS);
  if (transportNext) return { target: "transport", rest: transportNext.rest, route: { kind: "transport", rest: transportNext.rest, next: true } };

  const transport = matchKeyword(s, TRANSPORT_KEYWORDS);
  if (transport) return { target: "transport", rest: transport.rest, route: { kind: "transport", rest: transport.rest, next: false } };

  const place = matchKeyword(s, [...RESTAURANT_KEYWORDS, ...WISH_KEYWORDS]);
  if (place) {
    const placeKind = has(RESTAURANT_KEYWORDS, place.keyword) ? "r" : "w";
    return { target: "places", rest: place.rest, route: { kind: "places", placeKind, rest: place.rest } };
  }
  return null;
}

// True when the text is a step-2 VIEW command (แพลน/plan, ต่อไป/next,
// ตอนนี้/now, #<n>, เมนู, exactly ?, ข้อมูล/ข้อมูลด่วน, โน้ต/โน๊ต). Collision
// words (ร้าน, กิน, จอง, ตั๋ว, เดินทาง, ...) are NOT included -- they show up
// in ordinary notes ("ร้านนี้อร่อย"). Flows that take free text as an answer
// use this to let view commands through.
export function isViewCommand(text: string): boolean {
  return matchViewCommand(text) !== null;
}

// For the ambiguity postback (amb_go): rebuild the feature route from the
// original message. If the keyword doesn't match the target (shouldn't
// happen), the whole stripped text becomes the search rest.
export function commandRoute(target: AmbiguousTarget, text: string): Route {
  const hit = matchCollisionCommand(text);
  if (hit && hit.target === target) return hit.route;
  const rest = stripPolitePrefix(text);
  if (target === "booking") return { kind: "booking", rest };
  if (target === "places") return { kind: "places", placeKind: "r", rest };
  return { kind: "transport", rest, next: false };
}

export function classifyText(text: string, ctx: RouteCtx): Route {
  // 1. The pending expense flow claims its own answers first.
  if (ctx.flowStep && ctx.isFlowAnswer(text)) return { kind: "flow_answer" };

  // 2. View commands never ask back, even mid-flow (the flow stays put).
  const view = matchViewCommand(text);
  if (view) return view;

  // 3. Commands that could also be an expense ("ตั๋วรถ 50").
  const hit = matchCollisionCommand(text);
  if (hit) {
    const { rest } = extractDate(hit.rest, ctx.dateCtx ?? FALLBACK_DATE_CTX);
    return hasDigit(rest) ? { kind: "ambiguous", target: hit.target, text: text.trim() } : hit.route;
  }

  // 3.5. Bare expense commands ("ทำต่อ") -- the expense handler reads `text`.
  const cmd = matchKeyword(text, EXPENSE_COMMAND_KEYWORDS);
  if (cmd && cmd.rest === "") return { kind: "expense_new", text: cmd.keyword };

  // 4. Anything with a number is an expense.
  if (hasDigit(text)) return ctx.flowStep ? { kind: "flow_conflict", text: text.trim() } : { kind: "expense_new", text: text.trim() };

  // 5. Mid-flow but off-topic: re-ask the current question.
  if (ctx.flowStep) return { kind: "flow_reask" };

  // 6. Small talk: silent in groups, a hint in 1:1.
  return ctx.isGroup ? { kind: "ignore" } : { kind: "hint" };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line-router.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-router.ts lib/line-router.test.ts
git commit -m "feat(line): text router with command ordering and expense-collision rules" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `lib/line-menu.ts` — copy, menu carousel, `menuGoRoute`, ambiguity question

**Files:**
- Create: `lib/line-menu.ts`
- Test: `lib/line-menu.test.ts`

**Interfaces:**
- Consumes: `CLAY`, `txt`, `compact`, `flexMessage`, `textMessage`, `quickReply`, `postbackAction`, `type FlexNode` (Task 4); `type Route` (Task 7)
- Produces:
  - `HINT_TEXT`, `NO_TRIP_TEXT`, `WIP_TEXT` (exact copy from Global Constraints)
  - `MENU_SHORTCUTS: { label: string; data: Record<string, string> }[]` (8 items, all `a: "menu_go"`)
  - `buildMenuMessage(): FlexNode`. A flex carousel with 2 bubbles: expense how-to, then view shortcuts.
  - `menuGoRoute(data: Record<string, string>): Route | null`
  - `buildAmbiguityMessage(target: "booking" | "places" | "transport", text: string): FlexNode`. A text question with 2 quick replies: `a=amb_expense&q=<text>` and `a=amb_go&t=<target>&q=<text>`.

- [ ] **Step 1: Write the failing tests**

Create `lib/line-menu.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  HINT_TEXT,
  NO_TRIP_TEXT,
  WIP_TEXT,
  MENU_SHORTCUTS,
  buildMenuMessage,
  menuGoRoute,
  buildAmbiguityMessage,
} from "./line-menu";
import { decodePostback, type FlexNode } from "./line-flex";

describe("copy", () => {
  it("uses the exact spec wording", () => {
    expect(HINT_TEXT).toBe("ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ เมนู");
    expect(NO_TRIP_TEXT).toBe('ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ');
    expect(WIP_TEXT).toBe("ฟีเจอร์นี้กำลังพัฒนา");
  });
});

describe("buildMenuMessage", () => {
  const msg = buildMenuMessage();
  const json = JSON.stringify(msg);
  const carousel = msg.contents as FlexNode;

  it("is a flex carousel with 2 bubbles", () => {
    expect(msg.type).toBe("flex");
    expect(carousel.type).toBe("carousel");
    expect((carousel.contents as FlexNode[]).length).toBe(2);
  });

  it("bubble 1 teaches expense capture", () => {
    for (const s of ["บันทึกค่าใช้จ่าย", "120 บาท ข้าว หาร", "500 บาท เซเว่น ฝาก 20", "สลิป", "ทำต่อ", "แก้ล่าสุด", "ยกเลิก"]) {
      expect(json).toContain(s);
    }
  });

  it("bubble 2 has one menu_go postback button per shortcut", () => {
    const bubble2 = (carousel.contents as FlexNode[])[1];
    const buttons = ((bubble2.body as FlexNode).contents as FlexNode[]).filter((n) => n.type === "button");
    expect(buttons).toHaveLength(8);
    const datas = buttons.map((b) => decodePostback((b.action as FlexNode).data as string));
    expect(datas.every((d) => d.a === "menu_go")).toBe(true);
    expect(datas.map((d) => d.t)).toEqual(["plan", "plan", "booking", "places", "places", "info", "notes", "transport"]);
  });

  it("has no empty text nodes", () => {
    expect(json).not.toContain('"text":""');
  });
});

describe("menuGoRoute", () => {
  it("maps every shortcut to a route", () => {
    expect(MENU_SHORTCUTS.map((s) => menuGoRoute(s.data))).toEqual([
      { kind: "plan", rest: "" },
      { kind: "plan", rest: "ต่อไป" },
      { kind: "booking", rest: "" },
      { kind: "places", placeKind: "r", rest: "" },
      { kind: "places", placeKind: "w", rest: "" },
      { kind: "info", rest: "" },
      { kind: "notes", rest: "" },
      { kind: "transport", rest: "", next: false },
    ]);
  });

  it("returns null for an unknown target", () => {
    expect(menuGoRoute({ a: "menu_go", t: "nope" })).toBeNull();
    expect(menuGoRoute({ a: "menu_go" })).toBeNull();
  });
});

describe("buildAmbiguityMessage", () => {
  it("asks expense-or-command with two postback quick replies", () => {
    const msg = buildAmbiguityMessage("booking", "ตั๋วรถ 50");
    expect(msg.type).toBe("text");
    expect(msg.text).toBe("บันทึกค่าใช้จ่าย หรือ ค้นการจอง?");
    const items = (msg.quickReply as FlexNode).items as FlexNode[];
    expect(items).toHaveLength(2);
    const [expense, go] = items.map((i) => decodePostback((i.action as FlexNode).data as string));
    expect(expense).toEqual({ a: "amb_expense", q: "ตั๋วรถ 50" });
    expect(go).toEqual({ a: "amb_go", t: "booking", q: "ตั๋วรถ 50" });
    expect((items[0].action as FlexNode).label).toBe("💸 บันทึกค่าใช้จ่าย");
  });

  it("words the question per target", () => {
    expect(buildAmbiguityMessage("places", "กินข้าว 120").text).toBe("บันทึกค่าใช้จ่าย หรือ ค้นร้าน/ที่เที่ยว?");
    expect(buildAmbiguityMessage("transport", "เดินทาง 2 ทุ่ม").text).toBe("บันทึกค่าใช้จ่าย หรือ ดูการเดินทาง?");
  });

  it("keeps postback data within 300 chars for long messages", () => {
    const msg = buildAmbiguityMessage("booking", "ตั๋วรถไฟความเร็วสูง 50 ".repeat(20));
    const items = (msg.quickReply as FlexNode).items as FlexNode[];
    for (const i of items) expect(((i.action as FlexNode).data as string).length).toBeLessThanOrEqual(300);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line-menu.test.ts`
Expected: FAIL, with `Failed to resolve import "./line-menu"`.

- [ ] **Step 3: Implement**

Create `lib/line-menu.ts`:

```ts
import { CLAY, txt, compact, flexMessage, textMessage, quickReply, postbackAction, type FlexNode } from "@/lib/line-flex";
import type { Route } from "@/lib/line-router";

// Menu / how-to card plus the bot's shared one-line replies. Pure.

export const HINT_TEXT = "ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ เมนู";
export const NO_TRIP_TEXT = 'ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ';
export const WIP_TEXT = "ฟีเจอร์นี้กำลังพัฒนา";

export const MENU_SHORTCUTS: { label: string; data: Record<string, string> }[] = [
  { label: "📅 แพลนวันนี้", data: { a: "menu_go", t: "plan" } },
  { label: "⏭ ต่อไป", data: { a: "menu_go", t: "plan", q: "ต่อไป" } },
  { label: "🎫 การจอง", data: { a: "menu_go", t: "booking" } },
  { label: "🍜 ร้าน", data: { a: "menu_go", t: "places", k: "r" } },
  { label: "📍 ที่เที่ยว", data: { a: "menu_go", t: "places", k: "w" } },
  { label: "ℹ️ ข้อมูลด่วน", data: { a: "menu_go", t: "info" } },
  { label: "📝 โน้ต", data: { a: "menu_go", t: "notes" } },
  { label: "🚌 การเดินทาง", data: { a: "menu_go", t: "transport" } },
];

function header(title: string): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: CLAY.coral,
    paddingAll: "14px",
    contents: compact([txt(title, { weight: "bold", size: "lg", color: "#FFFFFF" })]),
  };
}

function expenseBubble(): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    header: header("💸 บันทึกค่าใช้จ่าย"),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      paddingAll: "16px",
      contents: compact([
        txt("พิมพ์ยอด + รายละเอียด เช่น", { size: "sm", color: CLAY.muted }),
        txt("120 บาท ข้าว หาร", { size: "md", weight: "bold", color: CLAY.ink }),
        txt("500 บาท เซเว่น ฝาก 20", { size: "md", weight: "bold", color: CLAY.ink }),
        txt("📸 หรือส่งรูปสลิปมาได้เลย", { size: "sm", color: CLAY.ink, margin: "md" }),
        txt("คำสั่ง: ทำต่อ · แก้ล่าสุด · ยกเลิก", { size: "sm", color: CLAY.muted, margin: "md" }),
      ]),
    },
  };
}

function viewBubble(): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    header: header("🔎 ดูข้อมูล"),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      paddingAll: "12px",
      contents: MENU_SHORTCUTS.map((s) => ({
        type: "button",
        style: "secondary",
        height: "sm",
        color: CLAY.card,
        action: postbackAction(s.label, s.data, s.label),
      })),
    },
  };
}

export function buildMenuMessage(): FlexNode {
  return flexMessage("เมนู TravelAss", { type: "carousel", contents: [expenseBubble(), viewBubble()] });
}

// Postback `a=menu_go&t=<route kind>[&k=r|w][&q=<rest>]` -> Route.
export function menuGoRoute(data: Record<string, string>): Route | null {
  const q = data.q ?? "";
  switch (data.t) {
    case "plan": return { kind: "plan", rest: q };
    case "booking": return { kind: "booking", rest: q };
    case "places": return { kind: "places", placeKind: data.k === "w" ? "w" : "r", rest: q };
    case "info": return { kind: "info", rest: q };
    case "notes": return { kind: "notes", rest: q };
    case "transport": return { kind: "transport", rest: q, next: false };
    default: return null;
  }
}

const AMBIGUITY_QUESTION = { booking: "ค้นการจอง", places: "ค้นร้าน/ที่เที่ยว", transport: "ดูการเดินทาง" } as const;
const AMBIGUITY_BUTTON = { booking: "🎫 ค้นการจอง", places: "🍜 ค้นร้าน/ที่เที่ยว", transport: "🚌 ดูการเดินทาง" } as const;

export function buildAmbiguityMessage(target: "booking" | "places" | "transport", text: string): FlexNode {
  return textMessage(
    `บันทึกค่าใช้จ่าย หรือ ${AMBIGUITY_QUESTION[target]}?`,
    quickReply([
      { label: "💸 บันทึกค่าใช้จ่าย", data: { a: "amb_expense", q: text } },
      { label: AMBIGUITY_BUTTON[target], data: { a: "amb_go", t: target, q: text } },
    ]),
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line-menu.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-menu.ts lib/line-menu.test.ts
git commit -m "feat(line): menu carousel, shortcut routes, ambiguity question, shared copy" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Handler contract + feature stubs

**Files:**
- Create: `lib/line-handlers/types.ts`
- Create: `lib/line-handlers/plan.ts`
- Create: `lib/line-handlers/booking.ts`
- Create: `lib/line-handlers/places.ts`
- Create: `lib/line-handlers/info.ts`
- Create: `lib/line-handlers/transport.ts`
- Test: `lib/line-handlers/stubs.test.ts`

**Interfaces:**
- Consumes: `type LineEvent` (Task 1), `type FlexNode`, `textMessage` (Task 4), `type Route` (Task 7), `WIP_TEXT` (Task 8), `type Trip`
- Produces:
  - `interface HandlerCtx { event: LineEvent; replyToken: string; accessToken: string; origin: string; now: Date; userKey: string; isGroup: boolean; trip: Trip | null; reply: (messages: FlexNode[]) => Promise<void> }`
  - `type PostbackData = Record<string, string>`
  - Each of `plan`, `booking`, `places`, `info`, `transport` exports `handleRoute(ctx: HandlerCtx, route: Route): Promise<void>` and `handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void>`. In this plan both reply `[textMessage(WIP_TEXT)]` in 1:1 and stay **silent when `ctx.isGroup`**. Feature plans replace each file whole.

- [ ] **Step 1: Write the failing test**

Create `lib/line-handlers/stubs.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import * as plan from "./plan";
import * as booking from "./booking";
import * as places from "./places";
import * as info from "./info";
import * as transport from "./transport";
import type { HandlerCtx } from "./types";
import { textMessage } from "@/lib/line-flex";
import { WIP_TEXT } from "@/lib/line-menu";

function makeCtx(isGroup = false): HandlerCtx {
  return {
    event: { type: "message", replyToken: "rt", source: { type: "user", userId: "u1" }, message: { id: "m1", type: "text", text: "x" } },
    replyToken: "rt",
    accessToken: "tok",
    origin: "https://app.test",
    now: new Date("2026-11-20T03:00:00Z"),
    userKey: "user:u1",
    isGroup,
    trip: null,
    reply: vi.fn(async () => {}),
  };
}

describe.each([
  ["plan", plan],
  ["booking", booking],
  ["places", places],
  ["info", info],
  ["transport", transport],
])("%s stub", (_name, mod) => {
  it("handleRoute replies 'in development'", async () => {
    const ctx = makeCtx();
    await mod.handleRoute(ctx, { kind: "plan", rest: "" });
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(WIP_TEXT)]);
  });

  it("handlePostback replies 'in development'", async () => {
    const ctx = makeCtx();
    await mod.handlePostback(ctx, { a: "x" });
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(WIP_TEXT)]);
  });

  it("stays silent in a group chat", async () => {
    const ctx = makeCtx(true);
    await mod.handleRoute(ctx, { kind: "plan", rest: "" });
    await mod.handlePostback(ctx, { a: "x" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- lib/line-handlers/stubs.test.ts`
Expected: FAIL, with `Failed to resolve import "./plan"`.

- [ ] **Step 3: Implement**

Create `lib/line-handlers/types.ts`:

```ts
import type { LineEvent } from "@/lib/line";
import type { FlexNode } from "@/lib/line-flex";
import type { Trip } from "@/lib/models/types";

// Everything a feature handler needs for one LINE event. Built by the
// webhook route; handlers never touch the raw request.
export interface HandlerCtx {
  event: LineEvent;
  replyToken: string;
  accessToken: string;
  origin: string; // req.nextUrl.origin
  now: Date;
  userKey: string;
  isGroup: boolean;
  trip: Trip | null; // first trip with status === "active"
  reply: (messages: FlexNode[]) => Promise<void>; // <= 5 messages
}

export type PostbackData = Record<string, string>;
```

Create `lib/line-handlers/plan.ts`:

```ts
import type { HandlerCtx, PostbackData } from "./types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { WIP_TEXT } from "@/lib/line-menu";

// Stub -- the plan feature's own implementation plan replaces this whole file.
export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  void route;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  void data;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}
```

Create `lib/line-handlers/booking.ts`:

```ts
import type { HandlerCtx, PostbackData } from "./types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { WIP_TEXT } from "@/lib/line-menu";

// Stub -- the booking feature's own implementation plan replaces this whole file.
export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  void route;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  void data;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}
```

Create `lib/line-handlers/places.ts`:

```ts
import type { HandlerCtx, PostbackData } from "./types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { WIP_TEXT } from "@/lib/line-menu";

// Stub -- the places feature's own implementation plan replaces this whole file.
export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  void route;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  void data;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}
```

Create `lib/line-handlers/info.ts`:

```ts
import type { HandlerCtx, PostbackData } from "./types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { WIP_TEXT } from "@/lib/line-menu";

// Stub -- the info/notes feature's own implementation plan replaces this
// whole file. Receives both `info` and `notes` routes and `qi_`/`qn_` postbacks.
export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  void route;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  void data;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}
```

Create `lib/line-handlers/transport.ts`:

```ts
import type { HandlerCtx, PostbackData } from "./types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { WIP_TEXT } from "@/lib/line-menu";

// Stub -- the transport feature's own implementation plan replaces this whole file.
export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  void route;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  void data;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- lib/line-handlers/stubs.test.ts`
Expected: PASS (15 tests).

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-handlers/types.ts lib/line-handlers/plan.ts lib/line-handlers/booking.ts lib/line-handlers/places.ts lib/line-handlers/info.ts lib/line-handlers/transport.ts lib/line-handlers/stubs.test.ts
git commit -m "feat(line): handler contract and placeholder feature handlers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `lib/line-handlers/expense.ts` — move the photo flow

Port the slip flow currently in `app/api/line/webhook/route.ts` (`handleImageMessage` / `handleTextMessage`) with the same replies and data writes. Sessions are now keyed by `ctx.userKey` through `lib/line-session` (30-minute TTL). The route file itself is rewritten in Task 12.

**Files:**
- Create: `lib/line-handlers/expense.ts`
- Test: `lib/line-handlers/expense.test.ts`

**Interfaces:**
- Consumes: `listRows`, `updateRow`, `saveImage` (`@/lib/store`); `buildPendingExpense` (`@/lib/pending-expense`); `fetchLineImageContent`, `buildNameQuickReply`, `buildSkipQuickReply`, `buildConfirmationFlex` (`@/lib/line`); `readFlowSession`, `writeFlowSession`, `deleteFlowSession` (Task 6); `textMessage`, `imageUrl`, `type FlexNode` (Task 4); `NO_TRIP_TEXT`, `WIP_TEXT` (Task 8); `HandlerCtx`, `PostbackData` (Task 9); `isViewCommand`, `type Route` (Task 7)
- Produces (spec signatures):
  - `handleImage(ctx: HandlerCtx): Promise<void>`
  - `flowAnswerPredicate(ctx: HandlerCtx, session: LineSession): Promise<(text: string) => boolean>`. When `step` is `awaiting_name` or `awaiting_note`, the predicate accepts any text except `isViewCommand(text)` view commands (collision words like `ร้านนี้อร่อย` are still taken as the answer). For any other step it accepts nothing.
  - `handleRoute(ctx: HandlerCtx, route: Route): Promise<void>`. `flow_answer` runs the photo flow. `expense_new`, `flow_conflict` and `flow_reask` are stubs: silent in a group, `WIP_TEXT` in 1:1.
  - `handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void>`. A stub that replies `WIP_TEXT` in 1:1 and stays silent in a group.

- [ ] **Step 1: Write the failing tests**

Create `lib/line-handlers/expense.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/store", () => ({
  listRows: vi.fn(),
  updateRow: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue("photo-1"),
}));
vi.mock("@/lib/line-session", () => ({
  readFlowSession: vi.fn(),
  writeFlowSession: vi.fn().mockResolvedValue(undefined),
  deleteFlowSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/line", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/line")>()),
  fetchLineImageContent: vi.fn().mockResolvedValue({ buf: Buffer.from("img"), mime: "image/jpeg" }),
}));

import { listRows, updateRow, saveImage } from "@/lib/store";
import { readFlowSession, writeFlowSession, deleteFlowSession } from "@/lib/line-session";
import { fetchLineImageContent } from "@/lib/line";
import { handleImage, handleRoute, handlePostback, flowAnswerPredicate } from "./expense";
import type { HandlerCtx } from "./types";
import type { Trip, Member, Expense, LineSession } from "@/lib/models/types";
import { textMessage, type FlexNode } from "@/lib/line-flex";
import { WIP_TEXT, NO_TRIP_TEXT } from "@/lib/line-menu";

const TRIP: Trip = {
  id: "t1", name: "ฮ่องกง", destination: "Hong Kong", start_date: "2026-11-19", end_date: "2026-11-24",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const MEMBERS: Member[] = [
  { id: "m1", trip_id: "t1", name: "เก่ง", color: "", promptpay_id: "" },
  { id: "m2", trip_id: "t1", name: "โอ", color: "", promptpay_id: "" },
];
const NOW = new Date("2026-11-20T03:00:00.000Z");
const KEY = "group:g1:user:u1";

function pendingExpense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1", trip_id: "t1", datetime: NOW.toISOString(), category: "อื่นๆ", description: "", amount: 0,
    currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: ["photo-1"], splits: [], pending: true, ...over,
  };
}

function session(step: string): LineSession {
  return { id: KEY, trip_id: "t1", expense_id: "e1", step, updated_at: NOW.toISOString(), data: {} };
}

function makeCtx(over: Partial<HandlerCtx> = {}, text = "เก่ง"): HandlerCtx {
  return {
    event: { type: "message", replyToken: "rt", source: { type: "group", groupId: "g1", userId: "u1" }, message: { id: "m1", type: "text", text } },
    replyToken: "rt",
    accessToken: "tok",
    origin: "https://app.test",
    now: NOW,
    userKey: KEY,
    isGroup: true,
    trip: TRIP,
    reply: vi.fn(async () => {}),
    ...over,
  };
}

const firstReply = (ctx: HandlerCtx) => vi.mocked(ctx.reply).mock.calls[0][0] as FlexNode[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listRows).mockImplementation(async (entity: string) => {
    if (entity === "members") return MEMBERS as never;
    if (entity === "expenses") return [pendingExpense()] as never;
    return [] as never;
  });
});

describe("handleImage", () => {
  it("saves the slip as a pending expense, starts a flow session, asks who", async () => {
    const ctx = makeCtx({ event: { type: "message", replyToken: "rt", source: { type: "group", groupId: "g1", userId: "u1" }, message: { id: "img-9", type: "image" } } });
    await handleImage(ctx);

    expect(fetchLineImageContent).toHaveBeenCalledWith("img-9", "tok");
    expect(saveImage).toHaveBeenCalledWith(expect.any(Buffer), "image/jpeg", "ฮ่องกง", "slips", `line-${NOW.getTime()}.jpg`);
    expect(updateRow).toHaveBeenCalledWith(
      "expenses",
      expect.any(String),
      expect.objectContaining({ trip_id: "t1", pending: true, slip_photo_ids: ["photo-1"], currency: "HKD", datetime: NOW.toISOString() }),
    );
    const expenseId = vi.mocked(updateRow).mock.calls[0][1];
    expect(writeFlowSession).toHaveBeenCalledWith({ id: KEY, trip_id: "t1", expense_id: expenseId, step: "awaiting_name", data: {} }, NOW);

    const [msg] = firstReply(ctx);
    expect(msg).toMatchObject({ type: "text", text: "รับสลิปแล้ว 📸 ใครเป็นคนบันทึกรายการนี้?" });
    expect(JSON.stringify(msg.quickReply)).toContain("เก่ง");
    expect(JSON.stringify(msg.quickReply)).toContain("โอ");
  });

  it("replies the no-trip message when there is no active trip", async () => {
    const ctx = makeCtx({ trip: null });
    await handleImage(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(NO_TRIP_TEXT)]);
    expect(saveImage).not.toHaveBeenCalled();
  });
});

describe("flowAnswerPredicate", () => {
  it("accepts ordinary text while waiting for the name or note", async () => {
    const ctx = makeCtx();
    expect((await flowAnswerPredicate(ctx, session("awaiting_name")))("เก่ง")).toBe(true);
    expect((await flowAnswerPredicate(ctx, session("awaiting_note")))("อะไรก็ได้ 120")).toBe(true);
    expect((await flowAnswerPredicate(ctx, session("awaiting_note")))("ข้าม")).toBe(true);
  });

  it("lets view commands through instead of taking them as the answer", async () => {
    const ctx = makeCtx();
    const isAnswer = await flowAnswerPredicate(ctx, session("awaiting_name"));
    for (const cmd of ["แพลน", "plan", "ต่อไป", "#2", "เมนู", "?", "ข้อมูล", "ข้อมูลด่วน", "โน้ต"]) {
      expect(isAnswer(cmd)).toBe(false);
    }
  });

  it("still takes collision words as the note", async () => {
    const isAnswer = await flowAnswerPredicate(makeCtx(), session("awaiting_note"));
    for (const note of ["ร้านนี้อร่อย", "กินข้าว", "จองโต๊ะไว้", "ตั๋วรถ", "เดินทางไปสนามบิน"]) {
      expect(isAnswer(note)).toBe(true);
    }
  });

  it("accepts nothing for other steps", async () => {
    expect((await flowAnswerPredicate(makeCtx(), session("amount")))("120")).toBe(false);
  });
});

describe("handleRoute flow_answer", () => {
  it("awaiting_name: sets the payer, moves to awaiting_note, offers skip", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(session("awaiting_name"));
    const ctx = makeCtx({}, " เก่ง ");
    await handleRoute(ctx, { kind: "flow_answer" });

    expect(readFlowSession).toHaveBeenCalledWith(KEY, NOW);
    expect(updateRow).toHaveBeenCalledWith("expenses", "e1", expect.objectContaining({ payer: "เก่ง" }));
    expect(writeFlowSession).toHaveBeenCalledWith({ id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_note", data: {} }, NOW);
    const [msg] = firstReply(ctx);
    expect(msg.text).toBe('บันทึกคนบันทึกเป็น "เก่ง" แล้ว มีโน้ตอยากใส่ไหม? (พิมพ์ได้เลย หรือกดข้าม)');
    expect(JSON.stringify(msg.quickReply)).toContain("ข้าม");
  });

  it("awaiting_note: saves the note, ends the session, replies the confirmation card", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(session("awaiting_note"));
    vi.mocked(listRows).mockImplementation(async (entity: string) => (entity === "expenses" ? [pendingExpense({ payer: "เก่ง" })] : []) as never);
    const ctx = makeCtx({}, "ค่าแท็กซี่");
    await handleRoute(ctx, { kind: "flow_answer" });

    expect(updateRow).toHaveBeenCalledWith("expenses", "e1", expect.objectContaining({ description: "ค่าแท็กซี่" }));
    expect(deleteFlowSession).toHaveBeenCalledWith(KEY);
    const [msg] = firstReply(ctx);
    const json = JSON.stringify(msg);
    expect(msg.type).toBe("flex");
    expect(json).toContain("https://app.test/api/img/photo-1");
    expect(json).toContain("เก่ง");
    expect(json).toContain("ค่าแท็กซี่");
    expect(json).toContain("https://app.test/trips/t1/money");
  });

  it("awaiting_note: 'ข้าม' saves an empty note", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(session("awaiting_note"));
    const ctx = makeCtx({}, "ข้าม");
    await handleRoute(ctx, { kind: "flow_answer" });
    expect(updateRow).toHaveBeenCalledWith("expenses", "e1", expect.objectContaining({ description: "" }));
  });

  it("drops the session silently if its expense is gone", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(session("awaiting_name"));
    vi.mocked(listRows).mockResolvedValue([] as never);
    const ctx = makeCtx();
    await handleRoute(ctx, { kind: "flow_answer" });
    expect(deleteFlowSession).toHaveBeenCalledWith(KEY);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("does nothing if the session expired in between", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(null);
    const ctx = makeCtx();
    await handleRoute(ctx, { kind: "flow_answer" });
    expect(updateRow).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe("not-yet-built expense routes", () => {
  it("stay silent in a group", async () => {
    const ctx = makeCtx({ isGroup: true });
    await handleRoute(ctx, { kind: "expense_new", text: "120 ข้าว" });
    await handleRoute(ctx, { kind: "flow_conflict", text: "50" });
    await handleRoute(ctx, { kind: "flow_reask" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("say 'in development' in 1:1", async () => {
    const ctx = makeCtx({ isGroup: false });
    await handleRoute(ctx, { kind: "expense_new", text: "120 ข้าว" });
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(WIP_TEXT)]);
  });

  it("postbacks say 'in development' in 1:1 and nothing in a group", async () => {
    const solo = makeCtx({ isGroup: false });
    await handlePostback(solo, { a: "x_payer" });
    expect(solo.reply).toHaveBeenCalledWith([textMessage(WIP_TEXT)]);
    const group = makeCtx({ isGroup: true });
    await handlePostback(group, { a: "x_payer" });
    expect(group.reply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line-handlers/expense.test.ts`
Expected: FAIL, with `Failed to resolve import "./expense"`.

- [ ] **Step 3: Implement**

Create `lib/line-handlers/expense.ts`:

```ts
import { randomUUID } from "node:crypto";
import { listRows, updateRow, saveImage } from "@/lib/store";
import { buildPendingExpense } from "@/lib/pending-expense";
import { fetchLineImageContent, buildNameQuickReply, buildSkipQuickReply, buildConfirmationFlex } from "@/lib/line";
import { readFlowSession, writeFlowSession, deleteFlowSession } from "@/lib/line-session";
import { textMessage, imageUrl, type FlexNode } from "@/lib/line-flex";
import { NO_TRIP_TEXT, WIP_TEXT } from "@/lib/line-menu";
import { isViewCommand, type Route } from "@/lib/line-router";
import type { Expense, LineSession, Member } from "@/lib/models/types";
import type { HandlerCtx, PostbackData } from "./types";

// Expense capture over LINE. For now this is only the slip-photo flow that
// already runs in production (photo -> "who?" -> "note?" -> card), moved
// out of the webhook route; the typed-expense flow replaces the stubs below.

const SKIP_LABEL = "ข้าม";
const PHOTO_FLOW_STEPS = new Set(["awaiting_name", "awaiting_note"]);

// Step 1: a photo arrives. Save it as a pending expense right away (the
// photo is never lost even if the conversation goes nowhere), then ask who
// it belongs to.
export async function handleImage(ctx: HandlerCtx): Promise<void> {
  const trip = ctx.trip;
  if (!trip) {
    await ctx.reply([textMessage(NO_TRIP_TEXT)]);
    return;
  }
  const messageId = ctx.event.message?.id;
  if (!messageId) return;

  const { buf, mime } = await fetchLineImageContent(messageId, ctx.accessToken);
  const photoId = await saveImage(buf, mime, trip.name, "slips", `line-${ctx.now.getTime()}.jpg`);

  const expenseId = randomUUID();
  const exp = buildPendingExpense({ id: expenseId, tripId: trip.id, photoId, currency: trip.trip_currency, now: ctx.now.toISOString() });
  await Promise.all([
    updateRow<Expense>("expenses", expenseId, exp), // appends, since expenseId is new
    writeFlowSession({ id: ctx.userKey, trip_id: trip.id, expense_id: expenseId, step: "awaiting_name", data: {} }, ctx.now),
  ]);

  const members = await listRows<Member>("members", trip.id);
  await ctx.reply([textMessage("รับสลิปแล้ว 📸 ใครเป็นคนบันทึกรายการนี้?", buildNameQuickReply(members) as FlexNode | undefined)]);
}

// While the photo flow waits for a name or note, any text is the answer --
// except a view command (แพลน, เมนู, ข้อมูล, โน้ต, #2, ...), which goes to its
// feature while the flow stays pending. Collision words like "ร้าน" are
// still taken as the note ("ร้านนี้อร่อย").
export async function flowAnswerPredicate(ctx: HandlerCtx, session: LineSession): Promise<(text: string) => boolean> {
  void ctx;
  if (!PHOTO_FLOW_STEPS.has(session.step)) return () => false;
  return (text) => !isViewCommand(text);
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  switch (route.kind) {
    case "flow_answer":
      await handlePhotoFlowAnswer(ctx);
      return;
    case "expense_new":
    case "flow_conflict":
    case "flow_reask":
      // Typed expense capture isn't built yet. Stay silent in groups so
      // everyday chat containing numbers doesn't get a reply.
      if (ctx.isGroup) return;
      await ctx.reply([textMessage(WIP_TEXT)]);
      return;
    default:
      return;
  }
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  void data;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}

// Steps 2 and 3: the next text is the name, then the note.
async function handlePhotoFlowAnswer(ctx: HandlerCtx): Promise<void> {
  const session = await readFlowSession(ctx.userKey, ctx.now);
  if (!session) return;

  const text = (ctx.event.message?.text ?? "").trim();
  const expenses = await listRows<Expense>("expenses", session.trip_id);
  const exp = expenses.find((e) => e.id === session.expense_id);
  if (!exp) {
    await deleteFlowSession(ctx.userKey);
    return;
  }

  if (session.step === "awaiting_name") {
    await Promise.all([
      updateRow<Expense>("expenses", exp.id, { ...exp, payer: text }),
      writeFlowSession({ id: session.id, trip_id: session.trip_id, expense_id: session.expense_id, step: "awaiting_note", data: session.data }, ctx.now),
    ]);
    await ctx.reply([
      textMessage(`บันทึกคนบันทึกเป็น "${text}" แล้ว มีโน้ตอยากใส่ไหม? (พิมพ์ได้เลย หรือกดข้าม)`, buildSkipQuickReply(SKIP_LABEL) as FlexNode),
    ]);
    return;
  }

  if (session.step === "awaiting_note") {
    const note = text === SKIP_LABEL ? "" : text;
    await Promise.all([
      updateRow<Expense>("expenses", exp.id, { ...exp, description: note }),
      deleteFlowSession(ctx.userKey),
    ]);
    const flex = buildConfirmationFlex({
      photoUrl: imageUrl(ctx.origin, exp.slip_photo_ids[0]),
      payer: exp.payer,
      note,
      moneyUrl: `${ctx.origin}/trips/${exp.trip_id}/money`,
    });
    await ctx.reply([flex as FlexNode]);
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line-handlers/expense.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-handlers/expense.ts lib/line-handlers/expense.test.ts
git commit -m "feat(line): move slip photo flow into the expense handler with per-person sessions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `lib/line-dispatch.ts` — event → handler

**Files:**
- Create: `lib/line-dispatch.ts`
- Test: `lib/line-dispatch.test.ts`

**Interfaces:**
- Consumes: all handler modules (Tasks 9–10); `readFlowSession` (Task 6); `classifyText`, `commandRoute`, `type Route` (Task 7); `decodePostback`, `textMessage` (Task 4); `buildMenuMessage`, `buildAmbiguityMessage`, `menuGoRoute`, `HINT_TEXT`, `NO_TRIP_TEXT` (Task 8); `type LineEvent` (Task 1); `HandlerCtx`, `PostbackData` (Task 9); `type Trip`
- Produces:
  - `isHandledEvent(e: LineEvent): boolean`. True for text and image messages, and for postbacks that carry data. False only when the source has no `userId`, `groupId` or `roomId`; a group/room event without a `userId` is still handled.
  - `dispatchEvent(ctx: HandlerCtx): Promise<void>` (spec signature, trip already known)
  - `type BaseCtx = Omit<HandlerCtx, "trip">`
  - `dispatchEventWithTrip(base: BaseCtx, loadTrip: () => Promise<Trip | null>): Promise<void>`. Classifies first and calls `loadTrip` at most once, only when the event needs a trip. The webhook uses this one.

Routing rules:
- **Postback.** `a === "menu"` → reply the menu. `menu_go` → `menuGoRoute`. `amb_expense` → `flow_conflict` if a flow session exists, otherwise `expense_new` (both with `q`). `amb_go` → `commandRoute(t, q)`. Every other prefix (`x_` `plan_` `bk_` `pl_` `qi_`/`qn_` `tr_`) needs a trip and goes to that feature's `handlePostback`. Unknown prefixes are ignored.
- **Image.** Needs a trip, then `expense.handleImage`.
- **Text.** `readFlowSession(userKey, now)` → `expense.flowAnswerPredicate` (or `() => false`) → `classifyText` with `dateCtx: null` → `routeTo`.
- **`routeTo`.** `menu`, `hint` and `ignore` don't need a trip and never load it. Every other route kind replies `NO_TRIP_TEXT` when `trip === null`. `ambiguous` → the question message. The expense route kinds go to `expense.handleRoute`. `info` and `notes` go to `info.handleRoute`.

- [ ] **Step 1: Write the failing tests**

Create `lib/line-dispatch.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/line-handlers/expense", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn(), handleImage: vi.fn(), flowAnswerPredicate: vi.fn() }));
vi.mock("@/lib/line-handlers/plan", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-handlers/booking", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-handlers/places", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-handlers/info", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-handlers/transport", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-session", () => ({ readFlowSession: vi.fn() }));

import * as expense from "@/lib/line-handlers/expense";
import * as plan from "@/lib/line-handlers/plan";
import * as booking from "@/lib/line-handlers/booking";
import * as places from "@/lib/line-handlers/places";
import * as info from "@/lib/line-handlers/info";
import * as transport from "@/lib/line-handlers/transport";
import { readFlowSession } from "@/lib/line-session";
import { dispatchEvent, dispatchEventWithTrip, isHandledEvent, type BaseCtx } from "./line-dispatch";
import type { HandlerCtx } from "@/lib/line-handlers/types";
import type { LineEvent } from "@/lib/line";
import type { Trip, LineSession } from "@/lib/models/types";
import { encodePostback, textMessage, type FlexNode } from "@/lib/line-flex";
import { HINT_TEXT, NO_TRIP_TEXT } from "@/lib/line-menu";

const TRIP: Trip = {
  id: "t1", name: "ฮ่องกง", destination: "Hong Kong", start_date: "2026-11-19", end_date: "2026-11-24",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const NOW = new Date("2026-11-20T03:00:00.000Z");
const SOURCE = { type: "group", groupId: "g1", userId: "u1" };
const KEY = "group:g1:user:u1";
const SESSION: LineSession = { id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_name", updated_at: NOW.toISOString(), data: {} };

function ctxFor(event: LineEvent, over: Partial<HandlerCtx> = {}): HandlerCtx {
  return {
    event, replyToken: "rt", accessToken: "tok", origin: "https://app.test", now: NOW,
    userKey: KEY, isGroup: true, trip: TRIP, reply: vi.fn(async () => {}), ...over,
  };
}
const textEvent = (text: string): LineEvent => ({ type: "message", replyToken: "rt", source: SOURCE, message: { id: "m1", type: "text", text } });
const imageEvent = (): LineEvent => ({ type: "message", replyToken: "rt", source: SOURCE, message: { id: "m2", type: "image" } });
const postbackEvent = (data: Record<string, string>): LineEvent => ({ type: "postback", replyToken: "rt", source: SOURCE, postback: { data: encodePostback(data) } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFlowSession).mockResolvedValue(null);
  vi.mocked(expense.flowAnswerPredicate).mockResolvedValue(() => false);
});

describe("isHandledEvent", () => {
  it("accepts text, image and postback events", () => {
    expect(isHandledEvent(textEvent("hi"))).toBe(true);
    expect(isHandledEvent(imageEvent())).toBe(true);
    expect(isHandledEvent(postbackEvent({ a: "menu" }))).toBe(true);
  });

  it("rejects other events", () => {
    expect(isHandledEvent({ type: "follow", source: SOURCE })).toBe(false);
    expect(isHandledEvent({ type: "message", source: SOURCE, message: { id: "x", type: "sticker" } })).toBe(false);
    expect(isHandledEvent({ type: "postback", source: SOURCE })).toBe(false);
  });

  it("handles group/room events with no userId (member hasn't accepted OA terms)", () => {
    expect(isHandledEvent({ type: "message", replyToken: "rt", source: { type: "group", groupId: "g1" }, message: { id: "m1", type: "text", text: "แพลน" } })).toBe(true);
    expect(isHandledEvent({ type: "message", replyToken: "rt", source: { type: "room", roomId: "r1" }, message: { id: "m1", type: "text", text: "แพลน" } })).toBe(true);
  });

  it("skips events whose source has no id at all", () => {
    expect(isHandledEvent({ type: "message", replyToken: "rt", source: { type: "user" }, message: { id: "m1", type: "text", text: "แพลน" } })).toBe(false);
  });
});

describe("dispatchEventWithTrip (lazy trip)", () => {
  function baseFor(event: LineEvent, over: Partial<BaseCtx> = {}): BaseCtx {
    return { event, replyToken: "rt", accessToken: "tok", origin: "https://app.test", now: NOW, userKey: KEY, isGroup: true, reply: vi.fn(async () => {}), ...over };
  }

  it("never loads the trip for small talk, hints or the menu", async () => {
    const loadTrip = vi.fn(async () => TRIP);
    await dispatchEventWithTrip(baseFor(textEvent("สวัสดี")), loadTrip);
    await dispatchEventWithTrip(baseFor(textEvent("สวัสดี"), { isGroup: false }), loadTrip);
    await dispatchEventWithTrip(baseFor(textEvent("เมนู")), loadTrip);
    await dispatchEventWithTrip(baseFor(postbackEvent({ a: "menu" })), loadTrip);
    expect(loadTrip).not.toHaveBeenCalled();
  });

  it("loads the trip once and passes it to the handler", async () => {
    const loadTrip = vi.fn(async () => TRIP);
    const base = baseFor(textEvent("แพลน"));
    await dispatchEventWithTrip(base, loadTrip);
    expect(loadTrip).toHaveBeenCalledTimes(1);
    expect(plan.handleRoute).toHaveBeenCalledWith({ ...base, trip: TRIP }, { kind: "plan", rest: "" });
  });

  it("loads the trip only once even when the flow predicate also needs it", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(SESSION);
    vi.mocked(expense.flowAnswerPredicate).mockResolvedValue(() => true);
    const loadTrip = vi.fn(async () => TRIP);
    await dispatchEventWithTrip(baseFor(textEvent("เก่ง")), loadTrip);
    expect(loadTrip).toHaveBeenCalledTimes(1);
    expect(expense.handleRoute).toHaveBeenCalledTimes(1);
  });
});

describe("postbacks", () => {
  it.each([
    ["x_payer", expense],
    ["plan_open", plan],
    ["bk_open", booking],
    ["pl_visit", places],
    ["qi_open", info],
    ["qn_full", info],
    ["tr_open", transport],
  ])("%s goes to its feature's handlePostback", async (a, mod) => {
    const ctx = ctxFor(postbackEvent({ a, id: "1" }));
    await dispatchEvent(ctx);
    expect(mod.handlePostback).toHaveBeenCalledWith(ctx, { a, id: "1" });
  });

  it("ignores an unknown prefix", async () => {
    const ctx = ctxFor(postbackEvent({ a: "zz_what" }));
    await dispatchEvent(ctx);
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(plan.handlePostback).not.toHaveBeenCalled();
  });

  it("feature postbacks need an active trip", async () => {
    const ctx = ctxFor(postbackEvent({ a: "bk_open" }), { trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(NO_TRIP_TEXT)]);
    expect(booking.handlePostback).not.toHaveBeenCalled();
  });

  it("menu replies the menu carousel even without a trip", async () => {
    const ctx = ctxFor(postbackEvent({ a: "menu" }), { trip: null });
    await dispatchEvent(ctx);
    const [msgs] = vi.mocked(ctx.reply).mock.calls[0] as [FlexNode[]];
    expect(msgs[0].type).toBe("flex");
    expect((msgs[0].contents as FlexNode).type).toBe("carousel");
  });

  it("menu_go runs the shortcut's route", async () => {
    const ctx = ctxFor(postbackEvent({ a: "menu_go", t: "places", k: "w" }));
    await dispatchEvent(ctx);
    expect(places.handleRoute).toHaveBeenCalledWith(ctx, { kind: "places", placeKind: "w", rest: "" });
  });

  it("amb_expense starts a new expense when no flow is pending", async () => {
    const ctx = ctxFor(postbackEvent({ a: "amb_expense", q: "ตั๋วรถ 50" }));
    await dispatchEvent(ctx);
    expect(expense.handleRoute).toHaveBeenCalledWith(ctx, { kind: "expense_new", text: "ตั๋วรถ 50" });
  });

  it("amb_expense becomes flow_conflict when a flow is pending", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(SESSION);
    const ctx = ctxFor(postbackEvent({ a: "amb_expense", q: "ตั๋วรถ 50" }));
    await dispatchEvent(ctx);
    expect(expense.handleRoute).toHaveBeenCalledWith(ctx, { kind: "flow_conflict", text: "ตั๋วรถ 50" });
  });

  it("amb_go routes to the command with the original text", async () => {
    const ctx = ctxFor(postbackEvent({ a: "amb_go", t: "booking", q: "ตั๋วรถ 50" }));
    await dispatchEvent(ctx);
    expect(booking.handleRoute).toHaveBeenCalledWith(ctx, { kind: "booking", rest: "รถ 50" });
  });

  it("amb_go with a bad target does nothing", async () => {
    const ctx = ctxFor(postbackEvent({ a: "amb_go", t: "nope", q: "x" }));
    await dispatchEvent(ctx);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe("images", () => {
  it("go to expense.handleImage", async () => {
    const ctx = ctxFor(imageEvent());
    await dispatchEvent(ctx);
    expect(expense.handleImage).toHaveBeenCalledWith(ctx);
  });

  it("need an active trip", async () => {
    const ctx = ctxFor(imageEvent(), { trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(NO_TRIP_TEXT)]);
    expect(expense.handleImage).not.toHaveBeenCalled();
  });
});

describe("text", () => {
  it("reads the flow session by userKey and routes a view command", async () => {
    const ctx = ctxFor(textEvent("แพลน พรุ่งนี้"));
    await dispatchEvent(ctx);
    expect(readFlowSession).toHaveBeenCalledWith(KEY, NOW);
    expect(plan.handleRoute).toHaveBeenCalledWith(ctx, { kind: "plan", rest: "พรุ่งนี้" });
  });

  it("asks the expense flow whether the text answers it", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(SESSION);
    vi.mocked(expense.flowAnswerPredicate).mockResolvedValue(() => true);
    const ctx = ctxFor(textEvent("เก่ง"));
    await dispatchEvent(ctx);
    expect(expense.flowAnswerPredicate).toHaveBeenCalledWith(ctx, SESSION);
    expect(expense.handleRoute).toHaveBeenCalledWith(ctx, { kind: "flow_answer" });
  });

  it("does not ask the predicate when there is no session", async () => {
    const ctx = ctxFor(textEvent("เก่ง"));
    await dispatchEvent(ctx);
    expect(expense.flowAnswerPredicate).not.toHaveBeenCalled();
  });

  it("sends info and notes to the info handler", async () => {
    const a = ctxFor(textEvent("ข้อมูล wifi"));
    await dispatchEvent(a);
    expect(info.handleRoute).toHaveBeenCalledWith(a, { kind: "info", rest: "wifi" });
    const b = ctxFor(textEvent("โน้ต"));
    await dispatchEvent(b);
    expect(info.handleRoute).toHaveBeenCalledWith(b, { kind: "notes", rest: "" });
  });

  it("routes transport and expense_new", async () => {
    const a = ctxFor(textEvent("รอบต่อไป"));
    await dispatchEvent(a);
    expect(transport.handleRoute).toHaveBeenCalledWith(a, { kind: "transport", rest: "", next: true });
    const b = ctxFor(textEvent("120 ข้าว"));
    await dispatchEvent(b);
    expect(expense.handleRoute).toHaveBeenCalledWith(b, { kind: "expense_new", text: "120 ข้าว" });
  });

  it("asks expense-or-command for ambiguous text", async () => {
    const ctx = ctxFor(textEvent("ตั๋วรถ 50"));
    await dispatchEvent(ctx);
    const [msgs] = vi.mocked(ctx.reply).mock.calls[0] as [FlexNode[]];
    expect(msgs[0].type).toBe("text");
    expect(((msgs[0].quickReply as FlexNode).items as unknown[]).length).toBe(2);
    expect(booking.handleRoute).not.toHaveBeenCalled();
  });

  it("stays silent on small talk in a group", async () => {
    const ctx = ctxFor(textEvent("สวัสดี"), { isGroup: true });
    await dispatchEvent(ctx);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("hints on small talk in 1:1, even without a trip", async () => {
    const ctx = ctxFor(textEvent("สวัสดี"), { isGroup: false, trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(HINT_TEXT)]);
  });

  it("menu works without a trip", async () => {
    const ctx = ctxFor(textEvent("เมนู"), { trip: null });
    await dispatchEvent(ctx);
    const [msgs] = vi.mocked(ctx.reply).mock.calls[0] as [FlexNode[]];
    expect(msgs[0].type).toBe("flex");
  });

  it("trip-dependent routes reply the no-trip message", async () => {
    const ctx = ctxFor(textEvent("แพลน"), { trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(NO_TRIP_TEXT)]);
    expect(plan.handleRoute).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- lib/line-dispatch.test.ts`
Expected: FAIL, with `Failed to resolve import "./line-dispatch"`.

- [ ] **Step 3: Implement**

Create `lib/line-dispatch.ts`:

```ts
import * as expense from "@/lib/line-handlers/expense";
import * as plan from "@/lib/line-handlers/plan";
import * as booking from "@/lib/line-handlers/booking";
import * as places from "@/lib/line-handlers/places";
import * as info from "@/lib/line-handlers/info";
import * as transport from "@/lib/line-handlers/transport";
import { readFlowSession } from "@/lib/line-session";
import { classifyText, commandRoute, type Route } from "@/lib/line-router";
import { decodePostback, textMessage } from "@/lib/line-flex";
import { buildMenuMessage, buildAmbiguityMessage, menuGoRoute, HINT_TEXT, NO_TRIP_TEXT } from "@/lib/line-menu";
import type { LineEvent } from "@/lib/line";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Trip } from "@/lib/models/types";

// One LINE event -> the feature handler that owns it. Features never touch
// this file; they only replace their own lib/line-handlers/<feature>.ts.
//
// The trip is loaded lazily: small talk, hints and the menu never touch the
// trips sheet. `withTrip()` loads it at most once per event.

export type BaseCtx = Omit<HandlerCtx, "trip">;
type WithTrip = () => Promise<HandlerCtx>;

// LINE omits userId for group/room members who haven't accepted the OA
// terms -- those still work (userKey falls back to a shared "unknown" key).
// Only an event with no source id at all is skipped.
export function isHandledEvent(e: LineEvent): boolean {
  const src = e.source;
  if (!src?.userId && !src?.groupId && !src?.roomId) return false;
  if (e.type === "postback") return !!e.postback?.data;
  return e.type === "message" && (e.message?.type === "text" || e.message?.type === "image");
}

// Spec signature: the trip is already known.
export async function dispatchEvent(ctx: HandlerCtx): Promise<void> {
  const { trip, ...base } = ctx;
  await dispatchEventWithTrip(base, async () => trip);
}

// Used by the webhook: loadTrip() runs only if the event needs the trip.
export async function dispatchEventWithTrip(base: BaseCtx, loadTrip: () => Promise<Trip | null>): Promise<void> {
  let full: Promise<HandlerCtx> | null = null;
  const withTrip: WithTrip = () => (full ??= loadTrip().then((trip) => ({ ...base, trip })));

  const { event } = base;
  if (event.type === "postback") {
    await dispatchPostback(base, withTrip, decodePostback(event.postback?.data ?? ""));
    return;
  }
  if (event.type !== "message") return;
  if (event.message?.type === "image") {
    const ctx = await withTrip();
    if (!ctx.trip) {
      await ctx.reply([textMessage(NO_TRIP_TEXT)]);
      return;
    }
    await expense.handleImage(ctx);
    return;
  }
  if (event.message?.type === "text") await dispatchText(base, withTrip, event.message.text ?? "");
}

async function dispatchText(base: BaseCtx, withTrip: WithTrip, text: string): Promise<void> {
  const session = await readFlowSession(base.userKey, base.now);
  // A pending flow belongs to a trip anyway, so loading it here is fine.
  const isFlowAnswer = session ? await expense.flowAnswerPredicate(await withTrip(), session) : () => false;
  // dateCtx null: the route doesn't depend on trip dates (see lib/line-router.ts),
  // which is what lets us classify before loading the trip.
  const route = classifyText(text, { flowStep: session?.step ?? null, isFlowAnswer, isGroup: base.isGroup, dateCtx: null });
  await routeTo(base, withTrip, route);
}

type AmbiguousTarget = "booking" | "places" | "transport";
function isAmbiguousTarget(t: string | undefined): t is AmbiguousTarget {
  return t === "booking" || t === "places" || t === "transport";
}

function postbackHandler(a: string): ((ctx: HandlerCtx, data: PostbackData) => Promise<void>) | null {
  if (a.startsWith("x_")) return expense.handlePostback;
  if (a.startsWith("plan_")) return plan.handlePostback;
  if (a.startsWith("bk_")) return booking.handlePostback;
  if (a.startsWith("pl_")) return places.handlePostback;
  if (a.startsWith("qi_") || a.startsWith("qn_")) return info.handlePostback;
  if (a.startsWith("tr_")) return transport.handlePostback;
  return null;
}

async function dispatchPostback(base: BaseCtx, withTrip: WithTrip, data: PostbackData): Promise<void> {
  const a = data.a ?? "";

  if (a === "menu") {
    await base.reply([buildMenuMessage()]);
    return;
  }
  if (a === "menu_go") {
    const route = menuGoRoute(data);
    if (route) await routeTo(base, withTrip, route);
    return;
  }
  if (a === "amb_expense") {
    const q = data.q ?? "";
    const session = await readFlowSession(base.userKey, base.now);
    await routeTo(base, withTrip, session ? { kind: "flow_conflict", text: q } : { kind: "expense_new", text: q });
    return;
  }
  if (a === "amb_go") {
    if (isAmbiguousTarget(data.t)) await routeTo(base, withTrip, commandRoute(data.t, data.q ?? ""));
    return;
  }

  const handler = postbackHandler(a);
  if (!handler) return;
  const ctx = await withTrip();
  if (!ctx.trip) {
    await ctx.reply([textMessage(NO_TRIP_TEXT)]);
    return;
  }
  await handler(ctx, data);
}

async function routeTo(base: BaseCtx, withTrip: WithTrip, route: Route): Promise<void> {
  // Routes that work without an active trip -- and never load it.
  if (route.kind === "menu") {
    await base.reply([buildMenuMessage()]);
    return;
  }
  if (route.kind === "hint") {
    await base.reply([textMessage(HINT_TEXT)]);
    return;
  }
  if (route.kind === "ignore") return;

  const ctx = await withTrip();
  if (!ctx.trip) {
    await ctx.reply([textMessage(NO_TRIP_TEXT)]);
    return;
  }

  switch (route.kind) {
    case "ambiguous":
      await ctx.reply([buildAmbiguityMessage(route.target, route.text)]);
      return;
    case "flow_answer":
    case "expense_new":
    case "flow_conflict":
    case "flow_reask":
      await expense.handleRoute(ctx, route);
      return;
    case "plan":
      await plan.handleRoute(ctx, route);
      return;
    case "booking":
      await booking.handleRoute(ctx, route);
      return;
    case "places":
      await places.handleRoute(ctx, route);
      return;
    case "info":
    case "notes":
      await info.handleRoute(ctx, route);
      return;
    case "transport":
      await transport.handleRoute(ctx, route);
      return;
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- lib/line-dispatch.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (test files included). Fix any type error before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/line-dispatch.ts lib/line-dispatch.test.ts
git commit -m "feat(line): event dispatch for postback prefixes, images and routed text" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Thin webhook route + full verification

**Files:**
- Rewrite: `app/api/line/webhook/route.ts`

**Interfaces:**
- Consumes: `ensureTabs`, `listRows` (`@/lib/store`); `verifyLineSignature`, `replyLineMessages`, `userKey`, `isGroupChat`, `type LineEvent` (`@/lib/line`); `dispatchEventWithTrip`, `isHandledEvent`, `type BaseCtx` (Task 11); `type FlexNode`; `type Trip`
- Produces: `POST(req: NextRequest)`, which keeps its current behavior. It verifies the signature (401), checks the config (500) and parses the body (400). Otherwise it always returns 200, because everything after the JSON parse (filtering, `ensureTabs`, per-event ctx construction and dispatch) runs inside try/catch. Events are handled in parallel, each in its own try. The trip loads lazily through `dispatchEventWithTrip`, from a 30-second module-level cache that holds only a found active trip. "No active trip" and failed reads are never cached.

- [ ] **Step 1: Read the route-handler doc for this Next.js version**

Run: `head -80 node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
Expected: the doc prints. Confirm that `export async function POST(request)` plus `NextRequest` / `NextResponse` are still the documented API (the current file already uses them, so no API change is expected).

- [ ] **Step 2: Rewrite the route**

Replace the whole contents of `app/api/line/webhook/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureTabs, listRows } from "@/lib/store";
import { verifyLineSignature, replyLineMessages, userKey, isGroupChat, type LineEvent } from "@/lib/line";
import { dispatchEventWithTrip, isHandledEvent, type BaseCtx } from "@/lib/line-dispatch";
import type { FlexNode } from "@/lib/line-flex";
import type { Trip } from "@/lib/models/types";

const MAX_REPLY_MESSAGES = 5;
const TRIPS_CACHE_MS = 30_000;

let tabsReady: Promise<void> | null = null;
const ready = () => (tabsReady ??= ensureTabs());

// Per-instance cache of the ACTIVE trip only: a busy chat shouldn't re-read
// the trips tab on every message. "No active trip" is never cached, so
// switching a trip to "กำลังเที่ยว" in the app works on the very next
// message; other edits to the active trip show up within 30 seconds.
let activeTripCache: { at: number; trip: Trip } | null = null;

async function loadActiveTrip(now: Date): Promise<Trip | null> {
  const nowMs = now.getTime();
  if (activeTripCache && nowMs - activeTripCache.at <= TRIPS_CACHE_MS) return activeTripCache.trip;
  const trip = (await listRows<Trip>("trips")).find((t) => t.status === "active") ?? null;
  activeTripCache = trip ? { at: nowMs, trip } : null;
  return trip;
}

// No auth guard, matching every other route here (see middleware.ts) --
// LINE's signature check (verifyLineSignature) is what actually gates this
// one, since the URL itself is public. Everything past verification lives
// in lib/line-dispatch.ts.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");
  if (!verifyLineSignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "LINE not configured" }, { status: 500 });

  let body: { events?: LineEvent[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // From here on LINE always gets a 200: it retries non-2xx responses, which
  // would replay the whole batch (including events that already saved).
  try {
    // No replyToken = nothing we can answer (reply-only bot). isHandledEvent
    // also drops events whose source has no id at all.
    const events = (body.events ?? []).filter((e) => isHandledEvent(e) && !!e.replyToken);
    if (events.length === 0) return NextResponse.json({ ok: true });

    await ready();
    const origin = req.nextUrl.origin;
    const now = new Date();

    // Handle events in parallel; one failing event never fails the batch.
    await Promise.all(
      events.map(async (event) => {
        try {
          const replyToken = event.replyToken as string;
          const base: BaseCtx = {
            event,
            replyToken,
            accessToken,
            origin,
            now,
            userKey: userKey(event.source),
            isGroup: isGroupChat(event.source),
            reply: (messages: FlexNode[]) => replyLineMessages(replyToken, messages.slice(0, MAX_REPLY_MESSAGES), accessToken),
          };
          await dispatchEventWithTrip(base, () => loadActiveTrip(now));
        } catch (err) {
          console.error("LINE event handling failed", err);
        }
      }),
    );
  } catch (err) {
    console.error("LINE webhook failed", err);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint the touched code**

Run: `npx eslint lib/line.ts lib/line-text.ts lib/line-date.ts lib/line-flex.ts lib/line-maps.ts lib/line-session.ts lib/line-router.ts lib/line-menu.ts lib/line-dispatch.ts lib/line-handlers app/api/line/webhook/route.ts`
Expected: no errors. If `@typescript-eslint/no-unused-vars` flags a test-only variable, remove that variable. Don't disable the rule.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS. That covers every pre-existing test plus the new `line-*`, `line-handlers/*` and `mappers` tests.

- [ ] **Step 6: Confirm there are no leftover references to the old in-route flow**

Run: `git grep -n "sourceKey\|handleImageMessage\|handleTextMessage" -- app lib`
Expected: only `lib/line.ts` (the `sourceKey` definition, kept per spec) and `lib/line.test.ts` (its tests). Nothing under `app/`.

- [ ] **Step 7: Commit**

```bash
git add app/api/line/webhook/route.ts
git commit -m "refactor(line): webhook verifies, builds handler context, dispatches" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Post-deploy notes (for the human, no code)

- The existing `line_sessions` sheet tab has no `data` header cell. Rows still read and write correctly: `data` lands in column F, and old rows read as `[]`, which is normalized. You can optionally type `data` into cell F1 by hand for readability.
- Sessions written before this deploy are keyed by the old `sourceKey` (`group:{id}`), so they're orphaned. Any slip mid-conversation at deploy time stays in the in-app pending queue, and the user just re-sends the photo.
- Until the feature plans land, view commands (`แพลน`, `ร้าน`, `จอง`, …) reply `ฟีเจอร์นี้กำลังพัฒนา` **only in 1:1**. In the group they are silent, and so are typed amounts. In the group the bot can still say three things: the slip-photo flow, the `เมนู`/`?` card, and the spec-mandated expense/command question for collision text like `ตั๋วรถ 50` or `กินข้าว 120`.
