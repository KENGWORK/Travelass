# LINE Plan View + Transport View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the LINE bot answer `แพลน` / `plan` / `#n` / `ต่อไป` / `ตอนนี้` (day overview, item detail, photo album, done ⇄ undone toggle) and `เดินทาง` / `รอบต่อไป` / `รถรอบถัดไป` (transport list, search, next departure with countdown, directions buttons) from the active trip.

**Architecture:** Four new pure modules (no I/O, fully unit-tested with vitest): `lib/line-plan.ts` (query parsing on top of `extractDate`, day/plan selection, next/current item), `lib/line-plan-messages.ts` (Flex builders + small shared Flex helpers), `lib/line-transport.ts` (departure maths, mode icons, search), `lib/line-transport-messages.ts` (Flex builders). The two foundation stub handlers `lib/line-handlers/plan.ts` and `lib/line-handlers/transport.ts` are **replaced entirely** with I/O glue that reads `lib/store` rows, reads/writes the `{userKey}#ctx` session through `lib/line-session`, and replies through `ctx.reply`.

**Tech Stack:** Next.js 16 (App Router, server route only — no UI changes), TypeScript (strict), Vitest 4 + jsdom, LINE Messaging API Flex Messages.

**Specs:** `docs/superpowers/specs/2026-11-21-line-bot-shared-design.md` (shared contract — **wins on any conflict**), `docs/superpowers/specs/2026-11-19-line-plan-view-design.md`, `docs/superpowers/specs/2026-11-19-line-transport-view-design.md`. User doc: `docs/line-bot-how-to.md` sections 2 and 7.

**PREREQUISITE — foundation plan already executed:** `docs/superpowers/plans/2026-11-21-line-foundation.md` must be fully implemented before starting. Every module and signature listed in the shared spec exists exactly as specified, in particular:

- `lib/line-date.ts`: `TripDateCtx`, `todayInTz(tz, now)`, `nowHHMMInTz(tz, now)`, `tripDateCtx(trip, now)`, `extractDate(text, ctx) → { date, rest, outOfRange }`, `tripDayIndex(date, start)`, `addDays(date, n)`, `thaiDateLabel(date)` (2026-11-20 is a Friday → `"ศ 20 พ.ย."`; tests here always compute labels through `thaiDateLabel`, never hard-code them)
- `lib/line-flex.ts`: `CLAY`, `FlexNode`, `txt`, `compact`, `encodePostback`, `decodePostback`, `postbackAction`, `uriAction`, `imageUrl`, `buildPhotoAlbum` (returns a bare `carousel`, not a message), `flexMessage`, `textMessage`, `quickReply`
- `lib/line-maps.ts`: `mapButtons({ query, mapsLink?, directions?: { mode } })` — with `directions` it builds the Google directions URL itself via the exported `toTravelMode(mode)`, so callers pass the raw transport `mode`
- `lib/line-router.ts`: `Route` (`{ kind: "plan"; rest }`, `{ kind: "transport"; rest; next }`). Per foundation decision 1, for `แพลน`/`plan` `rest` is the text after the keyword; for `ต่อไป` `next` `ตอนนี้` `now` `#<n>` `rest` is the whole polite-stripped text including the token (`"ต่อไป"`, `"#2"`). Per decision 2, `rest` is never date-stripped — handlers call `extractDate`.
- `lib/line-session.ts`: `readCtx(key)`, `writeCtx(key, tripId, patch, now)` — both append `#ctx` to `key` themselves, so handlers pass plain `ctx.userKey`; `writeCtx` drops old data when the trip changes
- `lib/line-menu.ts`: `NO_TRIP_TEXT`
- `lib/line-handlers/types.ts`: `HandlerCtx`, `PostbackData`
- `lib/line-dispatch.ts` routes `plan_*` postbacks to `plan.handlePostback`, `tr_*` to `transport.handlePostback`, and `route.kind === "plan" | "transport"` to the matching `handleRoute`
- `lib/line-handlers/plan.ts` and `lib/line-handlers/transport.ts` exist as stubs, and `lib/line-handlers/stubs.test.ts` asserts they reply `WIP_TEXT` (Tasks 4 and 7 remove those two entries)
- The booking feature sends `a=plan_detail&i=<itinerary_id>&d=<day_date>` — the plan handler supports exactly that shape

This plan does **not** re-implement or edit any of those modules, nor the router, dispatch, or webhook route.

## Global Constraints

- Shared spec wins over the feature specs: postback action prefixes are `plan_` and `tr_` only; "last viewed day" lives in the ctx session (`{userKey}#ctx`, `data.lastPlanDate`), never in the expense flow session; dates are parsed only via `extractDate` from `lib/line-date` (no `lib/line-date-parse.ts`, no `lib/line-transport-parse.ts`); map buttons only via `mapButtons`; albums only via `buildPhotoAlbum`; the router owns keyword detection, `ขอดู`/`ขอ` stripping and the expense-ambiguity prompt, and hands handlers `rest`.
- Do not modify `lib/line-router.ts`, `lib/line-dispatch.ts`, `app/api/line/webhook/route.ts`, or any foundation module. Only the files listed in "File Structure" are touched.
- Pure modules (`lib/line-plan*.ts`, `lib/line-transport*.ts`) import nothing that does I/O (no `@/lib/store`, no `@/lib/line-session`, no `fetch`).
- Handlers reply first, then write the ctx row inside try/catch (`remember`): a Sheets failure never suppresses the answer. The ctx row stores `lastPlanDate` and `lastPlanId` (alt plan id, `""` for the main plan) so `แพลน n` / `#n` numbers items like the card last shown.
- An alt plan viewed today gets no "ต่อไป" highlight and no "จบแพลนวันนี้แล้ว" banner. A stale `ดูต่อ` page is clamped to the last page.
- Handlers do not `import "server-only"` (the `server-only` package throws under vitest); `@/lib/store` already carries that guard.
- "Today" / "now" always come from `tripDateCtx(trip, ctx.now).today` (= `todayInTz(trip.trip_timezone, ctx.now)`) / `nowHHMMInTz(trip.trip_timezone, ctx.now)`.
- Plan item order = sort by `time` (blank last) then `sort_order`; the 1-based position after sorting is the number used by `แพลน n` / `#n`.
- LINE may only flip `status` `planned → done` and `done → planned`; the handler re-reads the row and writes only if the status still equals the one the button was drawn for. No skip / move / switch-active-plan in LINE. Alt plans are view-only — no "use this plan" button.
- Transport output never contains `paid`, `pay_timing`, or `slip_photo_ids` data.
- Google directions URL has `destination` + `travelmode` only, never `origin` (built by `mapButtons` from `{ query: t.to, directions: { mode: t.mode } }`).
- Countdown is minutes from now to the next departure in trip time; a departure earlier than now (past midnight) shows no countdown.
- Flex limits: carousel ≤ 12 bubbles, no empty text node (`txt()` returns `null` for empty → always wrap child arrays in `compact`), altText ≤ 400 chars, postback data ≤ 300 chars, quick reply ≤ 13 items.
- Overview/list cards show at most 15 rows per page (`PAGE_SIZE = 15`) with a `ดูต่อ` button for the next page.
- No-trip text: import `NO_TRIP_TEXT` from `@/lib/line-menu` (value `ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ`); do not redefine it.
- `travelmode` grouping is owned by foundation `toTravelMode` (used inside `mapButtons`); this plan does not define its own.
- `npx tsc --noEmit` must pass after EVERY task commit (each task's verify step runs it). Final verification is vitest + `npx tsc --noEmit` + `npm run lint`. Do not start a local dev server or browser preview.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/line-test-helpers.ts` | Create (Task 2) | Test-only walkers over Flex JSON (`texts`, `actions`, `labels`, `findNode`, `hasEmptyText`). Not a `*.test.ts` file, so vitest never runs it directly. |
| `lib/line-plan.ts` | Create (Task 1) | `parsePlanQuery`, `itemsForDay`, `plansForDay`, `activePlanFor`, `sortItems`, `nextItemIndex`, `currentItemIndex`, `isDayFinished`, `inTrip`, `tripDates`, `dayWindow`, `resolveIndexDate`, `neighbors` |
| `lib/line-plan-messages.ts` | Create (Task 2), extend (Task 3) | Shared Flex helpers (`btn`, `btnRow`, `section`, `trunc`, `dm`, `needsReadMore`, `tripRangeText`, `albumMessage`, `buildDayPicker`, `PAGE_SIZE`) + `buildPlanOverview`, `buildAltPicker`, `buildPlanDetail` |
| `lib/line-handlers/plan.ts` | Replace (Task 4) | `handleRoute` / `handlePostback` for the plan feature |
| `lib/line-transport.ts` | Create (Task 5) | `parseTransportQuery`, `runTransportSearch`, `departureTimes`, `effectiveDeparture`, `addMinutes`, `arrivalTime`, `isPast`, `sortTransports`, `nextTransport`, `countdown`, `modeIcon`, `searchTransports`, `transportDates` |
| `lib/line-handlers/stubs.test.ts` | Modify (Tasks 4, 7) | Drop the `plan` (Task 4) and `transport` (Task 7) entries — those files stop being stubs |
| `lib/line-transport-messages.ts` | Create (Task 6) | `buildTransportList`, `buildTransportDetail`, `buildPlanPicker` |
| `lib/line-handlers/transport.ts` | Replace (Task 7) | `handleRoute` / `handlePostback` for the transport feature |

Tests sit next to each module: `lib/line-plan.test.ts`, `lib/line-plan-messages.test.ts`, `lib/line-handlers/plan.test.ts`, `lib/line-transport.test.ts`, `lib/line-transport-messages.test.ts`, `lib/line-handlers/transport.test.ts`.

### Postback contract (produced by this plan)

| action | keys | handled by |
|---|---|---|
| `plan_overview` | `d` date, `p` plan id (only when viewing an alt plan), `n` page | plan |
| `plan_detail` | `i` item id, `d` date (fallback if the item was deleted) | plan |
| `plan_photos` / `plan_note` / `plan_done` / `plan_undone` | `i` | plan |
| `plan_alt` | `d` | plan |
| `tr_list` | `d` date **or** `q` query, `n` page | transport |
| `tr_detail` | `id`, plus the list's `d` or `q` (for "กลับรายการ") | transport |
| `tr_photos` / `tr_note` / `tr_plan` | `id` | transport |
| `bk_detail` | `b` booking id (emitted by the plan detail card; handled by the booking feature) | booking |

---

### Task 1: Plan query parsing and day selection (`lib/line-plan.ts`)

**Files:**
- Create: `lib/line-plan.ts`
- Test: `lib/line-plan.test.ts`

**Interfaces:**
- Consumes (foundation): `extractDate(text: string, ctx: TripDateCtx): { date: string | null; rest: string; outOfRange: boolean }`, `addDays(date: string, n: number): string`, `type TripDateCtx = { start: string; end: string; today: string }` from `@/lib/line-date`.
- Produces:
  - `type PlanQuery = { kind: "overview"; date: string | null } | { kind: "detail"; date: string | null; index: number } | { kind: "next" } | { kind: "now" } | { kind: "out_of_range" } | { kind: "bad_date" }`
  - `parsePlanQuery(rest: string, ctx: TripDateCtx): PlanQuery`
  - `inTrip(date: string, start: string, end: string): boolean`
  - `plansForDay(dayPlans: DayPlan[], date: string): DayPlan[]` (sorted by `sort_order`)
  - `activePlanFor(dayPlans: DayPlan[], date: string): DayPlan | null`
  - `sortItems(items: ItineraryItem[]): ItineraryItem[]`
  - `itemsForDay(items: ItineraryItem[], dayPlans: DayPlan[], date: string, planId?: string): ItineraryItem[]`
  - `nextItemIndex(items: ItineraryItem[], nowHHMM: string): number | null` (0-based)
  - `currentItemIndex(items: ItineraryItem[], nowHHMM: string): number | null` (0-based)
  - `isDayFinished(items: ItineraryItem[], nowHHMM: string): boolean`
  - `tripDates(start: string, end: string): string[]`
  - `dayWindow(start: string, end: string, today: string, max: number): string[]`
  - `resolveIndexDate(qDate: string | null, lastPlanDate: string | null, today: string, start: string, end: string): string`
  - `neighbors(items: ItineraryItem[], id: string): { index: number; prevId: string | null; nextId: string | null }` (`index` 1-based, 0 if not found)

- [ ] **Step 1: Confirm the foundation is in place**

Run:
```bash
ls lib/line-date.ts lib/line-flex.ts lib/line-maps.ts lib/line-router.ts lib/line-session.ts lib/line-handlers/types.ts lib/line-handlers/plan.ts lib/line-handlers/transport.ts
grep -n "export function extractDate\|export function addDays\|export function tripDayIndex\|export function thaiDateLabel\|export function todayInTz\|export function nowHHMMInTz\|export function tripDateCtx" lib/line-date.ts
grep -n "export function toTravelMode\|export function mapButtons" lib/line-maps.ts
grep -n "export const NO_TRIP_TEXT" lib/line-menu.ts
grep -n "CTX_SUFFIX" lib/line-session.ts
```
Expected: all 8 paths listed; 7 matches in line-date, 2 in line-maps, 1 in line-menu, at least 1 in line-session. If anything is missing, stop — the foundation plan has not been executed.

- [ ] **Step 2: Write the failing test**

```ts
// lib/line-plan.test.ts
import { describe, it, expect } from "vitest";
import type { DayPlan, ItineraryItem } from "@/lib/models/types";
import {
  parsePlanQuery,
  inTrip,
  plansForDay,
  activePlanFor,
  sortItems,
  itemsForDay,
  nextItemIndex,
  currentItemIndex,
  isDayFinished,
  tripDates,
  dayWindow,
  resolveIndexDate,
  neighbors,
} from "./line-plan";

// Trip Thu 19 – Mon 23 Nov 2026; "today" is Fri 20 Nov.
const CTX = { start: "2026-11-19", end: "2026-11-23", today: "2026-11-20" };

function item(over: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", time: "", end_time: "", title: "t", place: "",
    maps_link: "", notes: "", status: "planned", moved_to_date: "", linked_transport_id: "",
    linked_booking_id: "", sort_order: 0, photo_ids: [], plan_id: "", ...over,
  };
}

function plan(over: Partial<DayPlan>): DayPlan {
  return { id: "p", trip_id: "t1", day_date: "2026-11-20", name: "แผนหลัก", sort_order: 0, is_active: false, ...over };
}

describe("parsePlanQuery", () => {
  it("empty rest is today's overview (date left null)", () => {
    expect(parsePlanQuery("", CTX)).toEqual({ kind: "overview", date: null });
  });
  it("relative days", () => {
    expect(parsePlanQuery("พรุ่งนี้", CTX)).toEqual({ kind: "overview", date: "2026-11-21" });
    expect(parsePlanQuery("เมื่อวาน", CTX)).toEqual({ kind: "overview", date: "2026-11-19" });
  });
  it("explicit dates in Thai and English forms", () => {
    expect(parsePlanQuery("20/11", CTX)).toEqual({ kind: "overview", date: "2026-11-20" });
    expect(parsePlanQuery("20 พ.ย.", CTX)).toEqual({ kind: "overview", date: "2026-11-20" });
    expect(parsePlanQuery("20 nov", CTX)).toEqual({ kind: "overview", date: "2026-11-20" });
  });
  it("trip day number", () => {
    expect(parsePlanQuery("วันที่ 3", CTX)).toEqual({ kind: "overview", date: "2026-11-21" });
    expect(parsePlanQuery("day 3", CTX)).toEqual({ kind: "overview", date: "2026-11-21" });
  });
  it("weekday name", () => {
    expect(parsePlanQuery("เสาร์", CTX)).toEqual({ kind: "overview", date: "2026-11-21" });
  });
  it("a lone 1–2 digit number or #n is an item index on the last viewed day", () => {
    expect(parsePlanQuery("2", CTX)).toEqual({ kind: "detail", date: null, index: 2 });
    expect(parsePlanQuery("#1", CTX)).toEqual({ kind: "detail", date: null, index: 1 });
    expect(parsePlanQuery("12", CTX)).toEqual({ kind: "detail", date: null, index: 12 });
  });
  it("date followed by an index", () => {
    expect(parsePlanQuery("พรุ่งนี้ 2", CTX)).toEqual({ kind: "detail", date: "2026-11-21", index: 2 });
    expect(parsePlanQuery("20/11 #3", CTX)).toEqual({ kind: "detail", date: "2026-11-20", index: 3 });
  });
  it("next / now tokens (any case)", () => {
    expect(parsePlanQuery("ต่อไป", CTX)).toEqual({ kind: "next" });
    expect(parsePlanQuery("NEXT", CTX)).toEqual({ kind: "next" });
    expect(parsePlanQuery("ตอนนี้", CTX)).toEqual({ kind: "now" });
    expect(parsePlanQuery("now", CTX)).toEqual({ kind: "now" });
  });
  it("a date outside the trip", () => {
    expect(parsePlanQuery("1/12", CTX)).toEqual({ kind: "out_of_range" });
  });
  it("unreadable text, index 0 and 3-digit numbers are bad dates", () => {
    expect(parsePlanQuery("ฝนตก", CTX)).toEqual({ kind: "bad_date" });
    expect(parsePlanQuery("0", CTX)).toEqual({ kind: "bad_date" });
    expect(parsePlanQuery("123", CTX)).toEqual({ kind: "bad_date" });
  });
});

describe("inTrip / tripDates / dayWindow", () => {
  it("inTrip is inclusive", () => {
    expect(inTrip("2026-11-19", CTX.start, CTX.end)).toBe(true);
    expect(inTrip("2026-11-23", CTX.start, CTX.end)).toBe(true);
    expect(inTrip("2026-11-24", CTX.start, CTX.end)).toBe(false);
  });
  it("tripDates lists every day", () => {
    expect(tripDates("2026-11-19", "2026-11-21")).toEqual(["2026-11-19", "2026-11-20", "2026-11-21"]);
  });
  it("dayWindow returns the whole trip when it fits", () => {
    expect(dayWindow(CTX.start, CTX.end, CTX.today, 13)).toHaveLength(5);
  });
  it("dayWindow slides to start at today, clamped to the trip end", () => {
    const w = dayWindow("2026-11-01", "2026-11-30", "2026-11-25", 13);
    expect(w).toHaveLength(13);
    expect(w[0]).toBe("2026-11-18");
    expect(w[12]).toBe("2026-11-30");
  });
  it("dayWindow starts at the trip start when today is outside", () => {
    expect(dayWindow("2026-11-01", "2026-11-30", "2026-12-25", 13)[0]).toBe("2026-11-01");
  });
});

describe("plansForDay / activePlanFor", () => {
  const plans = [
    plan({ id: "p2", sort_order: 1, name: "ฝนตก" }),
    plan({ id: "p1", sort_order: 0, is_active: true }),
    plan({ id: "p3", day_date: "2026-11-21", is_active: true }),
  ];
  it("filters by day and sorts by sort_order", () => {
    expect(plansForDay(plans, "2026-11-20").map((p) => p.id)).toEqual(["p1", "p2"]);
  });
  it("finds the active plan, or null when the day has none", () => {
    expect(activePlanFor(plans, "2026-11-20")?.id).toBe("p1");
    expect(activePlanFor(plans, "2026-11-22")).toBeNull();
  });
});

describe("sortItems / itemsForDay", () => {
  it("sorts by time, blank times last, ties by sort_order", () => {
    const sorted = sortItems([
      item({ id: "late", time: "14:00" }),
      item({ id: "none", time: "" }),
      item({ id: "early2", time: "09:00", sort_order: 2 }),
      item({ id: "early1", time: "09:00", sort_order: 1 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["early1", "early2", "late", "none"]);
  });
  it("a day without DayPlan rows returns all its items", () => {
    const items = [item({ id: "a" }), item({ id: "b", day_date: "2026-11-21" })];
    expect(itemsForDay(items, [], "2026-11-20").map((i) => i.id)).toEqual(["a"]);
  });
  it("a day with alternates returns the active plan, or the requested one", () => {
    const plans = [plan({ id: "p1", is_active: true }), plan({ id: "p2", sort_order: 1 })];
    const items = [item({ id: "main", plan_id: "p1" }), item({ id: "rain", plan_id: "p2" })];
    expect(itemsForDay(items, plans, "2026-11-20").map((i) => i.id)).toEqual(["main"]);
    expect(itemsForDay(items, plans, "2026-11-20", "p2").map((i) => i.id)).toEqual(["rain"]);
  });
});

describe("nextItemIndex / currentItemIndex / isDayFinished", () => {
  const day = [
    item({ id: "a", time: "09:00", end_time: "10:00", status: "done" }),
    item({ id: "b", time: "10:30", end_time: "12:00" }),
    item({ id: "c", time: "13:00", status: "skipped" }),
    item({ id: "d", time: "15:00" }),
    item({ id: "e", time: "" }),
  ];
  it("next = first planned item starting at or after now", () => {
    expect(nextItemIndex(day, "08:00")).toBe(1);
    expect(nextItemIndex(day, "11:00")).toBe(3);
    expect(nextItemIndex(day, "16:00")).toBeNull();
  });
  it("current = planned item with time ≤ now < end_time", () => {
    expect(currentItemIndex(day, "11:00")).toBe(1);
    expect(currentItemIndex(day, "09:30")).toBeNull(); // a is done
    expect(currentItemIndex(day, "12:30")).toBeNull();
  });
  it("a day is finished only when no planned item is still ahead", () => {
    expect(isDayFinished(day, "16:00")).toBe(false); // e has no time, still open
    expect(isDayFinished(day.slice(0, 4), "16:00")).toBe(true);
    expect(isDayFinished(day.slice(0, 4), "14:00")).toBe(false);
    expect(isDayFinished([], "16:00")).toBe(false);
  });
});

describe("resolveIndexDate / neighbors", () => {
  it("explicit date wins, then last viewed (if in trip), then today", () => {
    expect(resolveIndexDate("2026-11-22", "2026-11-21", CTX.today, CTX.start, CTX.end)).toBe("2026-11-22");
    expect(resolveIndexDate(null, "2026-11-21", CTX.today, CTX.start, CTX.end)).toBe("2026-11-21");
    expect(resolveIndexDate(null, "2025-01-01", CTX.today, CTX.start, CTX.end)).toBe(CTX.today);
    expect(resolveIndexDate(null, null, CTX.today, CTX.start, CTX.end)).toBe(CTX.today);
  });
  it("neighbors gives 1-based position and prev/next ids", () => {
    const list = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
    expect(neighbors(list, "a")).toEqual({ index: 1, prevId: null, nextId: "b" });
    expect(neighbors(list, "b")).toEqual({ index: 2, prevId: "a", nextId: "c" });
    expect(neighbors(list, "zz")).toEqual({ index: 0, prevId: null, nextId: null });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/line-plan.test.ts`
Expected: FAIL — `Failed to resolve import "./line-plan"`.

- [ ] **Step 4: Write the implementation**

```ts
// lib/line-plan.ts
import type { DayPlan, ItineraryItem } from "@/lib/models/types";
import { extractDate, addDays, type TripDateCtx } from "@/lib/line-date";

// What a plan command asks for. The router already removed the command
// word (แพลน / plan); `rest` is the remainder -- or, for #n / ต่อไป / ตอนนี้,
// the token itself (see the shared LINE spec, Router step 2).
export type PlanQuery =
  | { kind: "overview"; date: string | null }
  | { kind: "detail"; date: string | null; index: number }
  | { kind: "next" }
  | { kind: "now" }
  | { kind: "out_of_range" }
  | { kind: "bad_date" };

const NEXT_WORDS = ["ต่อไป", "next"];
const NOW_WORDS = ["ตอนนี้", "now"];
const INDEX_RE = /^#?\s*(\d{1,2})$/;

function indexQuery(date: string | null, digits: string): PlanQuery {
  const index = parseInt(digits, 10);
  return index >= 1 ? { kind: "detail", date, index } : { kind: "bad_date" };
}

export function parsePlanQuery(rest: string, ctx: TripDateCtx): PlanQuery {
  const text = rest.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  if (NEXT_WORDS.includes(lower)) return { kind: "next" };
  if (NOW_WORDS.includes(lower)) return { kind: "now" };

  // A lone 1–2 digit number is never a date token, so check it before
  // extractDate -- "แพลน 2" means item 2, not the 2nd of some month.
  const bare = INDEX_RE.exec(text);
  if (bare) return indexQuery(null, bare[1]);

  const { date, rest: left, outOfRange } = extractDate(text, ctx);
  if (outOfRange) return { kind: "out_of_range" };
  const leftover = left.trim();
  if (leftover === "") return { kind: "overview", date };
  const idx = INDEX_RE.exec(leftover);
  if (idx) return indexQuery(date, idx[1]);
  return { kind: "bad_date" };
}

export function inTrip(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function tripDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

// Up to `max` trip days for a quick-reply picker: the whole trip if it fits,
// otherwise a window starting at today (clamped so it never runs past the end).
export function dayWindow(start: string, end: string, today: string, max: number): string[] {
  const all = tripDates(start, end);
  if (all.length <= max) return all;
  const ti = all.indexOf(today);
  const from = ti === -1 ? 0 : Math.min(ti, all.length - max);
  return all.slice(from, from + max);
}

export function plansForDay(dayPlans: DayPlan[], date: string): DayPlan[] {
  return dayPlans.filter((p) => p.day_date === date).sort((a, b) => a.sort_order - b.sort_order);
}

export function activePlanFor(dayPlans: DayPlan[], date: string): DayPlan | null {
  return plansForDay(dayPlans, date).find((p) => p.is_active) ?? null;
}

export function sortItems(items: ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => {
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    if (a.time !== b.time) return a.time < b.time ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
}

// planId undefined = the day's active plan; a day with no DayPlan rows has
// no active plan, so every item of that day is returned (they all carry
// plan_id "" anyway -- same rule as the itinerary page).
export function itemsForDay(items: ItineraryItem[], dayPlans: DayPlan[], date: string, planId?: string): ItineraryItem[] {
  const pid = planId ?? activePlanFor(dayPlans, date)?.id;
  return sortItems(items.filter((it) => it.day_date === date && (pid === undefined || it.plan_id === pid)));
}

// HH:MM strings are zero-padded, so plain string comparison orders them.
export function nextItemIndex(items: ItineraryItem[], nowHHMM: string): number | null {
  const i = items.findIndex((it) => it.status === "planned" && it.time !== "" && it.time >= nowHHMM);
  return i === -1 ? null : i;
}

export function currentItemIndex(items: ItineraryItem[], nowHHMM: string): number | null {
  const i = items.findIndex(
    (it) => it.status === "planned" && it.time !== "" && it.end_time !== "" && it.time <= nowHHMM && nowHHMM < it.end_time,
  );
  return i === -1 ? null : i;
}

export function isDayFinished(items: ItineraryItem[], nowHHMM: string): boolean {
  if (items.length === 0) return false;
  return !items.some(
    (it) => it.status === "planned" && (it.time === "" || it.time >= nowHHMM || (it.end_time !== "" && nowHHMM < it.end_time)),
  );
}

export function resolveIndexDate(qDate: string | null, lastPlanDate: string | null, today: string, start: string, end: string): string {
  if (qDate) return qDate;
  if (lastPlanDate && inTrip(lastPlanDate, start, end)) return lastPlanDate;
  return today;
}

export function neighbors(items: ItineraryItem[], id: string): { index: number; prevId: string | null; nextId: string | null } {
  const i = items.findIndex((it) => it.id === id);
  if (i === -1) return { index: 0, prevId: null, nextId: null };
  return { index: i + 1, prevId: items[i - 1]?.id ?? null, nextId: items[i + 1]?.id ?? null };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/line-plan.test.ts`
Expected: PASS (all tests green).

Then run: `npx tsc --noEmit`
Expected: exits 0 with no output (tsc must stay green after every task commit).

- [ ] **Step 6: Commit**

```bash
git add lib/line-plan.ts lib/line-plan.test.ts
git commit -m "$(cat <<'EOF'
feat(line): parse plan queries and select a day's itinerary rows

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Plan overview card, pickers, shared Flex helpers (`lib/line-plan-messages.ts`)

**Files:**
- Create: `lib/line-test-helpers.ts`
- Create: `lib/line-plan-messages.ts`
- Test: `lib/line-plan-messages.test.ts`

**Interfaces:**
- Consumes (foundation): `CLAY`, `FlexNode`, `txt`, `compact`, `postbackAction`, `uriAction`, `flexMessage`, `textMessage`, `quickReply`, `buildPhotoAlbum` from `@/lib/line-flex`; `thaiDateLabel`, `tripDayIndex`, `addDays` from `@/lib/line-date`.
- Produces (used by Tasks 3, 4, 6, 7):
  - `PAGE_SIZE = 15`, `MAIN_PLAN_NAME = "แผนหลัก"`
  - `clampPage(page: number, total: number): number` (1 ≤ page ≤ last page)
  - `dm(iso: string): string` (`"2026-11-21"` → `"21/11"`)
  - `trunc(s: string, n: number): string`
  - `btn(action: FlexNode, style?: "primary" | "secondary" | "link"): FlexNode`
  - `btnRow(buttons: FlexNode[]): FlexNode | null`
  - `section(contents: FlexNode[], action?: FlexNode): FlexNode`
  - `needsReadMore(notes: string): boolean`
  - `tripRangeText(start: string, end: string): string`
  - `albumMessage(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode`
  - `buildDayPicker(text: string, dates: string[], start: string, action: string, lead?: { label: string; date: string }[]): FlexNode`
  - `buildAltPicker(date: string, plans: DayPlan[]): FlexNode`
  - `interface OverviewInput { appUrl; date; start; end; planId: string | null; planName; isAlt; otherPlans: { id; name }[]; items: ItineraryItem[]; nextIndex: number | null; finished: boolean; page: number }`
  - `buildPlanOverview(p: OverviewInput): FlexNode`
  - Test helpers in `lib/line-test-helpers.ts`: `type Node`, `walk`, `findNode`, `texts`, `actions`, `labels`, `hasEmptyText`, `type Act`

- [ ] **Step 1: Create the test helpers**

```ts
// lib/line-test-helpers.ts
// Test-only walkers over Flex Message JSON. Deliberately not named *.test.ts
// so vitest only loads it when a test imports it.
export type Node = Record<string, unknown>;

export function walk(root: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(root)) {
    root.forEach((n) => walk(n, visit));
    return;
  }
  if (root && typeof root === "object") {
    visit(root as Node);
    Object.values(root as Node).forEach((v) => walk(v, visit));
  }
}

export function findNode(root: unknown, pred: (n: Node) => boolean): Node | undefined {
  let found: Node | undefined;
  walk(root, (n) => {
    if (!found && pred(n)) found = n;
  });
  return found;
}

// Every `text` of a text node (Flex text components and plain text messages).
export function texts(root: unknown): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (n.type === "text" && typeof n.text === "string") out.push(n.text);
  });
  return out;
}

export interface Act {
  type: string;
  label: string;
  data: Record<string, string>;
  uri: string;
}

// Every postback / uri / clipboard action (buttons, tappable boxes, hero,
// quick reply items), with postback data decoded.
export function actions(root: unknown): Act[] {
  const out: Act[] = [];
  walk(root, (n) => {
    if ((n.type === "postback" || n.type === "uri" || n.type === "clipboard") && typeof n.label === "string") {
      out.push({
        type: n.type,
        label: n.label,
        data: typeof n.data === "string" ? Object.fromEntries(new URLSearchParams(n.data)) : {},
        uri: typeof n.uri === "string" ? n.uri : "",
      });
    }
  });
  return out;
}

export const labels = (root: unknown): string[] => actions(root).map((a) => a.label);

export function hasEmptyText(root: unknown): boolean {
  let bad = false;
  walk(root, (n) => {
    if (n.type === "text" && (typeof n.text !== "string" || n.text === "")) bad = true;
  });
  return bad;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/line-plan-messages.test.ts
import { describe, it, expect } from "vitest";
import type { DayPlan, ItineraryItem } from "@/lib/models/types";
import { CLAY } from "@/lib/line-flex";
import { thaiDateLabel } from "@/lib/line-date";
import {
  buildPlanOverview,
  buildDayPicker,
  buildAltPicker,
  albumMessage,
  dm,
  trunc,
  needsReadMore,
  tripRangeText,
  type OverviewInput,
} from "./line-plan-messages";
import { texts, actions, labels, findNode, hasEmptyText, type Node } from "./line-test-helpers";

function item(over: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", time: "", end_time: "", title: "t", place: "",
    maps_link: "", notes: "", status: "planned", moved_to_date: "", linked_transport_id: "",
    linked_booking_id: "", sort_order: 0, photo_ids: [], plan_id: "", ...over,
  };
}

const BASE: OverviewInput = {
  appUrl: "https://app.test/trips/t1/itinerary?day=2026-11-20",
  date: "2026-11-20", start: "2026-11-19", end: "2026-11-23",
  planId: null, planName: "แผนหลัก", isAlt: false, otherPlans: [],
  items: [], nextIndex: null, finished: false, page: 1,
};

const ITEMS = [
  item({ id: "a", time: "09:00", end_time: "10:30", title: "Breakfast", place: "Australia Dairy", status: "done" }),
  item({ id: "b", time: "11:00", title: "Peak Tram" }),
  item({ id: "c", title: "Shopping", status: "skipped" }),
  item({ id: "d", time: "15:00", title: "Museum", status: "moved", moved_to_date: "2026-11-21" }),
];

// The tappable row box whose postback opens item `id`.
const rowFor = (msg: unknown, id: string): Node | undefined =>
  findNode(msg, (n) => {
    const action = n.action as Node | undefined;
    return n.type === "box" && typeof action?.data === "string" && new URLSearchParams(action.data).get("i") === id;
  });

describe("small helpers", () => {
  it("dm formats d/m without leading zeros", () => expect(dm("2026-01-05")).toBe("5/1"));
  it("trunc adds an ellipsis only when cut", () => {
    expect(trunc("abc", 5)).toBe("abc");
    expect(trunc("abcdef", 4)).toBe("abc…");
  });
  it("needsReadMore for long or >3-line notes", () => {
    expect(needsReadMore("short")).toBe(false);
    expect(needsReadMore("a\nb\nc\nd")).toBe(true);
    expect(needsReadMore("x".repeat(121))).toBe(true);
  });
  it("tripRangeText", () => {
    expect(tripRangeText("2026-11-19", "2026-11-23")).toBe(
      `ทริปอยู่ระหว่าง ${thaiDateLabel("2026-11-19")}–${thaiDateLabel("2026-11-23")}`,
    );
  });
  it("albumMessage always returns a flex message", () => {
    const msg = albumMessage({ origin: "https://app.test", photoIds: ["a", "b"], title: "Peak", moreUrl: "https://app.test/x" }) as Node;
    expect(msg.type).toBe("flex");
  });
});

describe("buildPlanOverview", () => {
  it("is a flex message with altText", () => {
    const msg = buildPlanOverview({ ...BASE, items: ITEMS }) as Node;
    expect(msg.type).toBe("flex");
    expect(typeof msg.altText).toBe("string");
  });

  it("header shows trip day, date label, plan name and count", () => {
    const t = texts(buildPlanOverview({ ...BASE, items: ITEMS }));
    expect(t).toContain(`📅 วันที่ 2 · ${thaiDateLabel("2026-11-20")}`);
    expect(t).toContain("แผนหลัก · 4 รายการ");
  });

  it("time column: start + –end, start only, — when there is no time", () => {
    const msg = buildPlanOverview({ ...BASE, items: ITEMS });
    expect(texts(rowFor(msg, "a"))).toEqual(expect.arrayContaining(["1", "09:00", "–10:30", "Breakfast", "Australia Dairy"]));
    expect(texts(rowFor(msg, "b")).some((s) => s.startsWith("–"))).toBe(false);
    expect(texts(rowFor(msg, "c"))).toContain("—");
  });

  it("never emits an empty text node (blank place is hidden)", () => {
    expect(hasEmptyText(buildPlanOverview({ ...BASE, items: ITEMS }))).toBe(false);
    expect(hasEmptyText(buildPlanOverview(BASE))).toBe(false);
  });

  it("colors rows by status and marks the next item", () => {
    const msg = buildPlanOverview({ ...BASE, items: ITEMS, nextIndex: 1 });
    const a = rowFor(msg, "a")!;
    expect(a.backgroundColor).toBe(CLAY.doneBg);
    expect(texts(a)).toContain("✓");
    const b = rowFor(msg, "b")!;
    expect(b.backgroundColor).toBe(CLAY.nextBg);
    expect(texts(b)).toContain("ต่อไป");
    const c = rowFor(msg, "c")!;
    expect(texts(c)).toEqual(expect.arrayContaining(["ข้าม", "⏭"]));
    expect(findNode(c, (n) => n.text === "Shopping")?.decoration).toBe("line-through");
    const d = rowFor(msg, "d")!;
    expect(texts(d)).toEqual(expect.arrayContaining(["ย้ายไป 21/11", "➡️"]));
  });

  it("row icon priority: booking, then transport, then photos", () => {
    const msg = buildPlanOverview({
      ...BASE,
      items: [
        item({ id: "k", linked_booking_id: "bk", linked_transport_id: "tr", photo_ids: ["p"] }),
        item({ id: "m", linked_transport_id: "tr", photo_ids: ["p"] }),
        item({ id: "n", photo_ids: ["p"] }),
      ],
    });
    expect(texts(rowFor(msg, "k"))).toContain("🎫");
    expect(texts(rowFor(msg, "m"))).toContain("🚇");
    expect(texts(rowFor(msg, "n"))).toContain("📷");
  });

  it("each row opens the item detail", () => {
    const msg = buildPlanOverview({ ...BASE, items: ITEMS });
    expect(actions(rowFor(msg, "a"))[0].data).toEqual({ a: "plan_detail", i: "a", d: "2026-11-20" });
  });

  it("day buttons hide at the trip edges", () => {
    expect(labels(buildPlanOverview({ ...BASE, date: "2026-11-19", items: ITEMS }))).not.toContain("◀ วันก่อน");
    expect(labels(buildPlanOverview({ ...BASE, date: "2026-11-23", items: ITEMS }))).not.toContain("วันถัดไป ▶");
    const mid = actions(buildPlanOverview({ ...BASE, items: ITEMS }));
    expect(mid.find((a) => a.label === "◀ วันก่อน")?.data).toEqual({ a: "plan_overview", d: "2026-11-19" });
    expect(mid.find((a) => a.label === "วันถัดไป ▶")?.data).toEqual({ a: "plan_overview", d: "2026-11-21" });
  });

  it("offers up to two alternate plans as buttons", () => {
    const msg = buildPlanOverview({ ...BASE, items: ITEMS, otherPlans: [{ id: "p2", name: "ฝนตก" }, { id: "p3", name: "ชิลๆ" }] });
    expect(texts(msg)).toContain("แผนหลัก · 4 รายการ · มีแพลนสำรอง 2");
    expect(actions(msg).find((a) => a.label === "ฝนตก")?.data).toEqual({ a: "plan_overview", d: "2026-11-20", p: "p2" });
    expect(labels(msg)).toContain("ชิลๆ");
  });

  it("more than two alternates collapse into แพลนอื่น", () => {
    const others = [{ id: "p2", name: "A" }, { id: "p3", name: "B" }, { id: "p4", name: "C" }];
    const msg = buildPlanOverview({ ...BASE, items: ITEMS, otherPlans: others });
    expect(actions(msg).find((a) => a.label === "แพลนอื่น")?.data).toEqual({ a: "plan_alt", d: "2026-11-20" });
    expect(labels(msg)).not.toContain("A");
  });

  it("viewing an alternate plan is marked read-only and offers กลับแพลนหลัก", () => {
    const msg = buildPlanOverview({ ...BASE, items: ITEMS, isAlt: true, planId: "p2", planName: "ฝนตก" });
    expect(texts(msg)).toContain("ฝนตก (สำรอง — ดูอย่างเดียว) · 4 รายการ");
    expect(actions(msg).find((a) => a.label === "กลับแพลนหลัก")?.data).toEqual({ a: "plan_overview", d: "2026-11-20" });
  });

  it("pages after 15 rows", () => {
    const many = Array.from({ length: 20 }, (_, i) => item({ id: `i${i}`, title: `Item ${i}`, sort_order: i }));
    const p1 = buildPlanOverview({ ...BASE, items: many });
    expect(actions(p1).filter((a) => a.data.a === "plan_detail")).toHaveLength(15);
    expect(texts(p1)).toContain("อีก 5 รายการ");
    expect(actions(p1).find((a) => a.label === "ดูต่อ")?.data).toEqual({ a: "plan_overview", d: "2026-11-20", n: "2" });
    const p2 = buildPlanOverview({ ...BASE, items: many, page: 2 });
    expect(actions(p2).filter((a) => a.data.a === "plan_detail")).toHaveLength(5);
    expect(texts(p2)).toContain("16");
    expect(labels(p2)).not.toContain("ดูต่อ");
  });

  it("a stale page past the end is clamped to the last page", () => {
    const few = Array.from({ length: 3 }, (_, i) => item({ id: `i${i}`, sort_order: i }));
    const msg = buildPlanOverview({ ...BASE, items: few, page: 4 });
    expect(actions(msg).filter((a) => a.data.a === "plan_detail")).toHaveLength(3);
    expect(texts(msg)).toContain("1");
  });

  it("finished today shows the banner and แพลนพรุ่งนี้", () => {
    const done = [item({ id: "a", time: "09:00", status: "done" })];
    const msg = buildPlanOverview({ ...BASE, items: done, finished: true });
    expect(texts(msg)).toContain("จบแพลนวันนี้แล้ว 🎉");
    expect(actions(msg).find((a) => a.label === "แพลนพรุ่งนี้")?.data).toEqual({ a: "plan_overview", d: "2026-11-21" });
    const last = buildPlanOverview({ ...BASE, date: "2026-11-23", items: done, finished: true });
    expect(labels(last)).not.toContain("แพลนพรุ่งนี้");
  });

  it("an empty day says so and links to the app", () => {
    const msg = buildPlanOverview(BASE);
    expect(texts(msg)).toContain(`${thaiDateLabel("2026-11-20")} ยังไม่มีแพลน`);
    expect(actions(msg).find((a) => a.label === "เปิดแอป")?.uri).toBe(BASE.appUrl);
  });
});

describe("buildDayPicker", () => {
  it("lead items first, then trip days labelled by trip day number", () => {
    const msg = buildDayPicker("ไม่เข้าใจวันที่", ["2026-11-19", "2026-11-20"], "2026-11-19", "plan_overview", [
      { label: "วันนี้", date: "2026-11-20" },
    ]);
    expect(texts(msg)).toContain("ไม่เข้าใจวันที่");
    expect(labels(msg)).toEqual(["วันนี้", "วันที่ 1 · 19/11", "วันที่ 2 · 20/11"]);
    expect(actions(msg)[1].data).toEqual({ a: "plan_overview", d: "2026-11-19" });
  });
  it("caps at 13 quick replies", () => {
    const dates = Array.from({ length: 20 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    expect(labels(buildDayPicker("x", dates, "2026-11-01", "tr_list"))).toHaveLength(13);
  });
  it("no dates → plain text without quick reply", () => {
    expect(actions(buildDayPicker("x", [], "2026-11-01", "tr_list"))).toHaveLength(0);
  });
});

describe("buildAltPicker", () => {
  it("lists every plan of the day; the active one opens the main view", () => {
    const plans: DayPlan[] = [
      { id: "p1", trip_id: "t1", day_date: "2026-11-20", name: "แผนหลัก", sort_order: 0, is_active: true },
      { id: "p2", trip_id: "t1", day_date: "2026-11-20", name: "ฝนตก", sort_order: 1, is_active: false },
    ];
    const acts = actions(buildAltPicker("2026-11-20", plans));
    expect(acts.map((a) => a.label)).toEqual(["แผนหลัก (หลัก)", "ฝนตก"]);
    expect(acts[0].data).toEqual({ a: "plan_overview", d: "2026-11-20" });
    expect(acts[1].data).toEqual({ a: "plan_overview", d: "2026-11-20", p: "p2" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/line-plan-messages.test.ts`
Expected: FAIL — `Failed to resolve import "./line-plan-messages"`.

- [ ] **Step 4: Write the implementation**

```ts
// lib/line-plan-messages.ts
import type { DayPlan, ItineraryItem } from "@/lib/models/types";
import {
  CLAY,
  txt,
  compact,
  postbackAction,
  uriAction,
  flexMessage,
  textMessage,
  quickReply,
  buildPhotoAlbum,
  type FlexNode,
} from "@/lib/line-flex";
import { thaiDateLabel, tripDayIndex, addDays } from "@/lib/line-date";

export const PAGE_SIZE = 15;
export const MAIN_PLAN_NAME = "แผนหลัก";

// "2026-11-21" -> "21/11"
export function dm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function btn(action: FlexNode, style: "primary" | "secondary" | "link" = "secondary"): FlexNode {
  return { type: "button", style, height: "sm", action, ...(style === "primary" ? { color: CLAY.coral } : {}) };
}

export function btnRow(buttons: FlexNode[]): FlexNode | null {
  if (buttons.length === 0) return null;
  return { type: "box", layout: "horizontal", spacing: "sm", contents: buttons.map((b) => ({ ...b, flex: 1 })) };
}

// A cream sub-card inside a bubble body; optionally tappable as a whole.
export function section(contents: FlexNode[], action?: FlexNode): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    margin: "md",
    paddingAll: "10px",
    cornerRadius: "12px",
    backgroundColor: CLAY.cream,
    contents,
    ...(action ? { action } : {}),
  };
}

// Notes are shown with maxLines 3; offer "อ่านต่อ" when that likely cut them.
export function needsReadMore(notes: string): boolean {
  return notes.length > 120 || notes.split("\n").length > 3;
}

export function tripRangeText(start: string, end: string): string {
  return `ทริปอยู่ระหว่าง ${thaiDateLabel(start)}–${thaiDateLabel(end)}`;
}

// Foundation buildPhotoAlbum returns the bare carousel; wrap it into a
// sendable flex message (left tolerant of an already-wrapped message).
export function albumMessage(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode {
  const album = buildPhotoAlbum(p);
  return album.type === "flex" ? album : flexMessage(trunc(`รูป · ${p.title}`, 400), album);
}

export function buildDayPicker(
  text: string,
  dates: string[],
  start: string,
  action: string,
  lead: { label: string; date: string }[] = [],
): FlexNode {
  const items = [
    ...lead.map((l) => ({ label: l.label, data: { a: action, d: l.date } })),
    ...dates.map((d) => ({ label: `วันที่ ${tripDayIndex(d, start)} · ${dm(d)}`, data: { a: action, d } })),
  ].slice(0, 13);
  return items.length > 0 ? textMessage(text, quickReply(items)) : textMessage(text);
}

export function buildAltPicker(date: string, plans: DayPlan[]): FlexNode {
  if (plans.length === 0) return textMessage("วันนี้มีแพลนเดียว");
  return textMessage(
    `เลือกแพลน ${thaiDateLabel(date)}`,
    quickReply(
      plans.slice(0, 13).map((p) => ({
        label: p.is_active ? `${p.name || MAIN_PLAN_NAME} (หลัก)` : p.name || "แพลน",
        data: { a: "plan_overview", d: date, p: p.is_active ? undefined : p.id },
      })),
    ),
  );
}

export interface OverviewInput {
  appUrl: string;                              // app itinerary page for this day
  date: string;
  start: string;
  end: string;
  planId: string | null;                       // alt plan being viewed; null = the day's active/only plan
  planName: string;
  isAlt: boolean;
  otherPlans: { id: string; name: string }[];  // the day's other plans (not the one shown)
  items: ItineraryItem[];                      // already sorted (itemsForDay)
  nextIndex: number | null;                    // 0-based "ถัดไป" row, only when viewing today
  finished: boolean;                           // viewing today and every item is behind us
  page: number;                                // 1-based
}

function rowIcon(it: ItineraryItem): string {
  if (it.status === "done") return "✓";
  if (it.status === "skipped") return "⏭";
  if (it.status === "moved") return "➡️";
  if (it.linked_booking_id) return "🎫";
  if (it.linked_transport_id) return "🚇";
  if (it.photo_ids.length > 0) return "📷";
  return "";
}

function rowSuffix(it: ItineraryItem, isNext: boolean): string {
  if (isNext) return "ต่อไป";
  if (it.status === "skipped") return "ข้าม";
  if (it.status === "moved") return it.moved_to_date ? `ย้ายไป ${dm(it.moved_to_date)}` : "ย้ายแล้ว";
  return "";
}

function overviewRow(it: ItineraryItem, n: number, isNext: boolean, date: string): FlexNode {
  const gray = it.status === "skipped" || it.status === "moved";
  const ink = gray ? CLAY.grayInk : isNext ? CLAY.nextInk : CLAY.ink;
  const weight = isNext ? "bold" : "regular";
  const bg = it.status === "done" ? CLAY.doneBg : isNext ? CLAY.nextBg : undefined;
  const sub = [it.place, rowSuffix(it, isNext)].filter(Boolean).join(" · ");
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    paddingAll: "8px",
    cornerRadius: "10px",
    ...(bg ? { backgroundColor: bg } : {}),
    action: postbackAction("เปิด", { a: "plan_detail", i: it.id, d: date }),
    contents: compact<FlexNode>([
      txt(String(n), { size: "sm", color: CLAY.muted, flex: 0 }),
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        width: "52px",
        contents: compact<FlexNode>([
          txt(it.time || "—", { size: "sm", color: ink, weight }),
          txt(it.time && it.end_time ? `–${it.end_time}` : null, { size: "xs", color: CLAY.muted }),
        ]),
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact<FlexNode>([
          txt(it.title || "(ไม่มีชื่อ)", {
            size: "sm",
            color: ink,
            weight,
            wrap: true,
            ...(it.status === "skipped" ? { decoration: "line-through" } : {}),
          }),
          txt(sub, { size: "xs", color: gray ? CLAY.grayInk : CLAY.muted, wrap: true }),
        ]),
      },
      txt(rowIcon(it), { size: "sm", flex: 0, color: it.status === "done" ? CLAY.doneInk : CLAY.muted }),
    ]),
  };
}

// A stale "ดูต่อ" (rows deleted since the card was drawn) lands on the last page.
export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / PAGE_SIZE)));
}

export function buildPlanOverview(input: OverviewInput): FlexNode {
  const p = { ...input, page: clampPage(input.page, input.items.length) };
  const pageStart = (p.page - 1) * PAGE_SIZE;
  const shown = p.items.slice(pageStart, pageStart + PAGE_SIZE);
  const remaining = p.items.length - pageStart - shown.length;
  const pid = p.planId ?? undefined;
  const tomorrow = addDays(p.date, 1);

  const subtitle = p.isAlt
    ? `${p.planName} (สำรอง — ดูอย่างเดียว) · ${p.items.length} รายการ`
    : `${p.planName} · ${p.items.length} รายการ${p.otherPlans.length > 0 ? ` · มีแพลนสำรอง ${p.otherPlans.length}` : ""}`;

  const rows = shown.map((it, i) => overviewRow(it, pageStart + i + 1, p.nextIndex === pageStart + i, p.date));

  const body = compact<FlexNode>([
    txt(`📅 วันที่ ${tripDayIndex(p.date, p.start)} · ${thaiDateLabel(p.date)}`, {
      weight: "bold",
      size: "md",
      color: CLAY.coral,
      wrap: true,
    }),
    txt(subtitle, { size: "xs", color: CLAY.muted, wrap: true }),
    { type: "separator", margin: "md", color: CLAY.line },
    ...(rows.length > 0
      ? rows
      : [txt(`${thaiDateLabel(p.date)} ยังไม่มีแพลน`, { size: "sm", color: CLAY.muted, margin: "md", wrap: true })]),
    remaining > 0 ? txt(`อีก ${remaining} รายการ`, { size: "xs", color: CLAY.muted, margin: "md" }) : null,
    p.finished ? txt("จบแพลนวันนี้แล้ว 🎉", { size: "sm", weight: "bold", color: CLAY.doneInk, margin: "md" }) : null,
  ]);

  const altButtons: FlexNode[] = p.isAlt
    ? [btn(postbackAction("กลับแพลนหลัก", { a: "plan_overview", d: p.date }))]
    : p.otherPlans.length > 2
      ? [btn(postbackAction("แพลนอื่น", { a: "plan_alt", d: p.date }))]
      : p.otherPlans.map((o) => btn(postbackAction(trunc(o.name || "แพลน", 16), { a: "plan_overview", d: p.date, p: o.id })));

  const nav = compact<FlexNode>([
    p.date > p.start ? btn(postbackAction("◀ วันก่อน", { a: "plan_overview", d: addDays(p.date, -1) })) : null,
    p.date < p.end ? btn(postbackAction("วันถัดไป ▶", { a: "plan_overview", d: tomorrow })) : null,
  ]);

  const footer = compact<FlexNode>([
    remaining > 0 ? btn(postbackAction("ดูต่อ", { a: "plan_overview", d: p.date, p: pid, n: p.page + 1 }), "primary") : null,
    p.finished && tomorrow <= p.end ? btn(postbackAction("แพลนพรุ่งนี้", { a: "plan_overview", d: tomorrow }), "primary") : null,
    p.items.length === 0 ? btn(uriAction("เปิดแอป", p.appUrl), "primary") : null,
    btnRow(altButtons),
    btnRow(nav),
  ]);

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: CLAY.card, contents: body },
    ...(footer.length > 0
      ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", backgroundColor: CLAY.cream, contents: footer } }
      : {}),
  };
  return flexMessage(trunc(`แพลน ${thaiDateLabel(p.date)}`, 400), bubble);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/line-plan-messages.test.ts`
Expected: PASS.

Then run: `npx tsc --noEmit`
Expected: exits 0 with no output (tsc must stay green after every task commit).

- [ ] **Step 6: Commit**

```bash
git add lib/line-test-helpers.ts lib/line-plan-messages.ts lib/line-plan-messages.test.ts
git commit -m "$(cat <<'EOF'
feat(line): plan overview card, day/alt pickers and shared Flex helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Plan item detail card (`buildPlanDetail`)

**Files:**
- Modify: `lib/line-plan-messages.ts` (replace the import block; append the detail builder)
- Test: `lib/line-plan-messages.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: Task 2 helpers (`btn`, `btnRow`, `section`, `trunc`, `dm`, `needsReadMore`); foundation `imageUrl(origin, id)`, `uriAction`, `mapButtons({ query, mapsLink? })`; `formatDuration` from `@/lib/time`.
- Produces:
  - `interface DetailInput { origin: string; item: ItineraryItem; index: number; prevId: string | null; nextId: string | null; overviewPlanId?: string; transport: Transport | null; booking: Booking | null }`
  - `buildPlanDetail(p: DetailInput): FlexNode`
  - `heroImage(origin: string, photoId: string): FlexNode`

- [ ] **Step 1: Write the failing test**

Change the import from `./line-plan-messages` at the top of `lib/line-plan-messages.test.ts` to:

```ts
import {
  buildPlanOverview,
  buildPlanDetail,
  buildDayPicker,
  buildAltPicker,
  albumMessage,
  dm,
  trunc,
  needsReadMore,
  tripRangeText,
  type OverviewInput,
  type DetailInput,
} from "./line-plan-messages";
import { imageUrl } from "@/lib/line-flex";
import type { Booking, Transport } from "@/lib/models/types";
```

(Merge `imageUrl` into the existing `@/lib/line-flex` import line and `Booking, Transport` into the existing `@/lib/models/types` import line, so each module is imported once.)

Append to the end of the file:

```ts
describe("buildPlanDetail", () => {
  const IT = item({
    id: "b", time: "09:00", end_time: "10:30", title: "Peak Tram", place: "Peak Tower",
    notes: "short", photo_ids: ["ph1", "ph2"],
  });
  const BASE_D: DetailInput = {
    origin: "https://app.test", item: IT, index: 2, prevId: "a", nextId: "c", transport: null, booking: null,
  };
  const TR: Transport = {
    id: "tr1", trip_id: "t1", day_date: "2026-11-20", from: "Central", to: "Peak", mode: "MTR", pickup_point: "",
    pickup_photo_ids: [], departure_times: [], depart_time: "09:00", arrive_time: "", duration_min: 45, alt_option: "",
    price_amount: 15, price_currency: "HKD", fx_rate: 4.5, price_thb: 67.5, payer: "", pay_timing: "prepaid",
    paid: false, slip_photo_ids: [], notes: "",
  };
  const BK: Booking = {
    id: "bk1", trip_id: "t1", type: "activity", vendor: "Klook", ref_no: "ABC123", date_from: "2026-11-20",
    date_to: "", time_from: "", detail: "", amount: 0, currency: "HKD", fx_rate: 0, amount_thb: 0, payer: "",
    pay_timing: "prepaid", paid: false, slip_photo_ids: [], notes: "",
  };
  const bubbleOf = (msg: unknown) => (msg as Node).contents as Node;

  it("header: index · time range, status badge, title, place, notes", () => {
    const t = texts(buildPlanDetail(BASE_D));
    expect(t).toEqual(expect.arrayContaining(["2 · 09:00–10:30", "ตามแผน", "Peak Tram", "📍 Peak Tower", "short"]));
  });

  it("hero = first photo, tap opens the full image, with a hint", () => {
    const hero = bubbleOf(buildPlanDetail(BASE_D)).hero;
    const url = imageUrl("https://app.test", "ph1");
    expect(findNode(hero, (n) => n.type === "image")?.url).toBe(url);
    expect(actions(hero)[0].uri).toBe(url);
    expect(texts(hero)).toContain("แตะเพื่อขยาย");
  });

  it("photo album button shows the count", () => {
    const acts = actions(buildPlanDetail(BASE_D));
    expect(acts.find((a) => a.label === "📷 ดูรูปทั้งหมด (2)")?.data).toEqual({ a: "plan_photos", i: "b" });
  });

  it("no photos → no hero and no album button", () => {
    const msg = buildPlanDetail({ ...BASE_D, item: { ...IT, photo_ids: [] } });
    expect(bubbleOf(msg).hero).toBeUndefined();
    expect(labels(msg).some((l) => l.startsWith("📷"))).toBe(false);
  });

  it("notes are clamped to 3 lines; long notes get อ่านต่อ", () => {
    expect(findNode(buildPlanDetail(BASE_D), (n) => n.text === "short")?.maxLines).toBe(3);
    expect(labels(buildPlanDetail(BASE_D))).not.toContain("อ่านต่อ");
    const long = buildPlanDetail({ ...BASE_D, item: { ...IT, notes: "x".repeat(200) } });
    expect(actions(long).find((a) => a.label === "อ่านต่อ")?.data).toEqual({ a: "plan_note", i: "b" });
  });

  it("done toggle follows status; skipped/moved have none", () => {
    expect(actions(buildPlanDetail(BASE_D)).find((a) => a.label === "✓ เสร็จ")?.data).toEqual({ a: "plan_done", i: "b" });
    const done = buildPlanDetail({ ...BASE_D, item: { ...IT, status: "done" } });
    expect(actions(done).find((a) => a.label === "↩ ยังไม่เสร็จ")?.data).toEqual({ a: "plan_undone", i: "b" });
    expect(texts(done)).toContain("✓ เสร็จแล้ว");
    for (const status of ["skipped", "moved"] as const) {
      const l = labels(buildPlanDetail({ ...BASE_D, item: { ...IT, status, moved_to_date: "2026-11-21" } }));
      expect(l).not.toContain("✓ เสร็จ");
      expect(l).not.toContain("↩ ยังไม่เสร็จ");
    }
    expect(texts(buildPlanDetail({ ...BASE_D, item: { ...IT, status: "moved", moved_to_date: "2026-11-21" } }))).toContain(
      "➡️ ย้ายไป 21/11",
    );
  });

  it("linked transport section taps through to the transport card", () => {
    const msg = buildPlanDetail({ ...BASE_D, transport: TR });
    expect(texts(msg)).toEqual(expect.arrayContaining(["MTR · Central → Peak", "ออก 09:00 · 45 นาที · 15 HKD"]));
    expect(actions(msg).some((a) => a.data.a === "tr_detail" && a.data.id === "tr1")).toBe(true);
  });

  it("linked booking section shows the ref big and taps through", () => {
    const msg = buildPlanDetail({ ...BASE_D, booking: BK });
    expect(texts(msg)).toEqual(expect.arrayContaining(["Klook", "ABC123"]));
    expect(findNode(msg, (n) => n.text === "ABC123")?.size).toBe("xl");
    expect(actions(msg).some((a) => a.data.a === "bk_detail" && a.data.b === "bk1")).toBe(true);
  });

  it("missing linked rows (null) hide their sections", () => {
    const acts = actions(buildPlanDetail(BASE_D));
    expect(acts.some((a) => a.data.a === "tr_detail" || a.data.a === "bk_detail")).toBe(false);
  });

  it("map buttons: shown with a place, maps_link wins, hidden with neither", () => {
    const uris = (m: unknown) => actions(m).filter((a) => a.type === "uri").map((a) => a.uri);
    expect(uris(buildPlanDetail(BASE_D)).some((u) => u.startsWith("https://uri.amap.com/search"))).toBe(true);
    const linkOnly = buildPlanDetail({ ...BASE_D, item: { ...IT, place: "", maps_link: "https://maps.app.goo.gl/x" } });
    expect(uris(linkOnly)).toContain("https://maps.app.goo.gl/x");
    expect(uris(linkOnly).some((u) => u.startsWith("https://uri.amap.com/"))).toBe(false);
    const none = buildPlanDetail({ ...BASE_D, item: { ...IT, place: "", maps_link: "", photo_ids: [] } });
    expect(uris(none)).toHaveLength(0);
  });

  it("prev / overview / next navigation", () => {
    const acts = actions(buildPlanDetail(BASE_D));
    expect(acts.find((a) => a.label === "◀ ก่อนหน้า")?.data).toEqual({ a: "plan_detail", i: "a", d: "2026-11-20" });
    expect(acts.find((a) => a.label === "ภาพรวม")?.data).toEqual({ a: "plan_overview", d: "2026-11-20" });
    expect(acts.find((a) => a.label === "ถัดไป ▶")?.data).toEqual({ a: "plan_detail", i: "c", d: "2026-11-20" });
    const edge = labels(buildPlanDetail({ ...BASE_D, prevId: null, nextId: null }));
    expect(edge).not.toContain("◀ ก่อนหน้า");
    expect(edge).not.toContain("ถัดไป ▶");
    const alt = actions(buildPlanDetail({ ...BASE_D, overviewPlanId: "p2" }));
    expect(alt.find((a) => a.label === "ภาพรวม")?.data).toEqual({ a: "plan_overview", d: "2026-11-20", p: "p2" });
  });

  it("a bare item never emits an empty text node", () => {
    const bare = buildPlanDetail({ ...BASE_D, item: item({ id: "z", title: "X" }), index: 1, prevId: null, nextId: null });
    expect(hasEmptyText(bare)).toBe(false);
    expect(texts(bare)).toContain("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-plan-messages.test.ts`
Expected: FAIL — `buildPlanDetail` is not exported (`buildPlanDetail is not a function`).

- [ ] **Step 3: Write the implementation**

Replace the import block at the top of `lib/line-plan-messages.ts` with:

```ts
import type { Booking, DayPlan, ItineraryItem, Transport } from "@/lib/models/types";
import {
  CLAY,
  txt,
  compact,
  postbackAction,
  uriAction,
  imageUrl,
  flexMessage,
  textMessage,
  quickReply,
  buildPhotoAlbum,
  type FlexNode,
} from "@/lib/line-flex";
import { mapButtons } from "@/lib/line-maps";
import { thaiDateLabel, tripDayIndex, addDays } from "@/lib/line-date";
import { formatDuration } from "@/lib/time";
```

Append to the end of `lib/line-plan-messages.ts`:

```ts
export interface DetailInput {
  origin: string;
  item: ItineraryItem;
  index: number;               // 1-based position within its day plan
  prevId: string | null;
  nextId: string | null;
  overviewPlanId?: string;     // set when the item belongs to a non-active (alt) plan
  transport: Transport | null; // linked row, null when unlinked or deleted
  booking: Booking | null;
}

function badgeFor(it: ItineraryItem): { text: string; bg: string; ink: string } {
  switch (it.status) {
    case "done":
      return { text: "✓ เสร็จแล้ว", bg: CLAY.doneBg, ink: CLAY.doneInk };
    case "skipped":
      return { text: "⏭ ข้าม", bg: CLAY.cream, ink: CLAY.grayInk };
    case "moved":
      return { text: it.moved_to_date ? `➡️ ย้ายไป ${dm(it.moved_to_date)}` : "➡️ ย้ายแล้ว", bg: CLAY.cream, ink: CLAY.grayInk };
    default:
      return { text: "ตามแผน", bg: CLAY.cream, ink: CLAY.muted };
  }
}

// Hero = the photo itself; tapping it opens the full-size image, with a small
// "แตะเพื่อขยาย" chip overlaid bottom-right.
export function heroImage(origin: string, photoId: string): FlexNode {
  const url = imageUrl(origin, photoId);
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "0px",
    action: uriAction("ดูรูปเต็ม", url),
    contents: [
      { type: "image", url, size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      {
        type: "box",
        layout: "vertical",
        position: "absolute",
        offsetBottom: "8px",
        offsetEnd: "8px",
        paddingAll: "4px",
        cornerRadius: "8px",
        backgroundColor: "#00000080",
        contents: [{ type: "text", text: "แตะเพื่อขยาย", size: "xxs", color: "#FFFFFF" }],
      },
    ],
  };
}

export function buildPlanDetail(p: DetailInput): FlexNode {
  const it = p.item;
  const range = it.time && it.end_time ? `${it.time}–${it.end_time}` : it.time;
  const badge = badgeFor(it);
  const t = p.transport;
  const b = p.booking;

  const transportSection = t
    ? section(
        compact<FlexNode>([
          txt("🚇 การเดินทาง", { size: "xs", color: CLAY.muted }),
          txt([t.mode, `${t.from} → ${t.to}`].filter(Boolean).join(" · "), { size: "sm", color: CLAY.ink, wrap: true }),
          txt(
            [
              t.depart_time ? `ออก ${t.depart_time}` : "",
              formatDuration(t.duration_min),
              t.price_amount > 0 ? `${t.price_amount} ${t.price_currency}` : "",
            ]
              .filter(Boolean)
              .join(" · "),
            { size: "xs", color: CLAY.muted, wrap: true },
          ),
        ]),
        postbackAction("การเดินทาง", { a: "tr_detail", id: t.id }),
      )
    : null;

  const bookingSection = b
    ? section(
        compact<FlexNode>([
          txt("🎫 การจอง", { size: "xs", color: CLAY.muted }),
          txt(b.vendor, { size: "sm", color: CLAY.ink, wrap: true }),
          txt(b.ref_no, { size: "xl", weight: "bold", color: CLAY.ink, wrap: true }),
        ]),
        postbackAction("การจอง", { a: "bk_detail", b: b.id }),
      )
    : null;

  const body = compact<FlexNode>([
    {
      type: "box",
      layout: "horizontal",
      contents: compact<FlexNode>([
        txt(range ? `${p.index} · ${range}` : String(p.index), { size: "sm", color: CLAY.muted, flex: 1, gravity: "center" }),
        {
          type: "box",
          layout: "vertical",
          flex: 0,
          paddingAll: "4px",
          cornerRadius: "8px",
          backgroundColor: badge.bg,
          contents: [{ type: "text", text: badge.text, size: "xxs", color: badge.ink }],
        },
      ]),
    },
    txt(it.title || "(ไม่มีชื่อ)", { weight: "bold", size: "lg", color: CLAY.ink, wrap: true }),
    txt(it.place ? `📍 ${it.place}` : null, { size: "sm", color: CLAY.muted, wrap: true }),
    txt(it.notes, { size: "sm", color: CLAY.ink, wrap: true, maxLines: 3, margin: "md" }),
    it.notes && needsReadMore(it.notes) ? btn(postbackAction("อ่านต่อ", { a: "plan_note", i: it.id }), "link") : null,
    transportSection,
    bookingSection,
  ]);

  // Query = place only: no place but a maps_link -> empty query -> mapButtons
  // returns just the Google button (an Amap search by title is useless);
  // neither -> no buttons at all.
  const maps = mapButtons({ query: it.place, mapsLink: it.maps_link || undefined });
  const photoCount = it.photo_ids.length;
  const doneBtn =
    it.status === "planned"
      ? btn(postbackAction("✓ เสร็จ", { a: "plan_done", i: it.id }), "primary")
      : it.status === "done"
        ? btn(postbackAction("↩ ยังไม่เสร็จ", { a: "plan_undone", i: it.id }))
        : null;
  const nav = compact<FlexNode>([
    p.prevId ? btn(postbackAction("◀ ก่อนหน้า", { a: "plan_detail", i: p.prevId, d: it.day_date })) : null,
    btn(postbackAction("ภาพรวม", { a: "plan_overview", d: it.day_date, p: p.overviewPlanId })),
    p.nextId ? btn(postbackAction("ถัดไป ▶", { a: "plan_detail", i: p.nextId, d: it.day_date })) : null,
  ]);
  const footer = compact<FlexNode>([
    btnRow(maps),
    photoCount > 0 ? btn(postbackAction(`📷 ดูรูปทั้งหมด (${photoCount})`, { a: "plan_photos", i: it.id })) : null,
    doneBtn,
    btnRow(nav),
  ]);

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    ...(photoCount > 0 ? { hero: heroImage(p.origin, it.photo_ids[0]) } : {}),
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: CLAY.card, contents: body },
    footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", backgroundColor: CLAY.cream, contents: footer },
  };
  return flexMessage(trunc(`${p.index}. ${it.title || "รายการ"}`, 400), bubble);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-plan-messages.test.ts`
Expected: PASS (overview + detail suites).

Then run: `npx tsc --noEmit`
Expected: exits 0 with no output (tsc must stay green after every task commit).

- [ ] **Step 5: Commit**

```bash
git add lib/line-plan-messages.ts lib/line-plan-messages.test.ts
git commit -m "$(cat <<'EOF'
feat(line): plan item detail card with hero, links, maps and done toggle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Plan handler (`lib/line-handlers/plan.ts`)

**Files:**
- Replace: `lib/line-handlers/plan.ts` (overwrite the foundation stub entirely)
- Test: `lib/line-handlers/plan.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parsePlanQuery`, `itemsForDay`, `plansForDay`, `activePlanFor`, `nextItemIndex`, `currentItemIndex`, `isDayFinished`, `inTrip`, `dayWindow`, `resolveIndexDate`, `neighbors`); Tasks 2–3 (`buildPlanOverview`, `buildPlanDetail`, `buildDayPicker`, `buildAltPicker`, `albumMessage`, `tripRangeText`, `MAIN_PLAN_NAME`); foundation `listRows<T>(entity, tripId?)`, `updateRow<T>(entity, id, obj)` from `@/lib/store`; `readCtx(key): Promise<Record<string, unknown>>`, `writeCtx(key, tripId, patch, now): Promise<void>` from `@/lib/line-session`; `tripDateCtx`, `nowHHMMInTz`, `addDays`, `thaiDateLabel` from `@/lib/line-date`; `textMessage` from `@/lib/line-flex`; `NO_TRIP_TEXT` from `@/lib/line-menu`; `Route` from `@/lib/line-router`; `HandlerCtx`, `PostbackData` from `./types`.
- Produces (called by foundation dispatch): `handleRoute(ctx: HandlerCtx, route: Route): Promise<void>`, `handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void>`.

- [ ] **Step 1: Take `plan` out of the stub test**

`lib/line-handlers/plan.ts` stops being a stub in this task, so the foundation's `lib/line-handlers/stubs.test.ts` must no longer exercise it, whatever stub behaviour it asserts (`WIP_TEXT` in 1:1, silence in groups). Re-read the file first, then delete the import

```ts
import * as plan from "./plan";
```

and every table row / test case that passes the `plan` module (in the foundation version, the `describe.each` row)

```ts
  ["plan", plan],
```

Leave every other entry (including `transport`, removed in Task 7) as is. Run: `npm test -- lib/line-handlers/stubs.test.ts` — Expected: PASS.

- [ ] **Step 2: Write the failing test**

```ts
// lib/line-handlers/plan.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/store", () => ({ listRows: vi.fn(), updateRow: vi.fn() }));
vi.mock("@/lib/line-session", () => ({ readCtx: vi.fn(), writeCtx: vi.fn() }));

import { listRows, updateRow } from "@/lib/store";
import { readCtx, writeCtx } from "@/lib/line-session";
import type { FlexNode } from "@/lib/line-flex";
import type { Route } from "@/lib/line-router";
import type { Booking, DayPlan, ItineraryItem, Transport, Trip } from "@/lib/models/types";
import type { HandlerCtx } from "./types";
import { handleRoute, handlePostback } from "./plan";
import { texts, labels, type Node } from "../line-test-helpers";

const TRIP: Trip = {
  id: "t1", name: "HK", destination: "Hong Kong", start_date: "2026-11-19", end_date: "2026-11-23",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const NOW = new Date("2026-11-20T02:00:00Z"); // 10:00 on Fri 20 Nov in Hong Kong

function item(over: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", time: "", end_time: "", title: "t", place: "",
    maps_link: "", notes: "", status: "planned", moved_to_date: "", linked_transport_id: "",
    linked_booking_id: "", sort_order: 0, photo_ids: [], plan_id: "", ...over,
  };
}

let DB: { itinerary: ItineraryItem[]; day_plans: DayPlan[]; transports: Transport[]; bookings: Booking[] };

const fakeListRows = async (entity: string) => (DB as unknown as Record<string, unknown[]>)[entity] ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  DB = {
    itinerary: [
      item({ id: "a", time: "09:00", end_time: "09:30", title: "Breakfast", status: "done" }),
      item({ id: "b", time: "11:00", end_time: "12:00", title: "Peak", photo_ids: ["ph1"], notes: "bring jacket" }),
      item({ id: "c", day_date: "2026-11-21", time: "10:00", title: "Disney" }),
    ],
    day_plans: [],
    transports: [],
    bookings: [],
  };
  vi.mocked(listRows).mockImplementation(fakeListRows as unknown as typeof listRows);
  vi.mocked(updateRow).mockResolvedValue(undefined);
  vi.mocked(readCtx).mockResolvedValue({});
  vi.mocked(writeCtx).mockResolvedValue(undefined);
});

function makeCtx(trip: Trip | null = TRIP) {
  const reply = vi.fn<(messages: FlexNode[]) => Promise<void>>(async () => {});
  const ctx: HandlerCtx = {
    event: { type: "message", source: { type: "user", userId: "U1" } },
    replyToken: "rt",
    accessToken: "tok",
    origin: "https://app.test",
    now: NOW,
    userKey: "user:U1",
    isGroup: false,
    trip,
    reply,
  };
  return { ctx, reply };
}

const sent = (reply: ReturnType<typeof makeCtx>["reply"]): FlexNode[] => reply.mock.calls[0][0];
const planRoute = (rest: string): Route => ({ kind: "plan", rest });

describe("plan handleRoute", () => {
  it("ignores routes for other features", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, { kind: "menu" });
    expect(reply).not.toHaveBeenCalled();
  });

  it("no active trip → the standard message", async () => {
    const { ctx, reply } = makeCtx(null);
    await handleRoute(ctx, planRoute(""));
    expect(texts(sent(reply))[0]).toBe('ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ');
  });

  it("แพลน → today's overview and remembers the day", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, planRoute(""));
    const msgs = sent(reply);
    expect(msgs).toHaveLength(1);
    expect(texts(msgs)).toEqual(expect.arrayContaining(["Breakfast", "Peak"]));
    expect(texts(msgs)).not.toContain("Disney");
    expect(vi.mocked(writeCtx).mock.calls[0][1]).toBe("t1");
    expect(vi.mocked(writeCtx).mock.calls[0][2]).toEqual({ lastPlanDate: "2026-11-20", lastPlanId: "" });
  });

  it("แพลน n uses the last viewed day", async () => {
    vi.mocked(readCtx).mockResolvedValue({ lastPlanDate: "2026-11-21" });
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, planRoute("1"));
    expect(texts(sent(reply))).toContain("Disney");
    expect(vi.mocked(writeCtx).mock.calls[0][2]).toEqual({ lastPlanDate: "2026-11-21", lastPlanId: "" });
  });

  it("index past the end → count message + overview", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, planRoute("9"));
    const msgs = sent(reply);
    expect(msgs).toHaveLength(2);
    expect(texts(msgs[0])).toEqual(["วันนี้มี 2 รายการ"]);
    expect(texts(msgs[1])).toContain("Peak");
  });

  it("date outside the trip → range text with day quick replies", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, planRoute("1/12"));
    const msg = sent(reply)[0];
    expect(texts(msg)[0]).toMatch(/^ทริปอยู่ระหว่าง /);
    expect(labels(msg)).toContain("วันที่ 1 · 19/11");
  });

  it("unreadable date → ไม่เข้าใจวันที่ with วันนี้ / พรุ่งนี้ first", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, planRoute("ฝนตก"));
    const msg = sent(reply)[0];
    expect(texts(msg)[0]).toBe("ไม่เข้าใจวันที่");
    expect(labels(msg).slice(0, 2)).toEqual(["วันนี้", "พรุ่งนี้"]);
  });

  it("ต่อไป → detail of the next planned item", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, planRoute("ต่อไป"));
    expect(texts(sent(reply))).toContain("Peak");
    expect(labels(sent(reply))).toContain("✓ เสร็จ");
  });

  it("ตอนนี้ with nothing in progress falls back to next", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, planRoute("ตอนนี้"));
    expect(texts(sent(reply))).toContain("Peak");
  });

  it("a failing ctx write never suppresses the reply", async () => {
    vi.mocked(writeCtx).mockRejectedValue(new Error("Sheets down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx, reply } = makeCtx();
    await expect(handleRoute(ctx, planRoute(""))).resolves.toBeUndefined();
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(writeCtx).mock.invocationCallOrder[0]);
  });

  it("แพลน n numbers items like the card last shown (alt plan kept)", async () => {
    DB.day_plans = [
      { id: "q1", trip_id: "t1", day_date: "2026-11-22", name: "แผนหลัก", sort_order: 0, is_active: true },
      { id: "q2", trip_id: "t1", day_date: "2026-11-22", name: "ฝนตก", sort_order: 1, is_active: false },
    ];
    DB.itinerary.push(
      item({ id: "m1", day_date: "2026-11-22", title: "Main stop", plan_id: "q1" }),
      item({ id: "r1", day_date: "2026-11-22", title: "Rain museum", plan_id: "q2" }),
    );
    vi.mocked(readCtx).mockResolvedValue({ lastPlanDate: "2026-11-22", lastPlanId: "q2" });
    const alt = makeCtx();
    await handleRoute(alt.ctx, planRoute("1"));
    expect(texts(sent(alt.reply))).toContain("Rain museum");
    expect(vi.mocked(writeCtx).mock.calls[0][2]).toEqual({ lastPlanDate: "2026-11-22", lastPlanId: "q2" });

    vi.mocked(readCtx).mockResolvedValue({ lastPlanDate: "2026-11-22", lastPlanId: "" });
    const main = makeCtx();
    await handleRoute(main.ctx, planRoute("1"));
    expect(texts(sent(main.reply))).toContain("Main stop");
  });
});

describe("plan handlePostback", () => {
  it("an alternate plan viewed today gets no ต่อไป highlight and is remembered", async () => {
    DB.day_plans = [
      { id: "p1", trip_id: "t1", day_date: "2026-11-20", name: "แผนหลัก", sort_order: 0, is_active: true },
      { id: "p2", trip_id: "t1", day_date: "2026-11-20", name: "ฝนตก", sort_order: 1, is_active: false },
    ];
    DB.itinerary.push(item({ id: "x1", time: "11:00", title: "Rain plan", plan_id: "p2" }));
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "plan_overview", d: "2026-11-20", p: "p2" });
    const t = texts(sent(reply));
    expect(t).toContain("Rain plan");
    expect(t).toContain("ฝนตก (สำรอง — ดูอย่างเดียว) · 1 รายการ");
    expect(t).not.toContain("ต่อไป");
    expect(vi.mocked(writeCtx).mock.calls[0][2]).toEqual({ lastPlanDate: "2026-11-20", lastPlanId: "p2" });
  });
  it("plan_overview opens the requested day and remembers it", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "plan_overview", d: "2026-11-21" });
    expect(texts(sent(reply))).toContain("Disney");
    expect(vi.mocked(writeCtx).mock.calls[0][2]).toEqual({ lastPlanDate: "2026-11-21", lastPlanId: "" });
  });

  it("plan_done flips planned → done and replies with the new card", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "plan_done", i: "b" });
    expect(updateRow).toHaveBeenCalledWith("itinerary", "b", expect.objectContaining({ id: "b", status: "done" }));
    expect(labels(sent(reply))).toContain("↩ ยังไม่เสร็จ");
  });

  it("plan_done on an item that is already done does not write", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "plan_done", i: "a" });
    expect(updateRow).not.toHaveBeenCalled();
    expect(labels(sent(reply))).toContain("↩ ยังไม่เสร็จ");
  });

  it("plan_undone flips done → planned", async () => {
    const { ctx } = makeCtx();
    await handlePostback(ctx, { a: "plan_undone", i: "a" });
    expect(updateRow).toHaveBeenCalledWith("itinerary", "a", expect.objectContaining({ status: "planned" }));
  });

  it("plan_undone on a skipped item does not write", async () => {
    DB.itinerary[1] = { ...DB.itinerary[1], status: "skipped" };
    const { ctx } = makeCtx();
    await handlePostback(ctx, { a: "plan_undone", i: "b" });
    expect(updateRow).not.toHaveBeenCalled();
  });

  it("plan_photos replies with a flex album", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "plan_photos", i: "b" });
    expect((sent(reply)[0] as Node).type).toBe("flex");
  });

  it("plan_note sends the full note as text", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "plan_note", i: "b" });
    expect(texts(sent(reply))).toEqual(["bring jacket"]);
  });

  it("a deleted item → message + that day's overview", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "plan_detail", i: "gone", d: "2026-11-21" });
    const msgs = sent(reply);
    expect(texts(msgs[0])).toEqual(["รายการนี้ถูกลบไปแล้ว"]);
    expect(texts(msgs[1])).toContain("Disney");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/line-handlers/plan.test.ts`
Expected: FAIL — assertions fail against the stub (e.g. reply text is `ฟีเจอร์นี้กำลังพัฒนา`, `writeCtx` never called).

- [ ] **Step 4: Replace the stub with the implementation**

Overwrite `lib/line-handlers/plan.ts` with:

```ts
// lib/line-handlers/plan.ts
// LINE "แพลน" feature: I/O glue only -- parsing, selection and Flex layout
// live in lib/line-plan.ts and lib/line-plan-messages.ts.
import { listRows, updateRow } from "@/lib/store";
import { readCtx, writeCtx } from "@/lib/line-session";
import { nowHHMMInTz, tripDateCtx, addDays, thaiDateLabel, type TripDateCtx } from "@/lib/line-date";
import { textMessage, type FlexNode } from "@/lib/line-flex";
import { NO_TRIP_TEXT } from "@/lib/line-menu";
import type { Route } from "@/lib/line-router";
import type { Booking, DayPlan, ItineraryItem, Transport, Trip } from "@/lib/models/types";
import {
  parsePlanQuery,
  itemsForDay,
  plansForDay,
  activePlanFor,
  nextItemIndex,
  currentItemIndex,
  isDayFinished,
  inTrip,
  dayWindow,
  resolveIndexDate,
  neighbors,
} from "@/lib/line-plan";
import {
  buildPlanOverview,
  buildPlanDetail,
  buildDayPicker,
  buildAltPicker,
  albumMessage,
  tripRangeText,
  MAIN_PLAN_NAME,
} from "@/lib/line-plan-messages";
import type { HandlerCtx, PostbackData } from "./types";

// readCtx/writeCtx append "#ctx" themselves, so the view-context row is
// {userKey}#ctx and never collides with the expense flow session {userKey}.
const ctxKey = (ctx: HandlerCtx): string => ctx.userKey;

interface Loaded {
  trip: Trip;
  items: ItineraryItem[];
  dayPlans: DayPlan[];
  today: string;
  now: string;
  dateCtx: TripDateCtx;
}

async function load(trip: Trip, now: Date): Promise<Loaded> {
  const [items, dayPlans] = await Promise.all([
    listRows<ItineraryItem>("itinerary", trip.id),
    listRows<DayPlan>("day_plans", trip.id),
  ]);
  const dateCtx = tripDateCtx(trip, now);
  return { trip, items, dayPlans, today: dateCtx.today, now: nowHHMMInTz(trip.trip_timezone, now), dateCtx };
}

const within = (L: Loaded, date: string): boolean => inTrip(date, L.trip.start_date, L.trip.end_date);
const appUrl = (ctx: HandlerCtx, L: Loaded, date: string): string => `${ctx.origin}/trips/${L.trip.id}/itinerary?day=${date}`;

// Remembers the day *and* plan the person last looked at, so `แพลน n` / `#n`
// numbers items exactly like the card they last saw. Called only after the
// reply went out, and never throws: a Sheets hiccup must not cost the answer.
async function remember(ctx: HandlerCtx, L: Loaded, date: string, planId: string | undefined): Promise<void> {
  try {
    await writeCtx(ctxKey(ctx), L.trip.id, { lastPlanDate: date, lastPlanId: planId ?? "" }, ctx.now);
  } catch (err) {
    console.error("LINE plan: writeCtx failed", err);
  }
}

async function recall(ctx: HandlerCtx): Promise<Record<string, unknown>> {
  try {
    return await readCtx(ctxKey(ctx));
  } catch (err) {
    console.error("LINE plan: readCtx failed", err);
    return {};
  }
}

// planId if it names a non-active (alt) plan of that day, else undefined (= main view).
function altPlanId(L: Loaded, date: string, planId: string | undefined): string | undefined {
  if (!planId) return undefined;
  const p = plansForDay(L.dayPlans, date).find((x) => x.id === planId);
  return p && !p.is_active ? p.id : undefined;
}

function overviewMessage(ctx: HandlerCtx, L: Loaded, date: string, planId: string | undefined, page: number): FlexNode {
  const plans = plansForDay(L.dayPlans, date);
  const altId = altPlanId(L, date, planId);
  const shown = (altId ? plans.find((p) => p.id === altId) : undefined) ?? activePlanFor(L.dayPlans, date);
  const items = itemsForDay(L.items, L.dayPlans, date, altId);
  // The "ต่อไป" highlight and the finished banner describe the plan actually
  // being followed today -- never an alternate someone is just browsing.
  const live = date === L.today && altId === undefined;
  return buildPlanOverview({
    appUrl: appUrl(ctx, L, date),
    date,
    start: L.trip.start_date,
    end: L.trip.end_date,
    planId: altId ?? null,
    planName: shown?.name || MAIN_PLAN_NAME,
    isAlt: altId !== undefined,
    otherPlans: plans.filter((p) => p.id !== shown?.id).map((p) => ({ id: p.id, name: p.name })),
    items,
    nextIndex: live ? nextItemIndex(items, L.now) : null,
    finished: live && isDayFinished(items, L.now),
    page,
  });
}

// The alt plan an item belongs to (undefined when it is on the main plan).
function itemAltId(L: Loaded, item: ItineraryItem): string | undefined {
  return altPlanId(L, item.day_date, item.plan_id || undefined);
}

async function detailMessage(ctx: HandlerCtx, L: Loaded, item: ItineraryItem): Promise<FlexNode> {
  const siblings = itemsForDay(L.items, L.dayPlans, item.day_date, item.plan_id);
  const { index, prevId, nextId } = neighbors(siblings, item.id);
  const [transports, bookings] = await Promise.all([
    item.linked_transport_id ? listRows<Transport>("transports", L.trip.id) : Promise.resolve<Transport[]>([]),
    item.linked_booking_id ? listRows<Booking>("bookings", L.trip.id) : Promise.resolve<Booking[]>([]),
  ]);
  return buildPlanDetail({
    origin: ctx.origin,
    item,
    index,
    prevId,
    nextId,
    overviewPlanId: itemAltId(L, item),
    transport: transports.find((t) => t.id === item.linked_transport_id) ?? null,
    booking: bookings.find((b) => b.id === item.linked_booking_id) ?? null,
  });
}

function outOfRangeMessage(L: Loaded): FlexNode {
  const { start_date: start, end_date: end } = L.trip;
  return buildDayPicker(tripRangeText(start, end), dayWindow(start, end, L.today, 13), start, "plan_overview");
}

function badDateMessage(L: Loaded): FlexNode {
  const { start_date: start, end_date: end } = L.trip;
  const lead = [
    { label: "วันนี้", date: L.today },
    { label: "พรุ่งนี้", date: addDays(L.today, 1) },
  ].filter((l) => within(L, l.date));
  return buildDayPicker("ไม่เข้าใจวันที่", dayWindow(start, end, L.today, 13 - lead.length), start, "plan_overview", lead);
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "plan") return;
  if (!ctx.trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const L = await load(ctx.trip, ctx.now);
  const q = parsePlanQuery(route.rest, L.dateCtx);

  if (q.kind === "out_of_range") return ctx.reply([outOfRangeMessage(L)]);
  if (q.kind === "bad_date") return ctx.reply([badDateMessage(L)]);

  if (q.kind === "overview") {
    const date = q.date ?? L.today;
    if (!within(L, date)) return ctx.reply([outOfRangeMessage(L)]);
    await ctx.reply([overviewMessage(ctx, L, date, undefined, 1)]);
    return remember(ctx, L, date, undefined);
  }

  if (q.kind === "detail") {
    const saved = q.date ? {} : await recall(ctx);
    const lastDate = typeof saved.lastPlanDate === "string" ? saved.lastPlanDate : null;
    const date = resolveIndexDate(q.date, lastDate, L.today, L.trip.start_date, L.trip.end_date);
    if (!within(L, date)) return ctx.reply([outOfRangeMessage(L)]);
    // Number items like the card last shown: its alt plan only if that card was one.
    const planId =
      !q.date && date === lastDate && typeof saved.lastPlanId === "string" ? altPlanId(L, date, saved.lastPlanId) : undefined;
    const items = itemsForDay(L.items, L.dayPlans, date, planId);
    if (q.index > items.length) {
      const overview = overviewMessage(ctx, L, date, planId, 1);
      if (items.length === 0) {
        await ctx.reply([overview]);
      } else {
        const head = date === L.today ? "วันนี้" : `${thaiDateLabel(date)} `;
        await ctx.reply([textMessage(`${head}มี ${items.length} รายการ`), overview]);
      }
      return remember(ctx, L, date, planId);
    }
    await ctx.reply([await detailMessage(ctx, L, items[q.index - 1])]);
    return remember(ctx, L, date, planId);
  }

  // next / now are always about today's main plan.
  if (!within(L, L.today)) return ctx.reply([outOfRangeMessage(L)]);
  const items = itemsForDay(L.items, L.dayPlans, L.today);
  const idx =
    q.kind === "now" ? (currentItemIndex(items, L.now) ?? nextItemIndex(items, L.now)) : nextItemIndex(items, L.now);
  if (idx === null) {
    await ctx.reply([
      textMessage(items.length > 0 ? "วันนี้ไม่มีรายการถัดไปแล้ว" : "วันนี้ยังไม่มีแพลน"),
      overviewMessage(ctx, L, L.today, undefined, 1),
    ]);
  } else {
    await ctx.reply([await detailMessage(ctx, L, items[idx])]);
  }
  return remember(ctx, L, L.today, undefined);
}

const ITEM_ACTIONS = new Set(["plan_detail", "plan_photos", "plan_note", "plan_done", "plan_undone"]);

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  if (!ctx.trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const L = await load(ctx.trip, ctx.now);
  const dayOr = (d: string | undefined): string => (d && within(L, d) ? d : L.today);

  if (data.a === "plan_overview") {
    const date = dayOr(data.d);
    const planId = altPlanId(L, date, data.p || undefined);
    await ctx.reply([overviewMessage(ctx, L, date, planId, Math.max(1, Number(data.n) || 1))]);
    return remember(ctx, L, date, planId);
  }
  if (data.a === "plan_alt") {
    const date = dayOr(data.d);
    return ctx.reply([buildAltPicker(date, plansForDay(L.dayPlans, date))]);
  }
  if (!ITEM_ACTIONS.has(data.a)) return;

  // L was just loaded from the store, so this is the row's *current* state.
  const item = L.items.find((it) => it.id === data.i);
  if (!item) {
    return ctx.reply([textMessage("รายการนี้ถูกลบไปแล้ว"), overviewMessage(ctx, L, dayOr(data.d), undefined, 1)]);
  }

  switch (data.a) {
    case "plan_detail":
      await ctx.reply([await detailMessage(ctx, L, item)]);
      return remember(ctx, L, item.day_date, itemAltId(L, item));
    case "plan_photos":
      if (item.photo_ids.length === 0) return ctx.reply([await detailMessage(ctx, L, item)]);
      return ctx.reply([
        albumMessage({ origin: ctx.origin, photoIds: item.photo_ids, title: item.title, moreUrl: appUrl(ctx, L, item.day_date) }),
      ]);
    case "plan_note":
      return ctx.reply([textMessage((item.notes || "ไม่มีโน้ต").slice(0, 5000))]);
    default: {
      // plan_done / plan_undone: only planned <-> done, and only when the row
      // still has the status the button was drawn for -- someone else may have
      // tapped first, or it was skipped/moved in the app meanwhile. Otherwise
      // just show the card as it is now.
      const from = data.a === "plan_done" ? "planned" : "done";
      const to = data.a === "plan_done" ? "done" : "planned";
      if (item.status !== from) return ctx.reply([await detailMessage(ctx, L, item)]);
      const updated: ItineraryItem = { ...item, status: to };
      await updateRow<ItineraryItem>("itinerary", item.id, updated);
      return ctx.reply([await detailMessage(ctx, L, updated)]);
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/line-handlers/plan.test.ts`
Expected: PASS.

Then run: `npx tsc --noEmit`
Expected: exits 0 with no output (tsc must stay green after every task commit).

- [ ] **Step 6: Commit**

```bash
git add lib/line-handlers/plan.ts lib/line-handlers/plan.test.ts lib/line-handlers/stubs.test.ts
git commit -m "$(cat <<'EOF'
feat(line): plan handler - overview, detail, album, done toggle via LINE

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Transport query parsing and departure maths (`lib/line-transport.ts`)

**Files:**
- Create: `lib/line-transport.ts`
- Test: `lib/line-transport.test.ts`

**Interfaces:**
- Consumes (foundation): `extractDate`, `TripDateCtx` from `@/lib/line-date`; existing `normalizeTime(input: string): string` from `@/lib/time`.
- Produces:
  - `type TransportQuery = { kind: "next" } | { kind: "day"; date: string } | { kind: "search"; query: string; date: string | null; dateQuery: string } | { kind: "out_of_range" }` (`query` = the FULL text; `date`/`dateQuery` = in-trip date token and the text after it, used as a fallback)
  - `parseTransportQuery(rest: string, next: boolean, ctx: TripDateCtx): TransportQuery`
  - `runTransportSearch(list: Transport[], q: { query: string; date: string | null; dateQuery: string }): Transport[]`
  - `departureTimes(t: Transport): string[]` (normalized, unique, sorted)
  - `effectiveDeparture(t: Transport, nowHHMM: string, isToday: boolean): { time: string; exhausted: boolean }`
  - `addMinutes(hhmm: string, minutes: number): string` (wraps at 24h)
  - `arrivalTime(t: Transport, dep: string): string`
  - `isPast(t: Transport, nowHHMM: string): boolean` (today only)
  - `sortTransports(list: Transport[], nowHHMM: string, isToday: boolean): Transport[]`
  - `nextTransport(list: Transport[], nowHHMM: string): Transport | null` (list = today's rows)
  - `countdown(nowHHMM: string, hhmm: string): string`
  - `modeIcon(mode: string): string`
  - `searchTransports(list: Transport[], query: string): Transport[]`
  - `transportDates(list: Transport[]): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/line-transport.test.ts
import { describe, it, expect } from "vitest";
import type { Transport } from "@/lib/models/types";
import {
  parseTransportQuery,
  departureTimes,
  effectiveDeparture,
  addMinutes,
  arrivalTime,
  isPast,
  sortTransports,
  nextTransport,
  countdown,
  modeIcon,
  searchTransports,
  runTransportSearch,
  transportDates,
} from "./line-transport";

const CTX = { start: "2026-11-19", end: "2026-11-23", today: "2026-11-20" };

function tr(over: Partial<Transport>): Transport {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", from: "A", to: "B", mode: "", pickup_point: "",
    pickup_photo_ids: [], departure_times: [], depart_time: "", arrive_time: "", duration_min: 0,
    alt_option: "", price_amount: 0, price_currency: "", fx_rate: 0, price_thb: 0, payer: "",
    pay_timing: "prepaid", paid: false, slip_photo_ids: [], notes: "", ...over,
  };
}

const ROUNDS = tr({ id: "m1", departure_times: ["09:00", "10:30", "12:00"], duration_min: 30 });

describe("parseTransportQuery", () => {
  it("next flag wins", () => expect(parseTransportQuery("", true, CTX)).toEqual({ kind: "next" }));
  it("empty rest is today", () => expect(parseTransportQuery("", false, CTX)).toEqual({ kind: "day", date: "2026-11-20" }));
  it("date tokens", () => {
    expect(parseTransportQuery("พรุ่งนี้", false, CTX)).toEqual({ kind: "day", date: "2026-11-21" });
    expect(parseTransportQuery("21/11", false, CTX)).toEqual({ kind: "day", date: "2026-11-21" });
    expect(parseTransportQuery("วันที่ 3", false, CTX)).toEqual({ kind: "day", date: "2026-11-21" });
  });
  it("anything else is a trip-wide search", () => {
    expect(parseTransportQuery("ดิสนีย์", false, CTX)).toEqual({ kind: "search", query: "ดิสนีย์", date: null, dateQuery: "" });
  });
  it("a date followed by more text keeps the full text as the query", () => {
    expect(parseTransportQuery("พรุ่งนี้ ดิสนีย์", false, CTX)).toEqual({
      kind: "search", query: "พรุ่งนี้ ดิสนีย์", date: "2026-11-21", dateQuery: "ดิสนีย์",
    });
    expect(parseTransportQuery("Sun Yat Sen", false, CTX)).toMatchObject({ kind: "search", query: "Sun Yat Sen" });
    expect(parseTransportQuery("1/12 ดิสนีย์", false, CTX)).toEqual({ kind: "search", query: "1/12 ดิสนีย์", date: null, dateQuery: "" });
  });
  it("date outside the trip", () => expect(parseTransportQuery("1/12", false, CTX)).toEqual({ kind: "out_of_range" }));
});

describe("departureTimes / effectiveDeparture", () => {
  it("normalizes, dedupes and sorts rounds", () => {
    expect(departureTimes(tr({ departure_times: [" 12:00", "9:00", "09:00"] }))).toEqual(["09:00", "12:00"]);
  });
  it("today with rounds: first round at or after now, else the last one (exhausted)", () => {
    expect(effectiveDeparture(ROUNDS, "08:00", true)).toEqual({ time: "09:00", exhausted: false });
    expect(effectiveDeparture(ROUNDS, "10:00", true)).toEqual({ time: "10:30", exhausted: false });
    expect(effectiveDeparture(ROUNDS, "12:00", true)).toEqual({ time: "12:00", exhausted: false });
    expect(effectiveDeparture(ROUNDS, "13:00", true)).toEqual({ time: "12:00", exhausted: true });
  });
  it("rounds on another day: depart_time if set, else the first round", () => {
    expect(effectiveDeparture(ROUNDS, "13:00", false)).toEqual({ time: "09:00", exhausted: false });
    expect(effectiveDeparture({ ...ROUNDS, depart_time: "10:30" }, "13:00", false)).toEqual({ time: "10:30", exhausted: false });
  });
  it("single trip uses depart_time", () => {
    expect(effectiveDeparture(tr({ depart_time: "08:00" }), "10:00", true)).toEqual({ time: "08:00", exhausted: false });
  });
});

describe("addMinutes / arrivalTime", () => {
  it("addMinutes wraps past midnight", () => {
    expect(addMinutes("10:30", 30)).toBe("11:00");
    expect(addMinutes("23:50", 20)).toBe("00:10");
  });
  it("arrive_time belongs to depart_time", () => {
    expect(arrivalTime(tr({ depart_time: "08:00", arrive_time: "08:20" }), "08:00")).toBe("08:20");
  });
  it("otherwise departure + duration", () => {
    expect(arrivalTime(ROUNDS, "10:30")).toBe("11:00");
    expect(arrivalTime({ ...ROUNDS, depart_time: "09:00", arrive_time: "09:30" }, "12:00")).toBe("12:30");
  });
  it("no arrival info → empty", () => {
    expect(arrivalTime(tr({ depart_time: "08:00" }), "08:00")).toBe("");
  });
});

describe("isPast / sortTransports / nextTransport", () => {
  const ferry = tr({ id: "f1", depart_time: "08:00", arrive_time: "08:20" });
  const noArrive = tr({ id: "n1", depart_time: "09:00" });
  const overnight = tr({ id: "o1", depart_time: "23:00", arrive_time: "01:00" });
  const blank = tr({ id: "b1" });
  it("isPast by arrival, or by departure when there is no arrival", () => {
    expect(isPast(ferry, "10:00")).toBe(true);
    expect(isPast(ROUNDS, "10:00")).toBe(false);
    expect(isPast(ROUNDS, "13:00")).toBe(true);
    expect(isPast(noArrive, "10:00")).toBe(true);
    expect(isPast(overnight, "23:30")).toBe(false);
    expect(isPast(blank, "23:30")).toBe(false);
  });
  it("sorts by effective departure, blanks last", () => {
    expect(sortTransports([blank, ROUNDS, ferry], "10:00", true).map((t) => t.id)).toEqual(["f1", "m1", "b1"]);
  });
  it("next = earliest upcoming, not exhausted", () => {
    expect(nextTransport([ferry, ROUNDS], "10:00")?.id).toBe("m1");
    expect(nextTransport([ferry, ROUNDS], "13:00")).toBeNull();
  });
});

describe("countdown", () => {
  it("formats minutes and hours", () => {
    expect(countdown("10:00", "10:30")).toBe("อีก 30 นาที");
    expect(countdown("10:00", "11:00")).toBe("อีก 1 ชม.");
    expect(countdown("10:00", "11:15")).toBe("อีก 1 ชม. 15 นาที");
    expect(countdown("10:00", "10:00")).toBe("ออกตอนนี้");
  });
  it("does not count across midnight", () => expect(countdown("23:50", "00:10")).toBe(""));
});

describe("modeIcon", () => {
  it.each([
    ["MTR", "🚇"], ["รถไฟ", "🚇"], ["Airport Express train", "🚇"], ["Metro", "🚇"],
    ["Bus", "🚌"], ["บัส", "🚌"], ["รถเมล์", "🚌"],
    ["Ferry", "⛴"], ["เรือ", "⛴"],
    ["Taxi", "🚕"], ["แท็กซี่", "🚕"], ["DiDi", "🚕"], ["Uber", "🚕"], ["Grab", "🚕"],
    ["เดิน", "🚶"], ["walk", "🚶"],
    ["Flight", "✈️"], ["เครื่องบิน", "✈️"],
    ["cable car", "🧭"], ["", "🧭"],
  ])("%s → %s", (mode, icon) => expect(modeIcon(mode)).toBe(icon));
});

describe("searchTransports / transportDates", () => {
  const list = [
    tr({ id: "1", day_date: "2026-11-21", to: "Disneyland", depart_time: "09:00" }),
    tr({ id: "2", pickup_point: "Exit B Disney" }),
    tr({ id: "3", notes: "nothing here" }),
    tr({ id: "4", mode: "DISNEY bus", depart_time: "08:00" }),
    tr({ id: "5", day_date: "", notes: "disney shuttle" }),
  ];
  it("case-insensitive contains over from/to/mode/notes/pickup_point, by day then departure", () => {
    expect(searchTransports(list, "disney").map((t) => t.id)).toEqual(["4", "2", "1", "5"]);
  });
  it("blank query finds nothing", () => expect(searchTransports(list, "  ")).toEqual([]));
  it("runTransportSearch: full text first, then date + remainder", () => {
    const more = [...list, tr({ id: "s", to: "Sun Yat Sen Memorial Hall" })];
    expect(runTransportSearch(more, { query: "Sun Yat Sen", date: "2026-11-22", dateQuery: "Yat Sen" }).map((t) => t.id)).toEqual(["s"]);
    expect(runTransportSearch(more, { query: "พรุ่งนี้ disney", date: "2026-11-21", dateQuery: "disney" }).map((t) => t.id)).toEqual(["1"]);
    expect(runTransportSearch(more, { query: "zzz", date: null, dateQuery: "" })).toEqual([]);
  });
  it("transportDates are unique, sorted, non-empty", () => {
    expect(transportDates(list)).toEqual(["2026-11-20", "2026-11-21"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-transport.test.ts`
Expected: FAIL — `Failed to resolve import "./line-transport"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/line-transport.ts
import type { Transport } from "@/lib/models/types";
import { extractDate, type TripDateCtx } from "@/lib/line-date";
import { normalizeTime } from "@/lib/time";

export type TransportQuery =
  | { kind: "next" }
  | { kind: "day"; date: string }
  | { kind: "search"; query: string; date: string | null; dateQuery: string }
  | { kind: "out_of_range" };

// The router already matched เดินทาง (next=false) or รอบต่อไป / รถรอบถัดไป
// (next=true) and handled the expense ambiguity; `rest` is what follows.
// A date token only means "that day" when it is ALL there is. With more text
// the token may be part of a name ("Sun Yat Sen" reads "sun" as Sunday,
// "อาทิตย์…"), so the full text is the query; the date + remainder are kept
// as a fallback search ("พรุ่งนี้ ดิสนีย์" = ดิสนีย์ on tomorrow).
export function parseTransportQuery(rest: string, next: boolean, ctx: TripDateCtx): TransportQuery {
  if (next) return { kind: "next" };
  const text = rest.trim().replace(/s+/g, " ");
  if (text === "") return { kind: "day", date: ctx.today };
  const { date, rest: left, outOfRange } = extractDate(text, ctx);
  const leftover = left.trim();
  if (leftover === "") {
    if (outOfRange) return { kind: "out_of_range" };
    if (date) return { kind: "day", date };
  }
  const inTripDate = outOfRange ? null : date;
  return { kind: "search", query: text, date: inTripDate, dateQuery: inTripDate ? leftover : "" };
}

// Plain code-point comparison -- HH:MM / ISO dates are zero-padded, and "~"
// sorts after every digit, which is how blanks go last. (localeCompare would
// put punctuation before digits.)
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};
const pad = (n: number): string => String(n).padStart(2, "0");

export function departureTimes(t: Transport): string[] {
  return [...new Set(t.departure_times.map((s) => normalizeTime(s)).filter(Boolean))].sort(cmp);
}

export function effectiveDeparture(t: Transport, nowHHMM: string, isToday: boolean): { time: string; exhausted: boolean } {
  const times = departureTimes(t);
  if (times.length > 0 && isToday) {
    const upcoming = times.find((x) => x >= nowHHMM);
    return upcoming ? { time: upcoming, exhausted: false } : { time: times[times.length - 1], exhausted: true };
  }
  if (times.length > 0) return { time: normalizeTime(t.depart_time) || times[0], exhausted: false };
  return { time: normalizeTime(t.depart_time), exhausted: false };
}

export function addMinutes(hhmm: string, minutes: number): string {
  const total = (((toMin(hhmm) + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// arrive_time is paired with depart_time; for any other round (multi-departure
// legs) derive arrival from duration_min instead of showing a stale time.
export function arrivalTime(t: Transport, dep: string): string {
  if (t.arrive_time && dep === normalizeTime(t.depart_time)) return normalizeTime(t.arrive_time);
  if (t.duration_min > 0 && dep) return addMinutes(dep, t.duration_min);
  return "";
}

// Today only. An arrival earlier than the departure is an overnight leg and
// never counts as past on the departure day.
export function isPast(t: Transport, nowHHMM: string): boolean {
  const dep = effectiveDeparture(t, nowHHMM, true);
  if (!dep.time) return false;
  const arr = arrivalTime(t, dep.time);
  if (arr) return arr >= dep.time && arr < nowHHMM;
  return dep.time < nowHHMM;
}

export function sortTransports(list: Transport[], nowHHMM: string, isToday: boolean): Transport[] {
  const key = (t: Transport) => effectiveDeparture(t, nowHHMM, isToday).time || "~";
  return [...list].sort((a, b) => cmp(key(a), key(b)));
}

export function nextTransport(list: Transport[], nowHHMM: string): Transport | null {
  for (const t of sortTransports(list, nowHHMM, true)) {
    const dep = effectiveDeparture(t, nowHHMM, true);
    if (dep.time && !dep.exhausted && dep.time >= nowHHMM) return t;
  }
  return null;
}

export function countdown(nowHHMM: string, hhmm: string): string {
  if (!nowHHMM || !hhmm) return "";
  const diff = toMin(hhmm) - toMin(nowHHMM);
  if (diff < 0) return "";
  if (diff === 0) return "ออกตอนนี้";
  if (diff < 60) return `อีก ${diff} นาที`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `อีก ${h} ชม.` : `อีก ${h} ชม. ${m} นาที`;
}

const MODE_GROUPS: [string[], string][] = [
  [["mtr", "รถไฟ", "train", "metro"], "🚇"],
  [["bus", "บัส", "รถเมล์"], "🚌"],
  [["ferry", "เรือ"], "⛴"],
  [["taxi", "แท็กซี่", "didi", "uber", "grab"], "🚕"],
  [["เดิน", "walk"], "🚶"],
  [["flight", "บิน"], "✈️"],
];

export function modeIcon(mode: string): string {
  const m = mode.toLowerCase();
  return MODE_GROUPS.find(([words]) => words.some((w) => m.includes(w)))?.[1] ?? "🧭";
}

export function searchTransports(list: Transport[], query: string): Transport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (t: Transport) => [t.from, t.to, t.mode, t.notes, t.pickup_point].some((f) => (f || "").toLowerCase().includes(q));
  const key = (t: Transport) => `${t.day_date || "~"} ${effectiveDeparture(t, "", false).time || "~"}`;
  return list.filter(hit).sort((a, b) => cmp(key(a), key(b)));
}

// Full-text search first; if that finds nothing and the text started with a
// date, search the remainder within that day only.
export function runTransportSearch(list: Transport[], q: { query: string; date: string | null; dateQuery: string }): Transport[] {
  const full = searchTransports(list, q.query);
  if (full.length > 0 || !q.date || !q.dateQuery) return full;
  return searchTransports(list.filter((t) => t.day_date === q.date), q.dateQuery);
}

export function transportDates(list: Transport[]): string[] {
  return [...new Set(list.map((t) => t.day_date).filter(Boolean))].sort(cmp);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-transport.test.ts`
Expected: PASS.

Then run: `npx tsc --noEmit`
Expected: exits 0 with no output (tsc must stay green after every task commit).

- [ ] **Step 5: Commit**

```bash
git add lib/line-transport.ts lib/line-transport.test.ts
git commit -m "$(cat <<'EOF'
feat(line): transport query parsing, departure rounds, countdown, mode icons

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Transport list and detail cards (`lib/line-transport-messages.ts`)

**Files:**
- Create: `lib/line-transport-messages.ts`
- Test: `lib/line-transport-messages.test.ts`

**Interfaces:**
- Consumes: Task 5 (`arrivalTime`, `countdown`, `departureTimes`, `effectiveDeparture`, `isPast`, `modeIcon`, `nextTransport`); Task 2 (`PAGE_SIZE`, `btn`, `btnRow`, `clampPage`, `dm`, `needsReadMore`, `section`, `trunc`); foundation `CLAY`, `txt`, `compact`, `postbackAction`, `uriAction`, `imageUrl`, `flexMessage`, `textMessage`, `quickReply`, `FlexNode`; `mapButtons({ query, directions: { mode } })` (applies foundation `toTravelMode` to the raw mode); `thaiDateLabel`, `addDays`; `formatDuration`.
- Produces:
  - `type TransportListMode = { kind: "day"; date: string; start: string; end: string } | { kind: "search"; query: string }`
  - `interface TransportListInput { mode: TransportListMode; transports: Transport[]; nowHHMM: string; today: string; page: number }`
  - `buildTransportList(p: TransportListInput): FlexNode`
  - `interface TransportDetailInput { origin: string; t: Transport; nowHHMM: string; today: string; planItems: ItineraryItem[]; back: { d?: string; q?: string } }`
  - `buildTransportDetail(p: TransportDetailInput): FlexNode`
  - `buildPlanPicker(items: ItineraryItem[]): FlexNode`

- [ ] **Step 1: Write the failing test**

```ts
// lib/line-transport-messages.test.ts
import { describe, it, expect } from "vitest";
import type { ItineraryItem, Transport } from "@/lib/models/types";
import { CLAY, imageUrl } from "@/lib/line-flex";
import { thaiDateLabel } from "@/lib/line-date";
import { buildTransportList, buildTransportDetail, buildPlanPicker, type TransportDetailInput } from "./line-transport-messages";
import { texts, actions, labels, findNode, hasEmptyText, type Node } from "./line-test-helpers";

function tr(over: Partial<Transport>): Transport {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", from: "A", to: "B", mode: "", pickup_point: "",
    pickup_photo_ids: [], departure_times: [], depart_time: "", arrive_time: "", duration_min: 0,
    alt_option: "", price_amount: 0, price_currency: "", fx_rate: 0, price_thb: 0, payer: "",
    pay_timing: "prepaid", paid: false, slip_photo_ids: [], notes: "", ...over,
  };
}
function item(over: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", time: "", end_time: "", title: "t", place: "",
    maps_link: "", notes: "", status: "planned", moved_to_date: "", linked_transport_id: "",
    linked_booking_id: "", sort_order: 0, photo_ids: [], plan_id: "", ...over,
  };
}

const M1 = tr({ id: "m1", from: "Central", to: "Disneyland", mode: "MTR", departure_times: ["09:00", "10:30", "12:00"], duration_min: 30 });
const F1 = tr({ id: "f1", from: "Central", to: "TST", mode: "Ferry", depart_time: "08:00", arrive_time: "08:20" });
const B1 = tr({ id: "b1", day_date: "2026-11-21", from: "广州南站", to: "广州塔", mode: "Bus", depart_time: "09:00" });
const DAY = { kind: "day" as const, date: "2026-11-20", start: "2026-11-19", end: "2026-11-23" };
const NOW = "10:00";
const TODAY = "2026-11-20";

const rowFor = (msg: unknown, id: string): Node | undefined =>
  findNode(msg, (n) => {
    const action = n.action as Node | undefined;
    return n.type === "box" && typeof action?.data === "string" && new URLSearchParams(action.data).get("id") === id;
  });

describe("buildTransportList", () => {
  const list = (over: Partial<Parameters<typeof buildTransportList>[0]> = {}) =>
    buildTransportList({ mode: DAY, transports: [F1, M1], nowHHMM: NOW, today: TODAY, page: 1, ...over });

  it("header and count", () => {
    expect(texts(list())).toEqual(expect.arrayContaining([`🧭 การเดินทาง · ${thaiDateLabel(TODAY)}`, "2 เที่ยว"]));
  });

  it("multi-round row today: next round, arrival from duration, highlighted", () => {
    const row = rowFor(list(), "m1")!;
    expect(texts(row)).toEqual(expect.arrayContaining(["🚇", "10:30", "–11:00", "Central → Disneyland", "MTR · รอบถัดไป 10:30"]));
    expect(row.backgroundColor).toBe(CLAY.nextBg);
  });

  it("finished row today is grey and marked ผ่านไปแล้ว", () => {
    const row = rowFor(list(), "f1")!;
    expect(texts(row)).toEqual(expect.arrayContaining(["⛴", "08:00", "–08:20", "Ferry · ผ่านไปแล้ว"]));
    expect(row.backgroundColor).toBeUndefined();
    expect(findNode(row, (n) => n.text === "Central → TST")?.color).toBe(CLAY.grayInk);
  });

  it("another day: no next-round or past markers", () => {
    const row = rowFor(list({ today: "2026-11-19" }), "m1")!;
    expect(texts(row)).toEqual(expect.arrayContaining(["09:00", "–09:30", "MTR"]));
    expect(texts(row).some((s) => s.includes("รอบถัดไป") || s.includes("ผ่านไปแล้ว"))).toBe(false);
  });

  it("rows open the detail and carry the list's day", () => {
    expect(actions(rowFor(list(), "m1"))[0].data).toEqual({ a: "tr_detail", id: "m1", d: "2026-11-20" });
  });

  it("day buttons hide at the trip edges", () => {
    expect(labels(list({ mode: { ...DAY, date: "2026-11-19" } }))).not.toContain("◀ วันก่อน");
    expect(labels(list({ mode: { ...DAY, date: "2026-11-23" } }))).not.toContain("วันถัดไป ▶");
    const mid = actions(list());
    expect(mid.find((a) => a.label === "◀ วันก่อน")?.data).toEqual({ a: "tr_list", d: "2026-11-19" });
    expect(mid.find((a) => a.label === "วันถัดไป ▶")?.data).toEqual({ a: "tr_list", d: "2026-11-21" });
  });

  it("search mode groups by day, no day buttons, rows carry q", () => {
    const msg = buildTransportList({ mode: { kind: "search", query: "c" }, transports: [M1, B1], nowHHMM: NOW, today: TODAY, page: 1 });
    expect(texts(msg)).toEqual(expect.arrayContaining(['🧭 ค้น "c"', thaiDateLabel("2026-11-20"), thaiDateLabel("2026-11-21")]));
    expect(labels(msg)).not.toContain("◀ วันก่อน");
    expect(actions(rowFor(msg, "b1"))[0].data).toEqual({ a: "tr_detail", id: "b1", q: "c" });
  });

  it("pages after 15 rows", () => {
    const many = Array.from({ length: 20 }, (_, i) => tr({ id: `t${i}`, depart_time: `${String(i).padStart(2, "0")}:00` }));
    const msg = list({ transports: many, today: "2026-11-19" });
    expect(actions(msg).filter((a) => a.data.a === "tr_detail")).toHaveLength(15);
    expect(texts(msg)).toContain("อีก 5 เที่ยว");
    expect(actions(msg).find((a) => a.label === "ดูต่อ")?.data).toEqual({ a: "tr_list", d: "2026-11-20", n: "2" });
    const stale = list({ transports: many.slice(0, 3), today: "2026-11-19", page: 5 });
    expect(actions(stale).filter((a) => a.data.a === "tr_detail")).toHaveLength(3);
  });

  it("empty day", () => {
    expect(texts(list({ transports: [] }))).toContain("ยังไม่มีการเดินทาง");
  });

  it("never emits an empty text node", () => {
    expect(hasEmptyText(list())).toBe(false);
    expect(hasEmptyText(list({ transports: [tr({ from: "", to: "", mode: "" })] }))).toBe(false);
  });
});

describe("buildTransportDetail", () => {
  const BASE: TransportDetailInput = { origin: "https://app.test", t: M1, nowHHMM: NOW, today: TODAY, planItems: [], back: { d: TODAY } };
  const uris = (m: unknown) => actions(m).filter((a) => a.type === "uri").map((a) => a.uri);

  it("header: icon + mode, route, times and duration", () => {
    expect(texts(buildTransportDetail(BASE))).toEqual(
      expect.arrayContaining(["🚇 MTR", "Central → Disneyland", "10:30–11:00 · 30 นาที"]),
    );
  });

  it("departure chips today: past struck through, next highlighted with countdown", () => {
    const msg = buildTransportDetail(BASE);
    expect(findNode(msg, (n) => n.type === "text" && n.text === "09:00")?.decoration).toBe("line-through");
    const next = findNode(msg, (n) => n.type === "text" && n.text === "10:30")!;
    expect(next.weight).toBe("bold");
    expect(next.color).toBe(CLAY.nextInk);
    expect(findNode(msg, (n) => n.type === "text" && n.text === "12:00")?.decoration).toBeUndefined();
    expect(texts(msg)).toContain("รอบถัดไป 10:30 · อีก 30 นาที");
  });

  it("all rounds gone today", () => {
    expect(texts(buildTransportDetail({ ...BASE, nowHHMM: "13:00" }))).toContain("หมดรอบวันนี้แล้ว");
  });

  it("another day: plain chips, no countdown", () => {
    const msg = buildTransportDetail({ ...BASE, today: "2026-11-19" });
    expect(findNode(msg, (n) => n.decoration === "line-through")).toBeUndefined();
    expect(texts(msg).some((s) => s.includes("อีก "))).toBe(false);
  });

  it("pickup point with a tappable photo; album button only for 2+ photos", () => {
    const one = buildTransportDetail({ ...BASE, t: { ...M1, pickup_point: "Exit A", pickup_photo_ids: ["p1"] } });
    const url = imageUrl("https://app.test", "p1");
    expect(texts(one)).toContain("📍 จุดขึ้นรถ: Exit A");
    const img = findNode(one, (n) => n.type === "image")!;
    expect(img.url).toBe(url);
    expect((img.action as Node).uri).toBe(url);
    expect(labels(one).some((l) => l.startsWith("📷"))).toBe(false);
    const two = buildTransportDetail({ ...BASE, t: { ...M1, pickup_photo_ids: ["p1", "p2"] } });
    expect(actions(two).find((a) => a.label === "📷 รูปจุดขึ้นรถ (2)")?.data).toEqual({ a: "tr_photos", id: "m1" });
  });

  it("alternative and price (THB estimate only for foreign currency; 0 hides)", () => {
    const t = { ...M1, alt_option: "Taxi 80 HKD", price_amount: 15, price_currency: "HKD", price_thb: 67.5, payer: "เก่ง" };
    expect(texts(buildTransportDetail({ ...BASE, t }))).toEqual(
      expect.arrayContaining(["🔀 ทางเลือกสำรอง: Taxi 80 HKD", "💰 15 HKD (~68฿) · เก่งจ่าย"]),
    );
    const thb = { ...M1, price_amount: 50, price_currency: "THB", price_thb: 50, payer: "เก่ง" };
    expect(texts(buildTransportDetail({ ...BASE, t: thb }))).toContain("💰 50 THB · เก่งจ่าย");
    expect(texts(buildTransportDetail(BASE)).some((s) => s.startsWith("💰"))).toBe(false);
  });

  it("never shows payment status or slips", () => {
    const t = { ...M1, paid: true, pay_timing: "pay_after" as const, slip_photo_ids: ["slip-1"] };
    const json = JSON.stringify(buildTransportDetail({ ...BASE, t }));
    expect(json).not.toContain("slip-1");
    expect(json).not.toContain("pay_after");
    expect(json).not.toContain('"paid"');
  });

  it("maps: Google directions to the destination (no origin) + Amap", () => {
    const u = uris(buildTransportDetail(BASE));
    const google = u.find((x) => x.startsWith("https://www.google.com/maps/dir/"))!;
    expect(google).toContain("destination=Disneyland");
    expect(google).toContain("travelmode=transit");
    expect(google).not.toContain("origin=");
    expect(u.some((x) => x.startsWith("https://uri.amap.com/search"))).toBe(true);
    const taxi = uris(buildTransportDetail({ ...BASE, t: { ...M1, mode: "Taxi" } }));
    expect(taxi.find((x) => x.startsWith("https://www.google.com/maps/dir/"))).toContain("travelmode=driving");
    const cn = uris(buildTransportDetail({ ...BASE, t: B1 }));
    expect(cn.some((x) => x.includes(encodeURIComponent("广州塔")))).toBe(true);
  });

  it("ดูในแพลน: one linked item → its detail; several → picker; none → hidden", () => {
    const one = actions(buildTransportDetail({ ...BASE, planItems: [item({ id: "it1" })] }));
    expect(one.find((a) => a.label === "📅 ดูในแพลน")?.data).toEqual({ a: "plan_detail", i: "it1", d: "2026-11-20" });
    const two = actions(buildTransportDetail({ ...BASE, planItems: [item({ id: "it1" }), item({ id: "it2" })] }));
    expect(two.find((a) => a.label === "📅 ดูในแพลน")?.data).toEqual({ a: "tr_plan", id: "m1" });
    expect(labels(buildTransportDetail(BASE))).not.toContain("📅 ดูในแพลน");
  });

  it("กลับรายการ returns to the search or the day it came from", () => {
    const fromSearch = actions(buildTransportDetail({ ...BASE, back: { q: "central" } }));
    expect(fromSearch.find((a) => a.label === "กลับรายการ")?.data).toEqual({ a: "tr_list", q: "central" });
    const noBack = actions(buildTransportDetail({ ...BASE, back: {} }));
    expect(noBack.find((a) => a.label === "กลับรายการ")?.data).toEqual({ a: "tr_list", d: "2026-11-20" });
  });

  it("long notes get อ่านต่อ", () => {
    const msg = buildTransportDetail({ ...BASE, t: { ...M1, notes: "x".repeat(200) } });
    expect(actions(msg).find((a) => a.label === "อ่านต่อ")?.data).toEqual({ a: "tr_note", id: "m1" });
  });

  it("a bare transport never emits an empty text node", () => {
    expect(hasEmptyText(buildTransportDetail({ ...BASE, t: tr({ id: "z", from: "", to: "", mode: "" }) }))).toBe(false);
  });
});

describe("buildPlanPicker", () => {
  it("one quick reply per linked item, opening its plan detail", () => {
    const acts = actions(buildPlanPicker([item({ id: "it1", title: "Disney", day_date: "2026-11-21" })]));
    expect(acts[0].label).toBe("21/11 Disney");
    expect(acts[0].data).toEqual({ a: "plan_detail", i: "it1", d: "2026-11-21" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-transport-messages.test.ts`
Expected: FAIL — `Failed to resolve import "./line-transport-messages"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/line-transport-messages.ts
// Flex cards for the LINE "เดินทาง" feature. Deliberately never reads
// paid / pay_timing / slip_photo_ids (payment status stays in the app).
import type { ItineraryItem, Transport } from "@/lib/models/types";
import {
  CLAY,
  txt,
  compact,
  postbackAction,
  uriAction,
  imageUrl,
  flexMessage,
  textMessage,
  quickReply,
  type FlexNode,
} from "@/lib/line-flex";
import { mapButtons } from "@/lib/line-maps";
import { thaiDateLabel, addDays } from "@/lib/line-date";
import { formatDuration } from "@/lib/time";
import { PAGE_SIZE, btn, btnRow, clampPage, dm, needsReadMore, section, trunc } from "@/lib/line-plan-messages";
import {
  arrivalTime,
  countdown,
  departureTimes,
  effectiveDeparture,
  isPast,
  modeIcon,
  nextTransport,
} from "@/lib/line-transport";

export type TransportListMode =
  | { kind: "day"; date: string; start: string; end: string }
  | { kind: "search"; query: string };

export interface TransportListInput {
  mode: TransportListMode;
  transports: Transport[]; // already ordered (sortTransports for a day, searchTransports for a search)
  nowHHMM: string;
  today: string;
  page: number;            // 1-based
}

type Back = { d?: string; q?: string };

function listRow(t: Transport, nowHHMM: string, today: string, nextId: string | null, back: Back): FlexNode {
  const isToday = t.day_date === today;
  const dep = effectiveDeparture(t, nowHHMM, isToday);
  const arr = arrivalTime(t, dep.time);
  const past = isToday && isPast(t, nowHHMM);
  const isNext = t.id === nextId;
  const multi = departureTimes(t).length > 0;
  const suffix = past ? "ผ่านไปแล้ว" : isToday && multi && !dep.exhausted && dep.time ? `รอบถัดไป ${dep.time}` : "";
  const ink = past ? CLAY.grayInk : isNext ? CLAY.nextInk : CLAY.ink;
  const weight = isNext ? "bold" : "regular";
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    paddingAll: "8px",
    cornerRadius: "10px",
    ...(isNext ? { backgroundColor: CLAY.nextBg } : {}),
    action: postbackAction("เปิด", { a: "tr_detail", id: t.id, d: back.d, q: back.q }),
    contents: compact<FlexNode>([
      txt(modeIcon(t.mode), { size: "sm", flex: 0 }),
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        width: "52px",
        contents: compact<FlexNode>([
          txt(dep.time || "—", { size: "sm", color: ink, weight }),
          txt(arr ? `–${arr}` : null, { size: "xs", color: CLAY.muted }),
        ]),
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact<FlexNode>([
          txt(`${t.from || "?"} → ${t.to || "?"}`, { size: "sm", color: ink, weight, wrap: true }),
          txt([t.mode, suffix].filter(Boolean).join(" · "), { size: "xs", color: past ? CLAY.grayInk : CLAY.muted, wrap: true }),
        ]),
      },
    ]),
  };
}

export function buildTransportList(input: TransportListInput): FlexNode {
  const p = { ...input, page: clampPage(input.page, input.transports.length) };
  const pageStart = (p.page - 1) * PAGE_SIZE;
  const shown = p.transports.slice(pageStart, pageStart + PAGE_SIZE);
  const remaining = p.transports.length - pageStart - shown.length;
  const nextId = nextTransport(p.transports.filter((t) => t.day_date === p.today), p.nowHHMM)?.id ?? null;
  const back: Back = p.mode.kind === "day" ? { d: p.mode.date } : { q: p.mode.query };

  const rows: (FlexNode | null)[] = [];
  let lastDay: string | null = null;
  for (const t of shown) {
    if (p.mode.kind === "search" && t.day_date !== lastDay) {
      rows.push(txt(t.day_date ? thaiDateLabel(t.day_date) : "ไม่ระบุวัน", { size: "xs", weight: "bold", color: CLAY.coral, margin: "md" }));
      lastDay = t.day_date;
    }
    rows.push(listRow(t, p.nowHHMM, p.today, nextId, back));
  }

  const title = p.mode.kind === "day" ? `🧭 การเดินทาง · ${thaiDateLabel(p.mode.date)}` : `🧭 ค้น "${p.mode.query}"`;
  const body = compact<FlexNode>([
    txt(title, { weight: "bold", size: "md", color: CLAY.coral, wrap: true }),
    txt(`${p.transports.length} เที่ยว`, { size: "xs", color: CLAY.muted }),
    { type: "separator", margin: "md", color: CLAY.line },
    ...(rows.length > 0 ? rows : [txt("ยังไม่มีการเดินทาง", { size: "sm", color: CLAY.muted, margin: "md" })]),
    remaining > 0 ? txt(`อีก ${remaining} เที่ยว`, { size: "xs", color: CLAY.muted, margin: "md" }) : null,
  ]);

  const nav =
    p.mode.kind === "day"
      ? compact<FlexNode>([
          p.mode.date > p.mode.start ? btn(postbackAction("◀ วันก่อน", { a: "tr_list", d: addDays(p.mode.date, -1) })) : null,
          p.mode.date < p.mode.end ? btn(postbackAction("วันถัดไป ▶", { a: "tr_list", d: addDays(p.mode.date, 1) })) : null,
        ])
      : [];
  const footer = compact<FlexNode>([
    remaining > 0 ? btn(postbackAction("ดูต่อ", { a: "tr_list", d: back.d, q: back.q, n: p.page + 1 }), "primary") : null,
    btnRow(nav),
  ]);

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: CLAY.card, contents: body },
    ...(footer.length > 0
      ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", backgroundColor: CLAY.cream, contents: footer } }
      : {}),
  };
  return flexMessage(trunc(title, 400), bubble);
}

export interface TransportDetailInput {
  origin: string;
  t: Transport;
  nowHHMM: string;
  today: string;
  planItems: ItineraryItem[]; // itinerary rows whose linked_transport_id === t.id
  back: Back;                 // where "กลับรายการ" goes
}

function chipsSection(t: Transport, nowHHMM: string, isToday: boolean): FlexNode | null {
  const times = departureTimes(t);
  if (times.length === 0) return null;
  const dep = effectiveDeparture(t, nowHHMM, isToday);
  const chips = times.map((tm): FlexNode => {
    const past = isToday && tm < nowHHMM;
    const next = isToday && !dep.exhausted && tm === dep.time;
    return {
      type: "box",
      layout: "vertical",
      flex: 1,
      paddingAll: "4px",
      cornerRadius: "8px",
      backgroundColor: next ? CLAY.nextBg : CLAY.card,
      contents: [
        {
          type: "text",
          text: tm,
          size: "xs",
          align: "center",
          color: past ? CLAY.grayInk : next ? CLAY.nextInk : CLAY.ink,
          weight: next ? "bold" : "regular",
          ...(past ? { decoration: "line-through" } : {}),
        },
      ],
    };
  });
  // Flex boxes don't wrap, so lay chips out 4 per row (filler keeps widths even).
  const rows: FlexNode[] = [];
  for (let i = 0; i < chips.length; i += 4) {
    const slice = chips.slice(i, i + 4);
    while (slice.length < 4) slice.push({ type: "filler" });
    rows.push({ type: "box", layout: "horizontal", spacing: "xs", contents: slice });
  }
  const left = isToday && !dep.exhausted ? countdown(nowHHMM, dep.time) : "";
  return section(
    compact<FlexNode>([
      txt("🕒 รอบออก", { size: "xs", color: CLAY.muted }),
      ...rows,
      isToday && dep.exhausted ? txt("หมดรอบวันนี้แล้ว", { size: "sm", weight: "bold", color: CLAY.coral }) : null,
      left ? txt(`รอบถัดไป ${dep.time} · ${left}`, { size: "sm", weight: "bold", color: CLAY.nextInk }) : null,
    ]),
  );
}

export function buildTransportDetail(p: TransportDetailInput): FlexNode {
  const { t } = p;
  const isToday = t.day_date === p.today;
  const dep = effectiveDeparture(t, p.nowHHMM, isToday);
  const arr = arrivalTime(t, dep.time);
  const timeLine = [dep.time ? (arr ? `${dep.time}–${arr}` : dep.time) : "", formatDuration(t.duration_min)]
    .filter(Boolean)
    .join(" · ");

  const pickupPhoto = t.pickup_photo_ids[0];
  const pickupUrl = pickupPhoto ? imageUrl(p.origin, pickupPhoto) : "";
  const pickup =
    t.pickup_point || pickupPhoto
      ? section(
          compact<FlexNode>([
            txt(t.pickup_point ? `📍 จุดขึ้นรถ: ${t.pickup_point}` : "📍 จุดขึ้นรถ", { size: "sm", color: CLAY.ink, wrap: true }),
            pickupPhoto
              ? {
                  type: "image",
                  url: pickupUrl,
                  size: "full",
                  aspectRatio: "4:3",
                  aspectMode: "cover",
                  margin: "sm",
                  action: uriAction("ดูรูปเต็ม", pickupUrl),
                }
              : null,
            pickupPhoto ? txt("แตะรูปเพื่อขยาย", { size: "xxs", color: CLAY.muted }) : null,
          ]),
        )
      : null;

  const priceText =
    t.price_amount > 0
      ? `💰 ${t.price_amount} ${t.price_currency}` +
        (t.price_thb > 0 && t.price_currency !== "THB" ? ` (~${Math.round(t.price_thb)}฿)` : "") +
        (t.payer ? ` · ${t.payer}จ่าย` : "")
      : null;

  const body = compact<FlexNode>([
    txt(`${modeIcon(t.mode)} ${t.mode || "การเดินทาง"}`, { weight: "bold", size: "md", color: CLAY.coral, wrap: true }),
    txt(`${t.from || "?"} → ${t.to || "?"}`, { weight: "bold", size: "lg", color: CLAY.ink, wrap: true }),
    txt(timeLine, { size: "sm", color: CLAY.muted }),
    chipsSection(t, p.nowHHMM, isToday),
    pickup,
    txt(t.alt_option ? `🔀 ทางเลือกสำรอง: ${t.alt_option}` : null, { size: "sm", color: CLAY.ink, wrap: true, margin: "md" }),
    txt(priceText, { size: "sm", color: CLAY.ink, wrap: true, margin: "md" }),
    txt(t.notes, { size: "sm", color: CLAY.ink, wrap: true, maxLines: 3, margin: "md" }),
    t.notes && needsReadMore(t.notes) ? btn(postbackAction("อ่านต่อ", { a: "tr_note", id: t.id }), "link") : null,
  ]);

  const maps = t.to ? mapButtons({ query: t.to, directions: { mode: t.mode } }) : [];
  const planBtn =
    p.planItems.length === 1
      ? btn(postbackAction("📅 ดูในแพลน", { a: "plan_detail", i: p.planItems[0].id, d: p.planItems[0].day_date }))
      : p.planItems.length > 1
        ? btn(postbackAction("📅 ดูในแพลน", { a: "tr_plan", id: t.id }))
        : null;
  const backData = p.back.q ? { a: "tr_list", q: p.back.q } : { a: "tr_list", d: p.back.d || t.day_date || undefined };
  const footer = compact<FlexNode>([
    btnRow(maps),
    t.pickup_photo_ids.length >= 2
      ? btn(postbackAction(`📷 รูปจุดขึ้นรถ (${t.pickup_photo_ids.length})`, { a: "tr_photos", id: t.id }))
      : null,
    btnRow(compact<FlexNode>([planBtn, btn(postbackAction("กลับรายการ", backData))])),
  ]);

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: CLAY.card, contents: body },
    footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", backgroundColor: CLAY.cream, contents: footer },
  };
  return flexMessage(trunc(`${t.from || "?"} → ${t.to || "?"}`, 400), bubble);
}

export function buildPlanPicker(items: ItineraryItem[]): FlexNode {
  return textMessage(
    "เลือกรายการในแพลน",
    quickReply(
      items.slice(0, 13).map((it) => ({
        label: `${dm(it.day_date)} ${it.title || "รายการ"}`,
        data: { a: "plan_detail", i: it.id, d: it.day_date },
      })),
    ),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-transport-messages.test.ts`
Expected: PASS.

Then run: `npx tsc --noEmit`
Expected: exits 0 with no output (tsc must stay green after every task commit).

- [ ] **Step 5: Commit**

```bash
git add lib/line-transport-messages.ts lib/line-transport-messages.test.ts
git commit -m "$(cat <<'EOF'
feat(line): transport list and detail cards with rounds, pickup, directions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Transport handler (`lib/line-handlers/transport.ts`) + full verification

**Files:**
- Replace: `lib/line-handlers/transport.ts` (overwrite the foundation stub entirely)
- Test: `lib/line-handlers/transport.test.ts`

**Interfaces:**
- Consumes: Task 5 (`parseTransportQuery`, `runTransportSearch`, `sortTransports`, `nextTransport`, `searchTransports`, `transportDates`); Task 6 (`buildTransportList`, `buildTransportDetail`, `buildPlanPicker`); Task 1 (`inTrip`, `dayWindow`); Task 2 (`albumMessage`, `buildDayPicker`, `tripRangeText`); foundation `listRows`, `tripDateCtx`, `nowHHMMInTz`, `textMessage`, `NO_TRIP_TEXT`, `Route`, `HandlerCtx`, `PostbackData`.
- Produces (called by foundation dispatch): `handleRoute(ctx: HandlerCtx, route: Route): Promise<void>`, `handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void>`.

- [ ] **Step 0: Take `transport` out of the stub test**

`lib/line-handlers/transport.ts` stops being a stub in this task. Re-read `lib/line-handlers/stubs.test.ts` (the foundation may have changed its expectations, e.g. silence in groups), then delete the import

```ts
import * as transport from "./transport";
```

and every table row / test case that passes the `transport` module (in the foundation version, the `describe.each` row)

```ts
  ["transport", transport],
```

Run: `npm test -- lib/line-handlers/stubs.test.ts` — Expected: PASS (remaining stubs only).

- [ ] **Step 1: Write the failing test**

```ts
// lib/line-handlers/transport.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/store", () => ({ listRows: vi.fn() }));

import { listRows } from "@/lib/store";
import type { FlexNode } from "@/lib/line-flex";
import type { Route } from "@/lib/line-router";
import type { ItineraryItem, Transport, Trip } from "@/lib/models/types";
import type { HandlerCtx } from "./types";
import { handleRoute, handlePostback } from "./transport";
import { texts, labels, type Node } from "../line-test-helpers";

const TRIP: Trip = {
  id: "t1", name: "HK", destination: "Hong Kong", start_date: "2026-11-19", end_date: "2026-11-23",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const NOW = new Date("2026-11-20T02:00:00Z"); // 10:00 on Fri 20 Nov in Hong Kong

function tr(over: Partial<Transport>): Transport {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", from: "A", to: "B", mode: "", pickup_point: "",
    pickup_photo_ids: [], departure_times: [], depart_time: "", arrive_time: "", duration_min: 0,
    alt_option: "", price_amount: 0, price_currency: "", fx_rate: 0, price_thb: 0, payer: "",
    pay_timing: "prepaid", paid: false, slip_photo_ids: [], notes: "", ...over,
  };
}
function item(over: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", time: "", end_time: "", title: "t", place: "",
    maps_link: "", notes: "", status: "planned", moved_to_date: "", linked_transport_id: "",
    linked_booking_id: "", sort_order: 0, photo_ids: [], plan_id: "", ...over,
  };
}

let DB: { transports: Transport[]; itinerary: ItineraryItem[] };
const fakeListRows = async (entity: string) => (DB as unknown as Record<string, unknown[]>)[entity] ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  DB = {
    transports: [
      tr({
        id: "m1", from: "Central", to: "Disneyland", mode: "MTR", departure_times: ["09:00", "10:30", "12:00"],
        duration_min: 30, paid: true, slip_photo_ids: ["slip-1"], pickup_photo_ids: ["p1", "p2"], notes: "exit B",
      }),
      tr({ id: "f1", from: "Central", to: "TST", mode: "Ferry", depart_time: "08:00", arrive_time: "08:20" }),
      tr({ id: "b1", day_date: "2026-11-21", from: "广州南站", to: "广州塔", mode: "Bus", depart_time: "09:00" }),
    ],
    itinerary: [
      item({ id: "it1", title: "Go Disney", linked_transport_id: "m1" }),
      item({ id: "it2", day_date: "2026-11-21", title: "Back again", linked_transport_id: "m1" }),
    ],
  };
  vi.mocked(listRows).mockImplementation(fakeListRows as unknown as typeof listRows);
});

function makeCtx(trip: Trip | null = TRIP) {
  const reply = vi.fn<(messages: FlexNode[]) => Promise<void>>(async () => {});
  const ctx: HandlerCtx = {
    event: { type: "message", source: { type: "user", userId: "U1" } },
    replyToken: "rt",
    accessToken: "tok",
    origin: "https://app.test",
    now: NOW,
    userKey: "user:U1",
    isGroup: false,
    trip,
    reply,
  };
  return { ctx, reply };
}

const sent = (reply: ReturnType<typeof makeCtx>["reply"]): FlexNode[] => reply.mock.calls[0][0];
const trRoute = (rest: string, next = false): Route => ({ kind: "transport", rest, next });

describe("transport handleRoute", () => {
  it("ignores routes for other features", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, { kind: "plan", rest: "" });
    expect(reply).not.toHaveBeenCalled();
  });

  it("no active trip → the standard message", async () => {
    const { ctx, reply } = makeCtx(null);
    await handleRoute(ctx, trRoute(""));
    expect(texts(sent(reply))[0]).toBe('ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ');
  });

  it("เดินทาง → today's list", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, trRoute(""));
    expect(texts(sent(reply))).toEqual(expect.arrayContaining(["2 เที่ยว", "Central → Disneyland", "Central → TST"]));
  });

  it("เดินทาง พรุ่งนี้ → that day's list", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, trRoute("พรุ่งนี้"));
    expect(texts(sent(reply))).toEqual(expect.arrayContaining(["1 เที่ยว", "广州南站 → 广州塔"]));
  });

  it("a single search hit goes straight to the detail card", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, trRoute("disney"));
    expect(texts(sent(reply))).toEqual(expect.arrayContaining(["🕒 รอบออก", "รอบถัดไป 10:30 · อีก 30 นาที"]));
  });

  it("a date plus a name searches that name on that day", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, trRoute("วันนี้ disney"));
    expect(texts(sent(reply))).toEqual(expect.arrayContaining(["🕒 รอบออก", "Central → Disneyland"]));
  });

  it("several search hits → list", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, trRoute("central"));
    expect(texts(sent(reply))).toContain('🧭 ค้น "central"');
  });

  it("no search hit → message + days that have transport", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, trRoute("xyz"));
    const msg = sent(reply)[0];
    expect(texts(msg)[0]).toBe('ไม่เจอการเดินทาง "xyz"');
    expect(labels(msg)).toEqual(["วันที่ 2 · 20/11", "วันที่ 3 · 21/11"]);
  });

  it("date outside the trip", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, trRoute("1/12"));
    expect(texts(sent(reply))[0]).toMatch(/^ทริปอยู่ระหว่าง /);
  });

  it("รอบต่อไป → detail of the next departure with countdown, no payment data", async () => {
    const { ctx, reply } = makeCtx();
    await handleRoute(ctx, trRoute("", true));
    const msgs = sent(reply);
    expect(texts(msgs)).toEqual(expect.arrayContaining(["Central → Disneyland", "รอบถัดไป 10:30 · อีก 30 นาที"]));
    expect(JSON.stringify(msgs)).not.toContain("slip-1");
  });

  it("รอบต่อไป after the last departure → message + today's list", async () => {
    const { ctx, reply } = makeCtx();
    ctx.now = new Date("2026-11-20T06:00:00Z"); // 14:00 HK
    await handleRoute(ctx, trRoute("", true));
    const msgs = sent(reply);
    expect(texts(msgs[0])).toEqual(["วันนี้ไม่มีการเดินทางรอบถัดไปแล้ว"]);
    expect(msgs).toHaveLength(2);
  });
});

describe("transport handlePostback", () => {
  it("tr_list by day and by query", async () => {
    const a = makeCtx();
    await handlePostback(a.ctx, { a: "tr_list", d: "2026-11-21" });
    expect(texts(sent(a.reply))).toContain("广州南站 → 广州塔");
    const b = makeCtx();
    await handlePostback(b.ctx, { a: "tr_list", q: "central" });
    expect(texts(sent(b.reply))).toContain('🧭 ค้น "central"');
  });

  it("tr_detail shows the card and its plan link", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "tr_detail", id: "m1", d: "2026-11-20" });
    expect(labels(sent(reply))).toEqual(expect.arrayContaining(["📅 ดูในแพลน", "กลับรายการ", "📷 รูปจุดขึ้นรถ (2)"]));
  });

  it("tr_detail for a deleted row", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "tr_detail", id: "gone" });
    expect(texts(sent(reply))).toEqual(["การเดินทางนี้ถูกลบไปแล้ว"]);
  });

  it("tr_photos → album, tr_note → full text", async () => {
    const a = makeCtx();
    await handlePostback(a.ctx, { a: "tr_photos", id: "m1" });
    expect((sent(a.reply)[0] as Node).type).toBe("flex");
    const b = makeCtx();
    await handlePostback(b.ctx, { a: "tr_note", id: "m1" });
    expect(texts(sent(b.reply))).toEqual(["exit B"]);
  });

  it("tr_plan → quick reply of the linked plan items", async () => {
    const { ctx, reply } = makeCtx();
    await handlePostback(ctx, { a: "tr_plan", id: "m1" });
    expect(labels(sent(reply))).toEqual(["20/11 Go Disney", "21/11 Back again"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-handlers/transport.test.ts`
Expected: FAIL — assertions fail against the stub (reply text is `ฟีเจอร์นี้กำลังพัฒนา`).

- [ ] **Step 3: Replace the stub with the implementation**

Overwrite `lib/line-handlers/transport.ts` with:

```ts
// lib/line-handlers/transport.ts
// LINE "เดินทาง" feature: I/O glue only -- logic in lib/line-transport.ts,
// layout in lib/line-transport-messages.ts. View-only: nothing is written.
import { listRows } from "@/lib/store";
import { nowHHMMInTz, tripDateCtx, type TripDateCtx } from "@/lib/line-date";
import { textMessage, type FlexNode } from "@/lib/line-flex";
import { NO_TRIP_TEXT } from "@/lib/line-menu";
import type { Route } from "@/lib/line-router";
import type { ItineraryItem, Transport, Trip } from "@/lib/models/types";
import { inTrip, dayWindow } from "@/lib/line-plan";
import { albumMessage, buildDayPicker, tripRangeText } from "@/lib/line-plan-messages";
import { parseTransportQuery, runTransportSearch, sortTransports, nextTransport, searchTransports, transportDates } from "@/lib/line-transport";
import { buildTransportList, buildTransportDetail, buildPlanPicker } from "@/lib/line-transport-messages";
import type { HandlerCtx, PostbackData } from "./types";

interface Loaded {
  trip: Trip;
  transports: Transport[];
  today: string;
  now: string;
  dateCtx: TripDateCtx;
}

async function load(trip: Trip, now: Date): Promise<Loaded> {
  const transports = await listRows<Transport>("transports", trip.id);
  const dateCtx = tripDateCtx(trip, now);
  return { trip, transports, today: dateCtx.today, now: nowHHMMInTz(trip.trip_timezone, now), dateCtx };
}

const within = (L: Loaded, date: string): boolean => inTrip(date, L.trip.start_date, L.trip.end_date);

function dayList(L: Loaded, date: string, page: number): FlexNode {
  const list = sortTransports(L.transports.filter((t) => t.day_date === date), L.now, date === L.today);
  return buildTransportList({
    mode: { kind: "day", date, start: L.trip.start_date, end: L.trip.end_date },
    transports: list,
    nowHHMM: L.now,
    today: L.today,
    page,
  });
}

// Same rules for a typed search and a tr_list?q= page, so "ดูต่อ" / "กลับรายการ"
// reproduce exactly the results the user saw.
function searchResults(L: Loaded, query: string): Transport[] {
  const q = parseTransportQuery(query, false, L.dateCtx);
  return q.kind === "search" ? runTransportSearch(L.transports, q) : searchTransports(L.transports, query);
}

function searchList(L: Loaded, query: string, page: number): FlexNode {
  return buildTransportList({
    mode: { kind: "search", query },
    transports: searchResults(L, query),
    nowHHMM: L.now,
    today: L.today,
    page,
  });
}

function outOfRangeMessage(L: Loaded): FlexNode {
  const { start_date: start, end_date: end } = L.trip;
  return buildDayPicker(tripRangeText(start, end), dayWindow(start, end, L.today, 13), start, "tr_list");
}

async function linkedItems(L: Loaded, t: Transport): Promise<ItineraryItem[]> {
  const items = await listRows<ItineraryItem>("itinerary", L.trip.id);
  return items.filter((it) => it.linked_transport_id === t.id);
}

async function detailMessage(ctx: HandlerCtx, L: Loaded, t: Transport, back: { d?: string; q?: string }): Promise<FlexNode> {
  return buildTransportDetail({
    origin: ctx.origin,
    t,
    nowHHMM: L.now,
    today: L.today,
    planItems: await linkedItems(L, t),
    back,
  });
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "transport") return;
  if (!ctx.trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const L = await load(ctx.trip, ctx.now);
  const q = parseTransportQuery(route.rest, route.next, L.dateCtx);

  if (q.kind === "out_of_range") return ctx.reply([outOfRangeMessage(L)]);

  if (q.kind === "day") {
    if (!within(L, q.date)) return ctx.reply([outOfRangeMessage(L)]);
    return ctx.reply([dayList(L, q.date, 1)]);
  }

  if (q.kind === "search") {
    const found = runTransportSearch(L.transports, q);
    if (found.length === 0) {
      const days = transportDates(L.transports).filter((d) => within(L, d));
      return ctx.reply([buildDayPicker(`ไม่เจอการเดินทาง "${q.query}"`, days, L.trip.start_date, "tr_list")]);
    }
    if (found.length === 1) return ctx.reply([await detailMessage(ctx, L, found[0], { q: q.query })]);
    return ctx.reply([searchList(L, q.query, 1)]);
  }

  // รอบต่อไป / รถรอบถัดไป -- today's next departure, straight to the detail.
  const todays = sortTransports(L.transports.filter((t) => t.day_date === L.today), L.now, true);
  const next = nextTransport(todays, L.now);
  if (!next) {
    const none = textMessage("วันนี้ไม่มีการเดินทางรอบถัดไปแล้ว");
    return ctx.reply(todays.length > 0 ? [none, dayList(L, L.today, 1)] : [none]);
  }
  return ctx.reply([await detailMessage(ctx, L, next, { d: L.today })]);
}

const ROW_ACTIONS = new Set(["tr_detail", "tr_photos", "tr_note", "tr_plan"]);

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  if (!ctx.trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const L = await load(ctx.trip, ctx.now);
  const page = Math.max(1, Number(data.n) || 1);

  if (data.a === "tr_list") {
    if (data.q) return ctx.reply([searchList(L, data.q, page)]);
    const date = data.d && within(L, data.d) ? data.d : L.today;
    if (!within(L, date)) return ctx.reply([outOfRangeMessage(L)]);
    return ctx.reply([dayList(L, date, page)]);
  }
  if (!ROW_ACTIONS.has(data.a)) return;

  const t = L.transports.find((x) => x.id === data.id);
  if (!t) return ctx.reply([textMessage("การเดินทางนี้ถูกลบไปแล้ว")]);

  switch (data.a) {
    case "tr_detail":
      return ctx.reply([await detailMessage(ctx, L, t, { d: data.d, q: data.q })]);
    case "tr_photos":
      if (t.pickup_photo_ids.length === 0) return ctx.reply([await detailMessage(ctx, L, t, {})]);
      return ctx.reply([
        albumMessage({
          origin: ctx.origin,
          photoIds: t.pickup_photo_ids,
          title: `จุดขึ้นรถ · ${t.from} → ${t.to}`,
          moreUrl: `${ctx.origin}/trips/${L.trip.id}/transport`,
        }),
      ]);
    case "tr_note":
      return ctx.reply([textMessage((t.notes || "ไม่มีโน้ต").slice(0, 5000))]);
    default: {
      // tr_plan
      const items = await linkedItems(L, t);
      return ctx.reply([items.length > 0 ? buildPlanPicker(items) : textMessage("ไม่มีรายการในแพลนที่ผูกกับการเดินทางนี้")]);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-handlers/transport.test.ts`
Expected: PASS.

Then run: `npx tsc --noEmit`
Expected: exits 0 with no output (tsc must stay green after every task commit).

- [ ] **Step 5: Run the whole suite, typecheck and lint**

Run:
```bash
npm test
npx tsc --noEmit
npm run lint
```
Expected: all vitest files PASS (including the foundation's and the six files from this plan); `tsc` prints nothing and exits 0; `eslint` reports no errors. Fix any failure before committing — do not start a dev server.

- [ ] **Step 6: Commit**

```bash
git add lib/line-handlers/transport.ts lib/line-handlers/transport.test.ts lib/line-handlers/stubs.test.ts
git commit -m "$(cat <<'EOF'
feat(line): transport handler - day list, search, next departure, plan link

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Spec coverage notes (for reviewers)

- Plan spec "Units" (`lib/line-date-parse.ts`, webhook I/O) and transport spec "Units" (`lib/line-transport-parse.ts`, `lib/line-maps.ts`, webhook I/O) are superseded by the shared spec: date parsing = `extractDate`, maps = foundation `mapButtons`, I/O = `lib/line-handlers/*`. Plan-query parsing (index / `#n` / `ต่อไป` / `ตอนนี้`) lives in `lib/line-plan.ts`; transport-query parsing in `lib/line-transport.ts`.
- Plan spec postback list `plan_overview plan_detail plan_photos plan_note plan_done plan_undone plan_alt` — all handled (Task 4). Transport spec actions `tr_list tr_detail tr_photos tr_note tr_plan` — all handled (Task 7); `amb_expense` / `amb_transport` are the router/dispatch's (`amb_*`) and not touched here.
- Foundation `toTravelMode` (inside `mapButtons`) replaces the transport spec's `travelMode`; `modeIcon` stays here for the row icons.
- Expense-number ambiguity for `เดินทาง 50` and keyword detection (`เดินทาง`, `รอบต่อไป`, `รถรอบถัดไป`, never `ไป`) are in the foundation router; this plan only consumes `{ kind: "transport", rest, next }`.
- `moved` items stay listed on their original day with "ย้ายไป d/m" (plan spec), even though the app's itinerary page hides them.
