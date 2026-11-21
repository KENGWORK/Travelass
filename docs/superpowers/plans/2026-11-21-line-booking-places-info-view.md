# LINE Booking + Places + Quick Info/Notes Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the LINE bot show the active trip's bookings (`จอง` `ตั๋ว` `เอกสาร`), restaurants / wishlist (`ร้าน`… / `ที่เที่ยว`…), quick info (`ข้อมูล` `ข้อมูลด่วน`) and quick notes (`โน้ต`) as Flex cards. The views are read-only, except that a place can be toggled between visited and not visited.

**Architecture:** Each feature gets a pure "logic" module (parse the router's `rest`, filter, sort) and a pure "messages" module. The messages module builds Flex JSON plus a `build…Reply()` resolver that decides between the empty, not-found, single and list replies. The handler file in `lib/line-handlers/` stays thin: load rows through `@/lib/store`, call the resolver, and `ctx.reply(...)`. A small shared kit (`lib/line-view-kit.ts`) holds the helpers all three features use (truncation, paging, empty state, tap-to-zoom hero, album wrapper).

**Tech Stack:** TypeScript (strict), vitest 4 (`npm test -- <path>`), LINE Messaging API Flex Messages, Google Sheets via `@/lib/store`.

**PREREQUISITE (hard):** You must execute the foundation plan `docs/superpowers/plans/2026-11-21-line-foundation.md` first. Every module and signature in `docs/superpowers/specs/2026-11-21-line-bot-shared-design.md` must exist exactly as specified: `lib/line-flex.ts`, `lib/line-date.ts`, `lib/line-maps.ts`, `lib/line-text.ts`, `lib/line-router.ts` (`Route`), `lib/line-handlers/types.ts` (`HandlerCtx`, `PostbackData`) and `lib/line-dispatch.ts`. The stub files `lib/line-handlers/booking.ts`, `lib/line-handlers/places.ts` and `lib/line-handlers/info.ts` must also exist. Before Task 1, check: `ls lib/line-flex.ts lib/line-date.ts lib/line-maps.ts lib/line-router.ts lib/line-handlers/types.ts lib/line-handlers/booking.ts lib/line-handlers/places.ts lib/line-handlers/info.ts`. If any file is missing, STOP and run the foundation plan first. This plan does NOT edit the router, the dispatch, the webhook route or any foundation module.

## Global Constraints

- The shared spec `2026-11-21-line-bot-shared-design.md` WINS over the feature specs whenever they conflict.
- Postback action prefixes: booking `bk_`, places `pl_`, quick info `qi_`, quick notes `qn_`. The ambiguity prompt (`amb_*`) is owned by dispatch. Handlers here never build it.
- The router owns keyword detection, the polite-prefix strip and the expense-ambiguity check. Handlers receive `route.rest`: the text after the keyword. Dates do NOT trigger the ambiguity prompt. Info and notes never trigger it.
- Foundation "Decisions" (binding, see `docs/superpowers/plans/2026-11-21-line-foundation.md`):
  - #2: `rest` is NOT date-stripped (`จอง 21/11` → `{kind:"booking", rest:"21/11"}`), so the booking handler runs `extractDate` itself. Leading `การ`/`ของ` are stripped by the router before keyword match only, so `rest` may still begin with `การจอง…`.
  - #3/#11: `amb_go` and `menu_go` (`t`, `k=r|w`, optional `q`) arrive through `commandRoute` / `menuGoRoute` as ordinary `Route`s. Nothing extra is needed here.
  - #5: `โน๊ต` also routes to `notes`.
  - #8: `mapButtons` with a `mapsLink` but an empty `query` returns only the Google button.
  - #13: `thaiDateLabel("2026-11-20")` is `"ศ 20 พ.ย."` (Friday). Tests call `thaiDateLabel` instead of hard-coding labels.
- Exact foundation export locations: `tripDateCtx`, `extractDate`, `thaiDateLabel`, `todayInTz`, `nowHHMMInTz` come from `@/lib/line-date`. `NO_TRIP_TEXT` comes from `@/lib/line-menu`. `HandlerCtx` and `PostbackData` come from `@/lib/line-handlers/types`. `Route` comes from `@/lib/line-router`. Flex helpers come from `@/lib/line-flex`. `buildPhotoAlbum` returns carousel *contents*, not a message.
- Booking keywords are ONLY `จอง` `ตั๋ว` `เอกสาร` (no English). Natural phrasing must work: `ตั๋วเครื่อง`, `เอกสารการจองโรงแรม`, `การจองรถ`, `ตั๋วรถ`.
- Booking type words: `เครื่อง เครื่องบิน บิน ไฟลต์` → flight · `โรงแรม ที่พัก` → hotel · `รถ` → car · `กิจกรรม ทัวร์ สวนสนุก` → activity.
- Dates come from `extractDate` (`lib/line-date.ts`), not from `parsePlanQuery`.
- Bookings: show amount + payer. NEVER show `paid` or `pay_timing`. Photos = `slip_photo_ids` (thumbnail in the list, hero in the detail, album). The list shows all bookings with past ones at the bottom (newest first). A copy-ref clipboard button is included.
- The "ดูในแพลน" button sends postback `a=plan_detail&i=<itinerary_id>&d=<day_date>`, which the plan feature owns. With more than one linked itinerary item, the button posts `bk_plan`, and the reply is a quick reply of those `plan_detail` postbacks.
- Places: separate commands for restaurants (`k=r`) and wishlist (`k=w`). The reply is a carousel with a header card. The toggle between visited and not visited re-checks the stored value before writing. Tapping an image enlarges it. There is no near-me feature.
- Quick info is sorted `pinned` first, then `sort_order`. Do NOT use `lib/quickinfo-order.ts`, because it reads localStorage and does not exist on the server.
- Long quick-info values are truncated to 2 lines (`maxLines: 2`) in the list. Diary (`notes` entity) is out of scope.
- Flex limits: carousel ≤ 12 bubbles · no empty text nodes · altText ≤ 400 chars · postback data ≤ 300 chars · quick reply ≤ 13 items, label ≤ 20 chars · ≤ 5 messages per reply · text message ≤ 5000 chars · `clipboardText` ≤ 1000 chars.
- Images: `imageUrl(origin, id)` → `/api/img/{id}`.
- Reply text when there is no active trip (verbatim): `ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ`
- No Next.js APIs are touched (pure TS + store). AGENTS.md's "read node_modules/next/dist/docs" rule therefore does not apply to any task here.
- `npx tsc --noEmit` must pass before every task's commit (foundation rule).
- Test helpers live in `lib/line-view.test-helpers.ts`. The name marks the file as test-only, and vitest's `*.test.ts` include does not match it, so it never runs as a suite. Production code must never import it.
- Each handler task removes its own entry from the foundation's `lib/line-handlers/stubs.test.ts`.
- Every commit message ends with a blank line, then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/line-view-kit.ts` | Create | Shared pure helpers: `NO_TRIP_TEXT` re-export, `tripNowHHMM`, `truncate`, `firstLine`, `exceedsLines`, `pageSlice`, `includesCI`, `joinParts`, `appUrl`, `btn`, `emptyStateMessage`, `zoomHero`, `albumMessage`, `outOfRangeText`, `GONE_TEXT` |
| `lib/line-view.test-helpers.ts` | Create | Test-only helpers: Flex tree walkers + entity fixtures + `mkCtx` |
| `lib/line-view-kit.test.ts` | Create | Kit tests |
| `lib/line-booking.ts` | Create | `parseBookingRest`, `filterFromPostback`, `filterBookings`, `sortBookings`, `isPast`, `coversDate`, `isStaying`, `nights`, `countdown`, `bookingTitle`, `typeMeta`, `linkedPlanItems` |
| `lib/line-booking.test.ts` | Create | |
| `lib/line-booking-messages.ts` | Create | `describeBookingFilter`, `buildBookingList`, `buildBookingDetail`, `buildPlanPicker`, `buildBookingReply` |
| `lib/line-booking-messages.test.ts` | Create | |
| `lib/line-handlers/booking.ts` | Replace stub | I/O: `handleRoute` / `handlePostback` for `bk_*` |
| `lib/line-handlers/booking.test.ts` | Create | |
| `lib/line-places.ts` | Create | `Place`, `normalizePlace`, `parsePlacesRest`, `encodePlaceFilter`, `decodePlaceFilter`, `filterPlaces`, `sortPlaces`, `topAreas`, `countPlaces`, `paginatePlaces`, `describePlaceFilter`, `isPlaceFiltered`, `placeMapsQuery` |
| `lib/line-places.test.ts` | Create | |
| `lib/line-places-messages.ts` | Create | `buildPlaceBubble`, `buildSinglePlaceMessage`, `buildPlacesCarousel`, `buildPlacesReply` |
| `lib/line-places-messages.test.ts` | Create | |
| `lib/line-handlers/places.ts` | Replace stub | I/O: `pl_*` incl. visited toggle with re-check |
| `lib/line-handlers/places.test.ts` | Create | |
| `lib/line-info.ts` | Create | `classifyValue`, `telUri`, `sortQuickInfo`, `searchQuickInfo`, `sortNotes`, `searchNotes`, `noteTitle`, `nonEmptyLines`, `bigTextSize` |
| `lib/line-info.test.ts` | Create | |
| `lib/line-info-messages.ts` | Create | `buildQuickInfoList`, `buildQuickInfoDetail`, `buildBigText`, `buildQuickInfoReply`, `buildNoteList`, `buildNoteDetail`, `buildNoteFullText`, `buildNotesReply` |
| `lib/line-info-messages.test.ts` | Create | |
| `lib/line-handlers/info.ts` | Replace stub | I/O: routes `info` / `notes`, postbacks `qi_*` / `qn_*` |
| `lib/line-handlers/info.test.ts` | Create | |

The feature specs listed separate `*-parse.ts` units. They are folded into the logic modules (`parseBookingRest`, `parsePlacesRest`), because the router now does keyword matching and only `rest` is left to parse. Info and notes need no parser (`rest` is the query).

---

### Task 1: Shared view kit + test helpers

**Files:**
- Create: `lib/line-view-kit.ts`
- Create: `lib/line-view.test-helpers.ts`
- Test: `lib/line-view-kit.test.ts`

**Interfaces:**
- Consumes (foundation): `CLAY`, `FlexNode`, `compact`, `txt`, `uriAction`, `imageUrl`, `flexMessage`, `buildPhotoAlbum`, `decodePostback` from `@/lib/line-flex`. Also `nowHHMMInTz`, `thaiDateLabel` from `@/lib/line-date`, `NO_TRIP_TEXT` from `@/lib/line-menu`, and `HandlerCtx` from `@/lib/line-handlers/types`.
- Produces:
  - `NO_TRIP_TEXT` (re-export of `lib/line-menu.ts`'s constant), `GONE_TEXT: string`, `LIST_PAGE_SIZE = 15`
  - (NOT here: `tripDateCtx`. Use the foundation's `tripDateCtx(trip, now)` from `@/lib/line-date`.)
  - `tripNowHHMM(trip: Trip, now: Date): string`
  - `norm(s: string): string`
  - `includesCI(fields: (string | null | undefined)[], query: string): boolean`
  - `truncate(text: string, max: number): string`
  - `firstLine(text: string): string`
  - `exceedsLines(text: string, maxLines: number, charsPerLine?: number): boolean`
  - `pageSlice<T>(items: T[], page: number, size?: number): { items: T[]; hasMore: boolean }`
  - `joinParts(parts: (string | null | undefined | false)[], sep?: string): string`
  - `appUrl(origin: string, tripId: string, path: string): string`
  - `btn(action: FlexNode, style?: "primary" | "secondary" | "link"): FlexNode`
  - `emptyStateMessage(text: string, openUrl: string): FlexNode`
  - `zoomHero(p: { origin: string; photoId: string; badge?: string }): FlexNode`
  - `albumMessage(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode`
  - `outOfRangeText(trip: Trip): string`
  - `LONG_TEXT_CHUNK = 4800`, `splitLongText(text: string, max?: number, maxParts?: number): { parts: string[]; truncated: boolean }` (defaults 4800, 5)
  - `longTextMessages(text: string, moreUrl: string, emptyText: string): FlexNode[]`: ≤ 5 text messages, the last gets "…ยังมีต่อ อ่านในแอป {moreUrl}" when truncated
  - Test helpers: `walk`, `texts`, `allText`, `hasEmptyText`, `actionsOf`, `postbacksOf`, `countBubbles`, `mkTrip`, `mkBooking`, `mkItem`, `mkRestaurant`, `mkWish`, `mkQuickInfo`, `mkNote`, `mkCtx`

- [ ] **Step 1: Write the test helpers (test-only module)**

Create `lib/line-view.test-helpers.ts`:

```ts
// Test-only helpers for the LINE view features. Never import from production code.
import { vi } from "vitest";
import { decodePostback, type FlexNode } from "@/lib/line-flex";
import type { HandlerCtx } from "@/lib/line-handlers/types";
import type { Booking, ItineraryItem, QuickInfo, QuickNote, Restaurant, Trip, WishItem } from "@/lib/models/types";

type Obj = Record<string, unknown>;

export function walk(node: unknown, visit: (o: Obj) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  if (node && typeof node === "object") {
    visit(node as Obj);
    Object.values(node as Obj).forEach((v) => walk(v, visit));
  }
}

export function texts(node: unknown): string[] {
  const out: string[] = [];
  walk(node, (o) => {
    if (o.type === "text" && typeof o.text === "string") out.push(o.text);
  });
  return out;
}

export function allText(node: unknown): string {
  return texts(node).join("\n");
}

export function hasEmptyText(node: unknown): boolean {
  let bad = false;
  walk(node, (o) => {
    if (o.type === "text" && (typeof o.text !== "string" || o.text === "")) bad = true;
  });
  return bad;
}

export function actionsOf(node: unknown): Obj[] {
  const out: Obj[] = [];
  walk(node, (o) => {
    if (o.action && typeof o.action === "object") out.push(o.action as Obj);
  });
  return out;
}

export function postbacksOf(node: unknown): Record<string, string>[] {
  return actionsOf(node)
    .filter((a) => a.type === "postback")
    .map((a) => decodePostback(String(a.data)));
}

export function countBubbles(node: unknown): number {
  let n = 0;
  walk(node, (o) => {
    if (o.type === "bubble") n++;
  });
  return n;
}

export function mkTrip(p: Partial<Trip> = {}): Trip {
  return {
    id: "t1", name: "HK", destination: "Hong Kong", start_date: "2026-11-19", end_date: "2026-11-24",
    home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
    home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong", ...p,
  };
}

export function mkBooking(p: Partial<Booking> = {}): Booking {
  return {
    id: "b1", trip_id: "t1", type: "flight", vendor: "", ref_no: "", date_from: "", date_to: "", time_from: "",
    detail: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0, payer: "", pay_timing: "prepaid",
    paid: false, slip_photo_ids: [], notes: "", ...p,
  };
}

export function mkItem(p: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: "i1", trip_id: "t1", day_date: "2026-11-20", time: "", end_time: "", title: "", place: "", maps_link: "",
    notes: "", status: "planned", moved_to_date: "", linked_transport_id: "", linked_booking_id: "",
    sort_order: 0, photo_ids: [], plan_id: "", ...p,
  };
}

export function mkRestaurant(p: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "r1", trip_id: "t1", name: "", area: "", maps_link: "", note: "", must_try: false, price_level: 0,
    visited: false, photo_ids: [], ...p,
  };
}

export function mkWish(p: Partial<WishItem> = {}): WishItem {
  return { id: "w1", trip_id: "t1", name: "", area: "", maps_link: "", note: "", star: false, visited: false, photo_ids: [], ...p };
}

export function mkQuickInfo(p: Partial<QuickInfo> = {}): QuickInfo {
  return { id: "q1", trip_id: "t1", label: "", value: "", photo_ids: [], pinned: false, sort_order: 0, ...p };
}

export function mkNote(p: Partial<QuickNote> = {}): QuickNote {
  return { id: "n1", trip_id: "t1", title: "", content: "", photo_ids: [], sort_order: 0, ...p };
}

// 2026-11-20T03:00Z = 11:00 on 2026-11-20 in Asia/Hong_Kong (mkTrip's timezone).
export function mkCtx(p: Partial<HandlerCtx> = {}): HandlerCtx {
  return {
    event: { type: "message", source: { type: "user", userId: "U1" } } as HandlerCtx["event"],
    replyToken: "rt",
    accessToken: "tok",
    origin: "https://app.test",
    now: new Date("2026-11-20T03:00:00Z"),
    userKey: "user:U1",
    isGroup: false,
    trip: mkTrip(),
    reply: vi.fn(async (_messages: FlexNode[]) => {}),
    ...p,
  };
}

export function repliedMessages(ctx: HandlerCtx): FlexNode[] {
  const calls = vi.mocked(ctx.reply).mock.calls;
  return calls.length ? calls[0][0] : [];
}
```

- [ ] **Step 2: Write the failing kit test**

Create `lib/line-view-kit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  NO_TRIP_TEXT, GONE_TEXT, truncate, firstLine, exceedsLines, pageSlice, includesCI, joinParts,
  tripNowHHMM, appUrl, emptyStateMessage, zoomHero, albumMessage, outOfRangeText, norm, splitLongText, longTextMessages,
} from "./line-view-kit";
import { actionsOf, allText, hasEmptyText, mkTrip } from "./line-view.test-helpers";
import { imageUrl } from "./line-flex";

const ORIGIN = "https://app.test";

describe("text helpers", () => {
  it("truncate keeps short text and cuts long text with an ellipsis", () => {
    expect(truncate("abc", 4)).toBe("abc");
    expect(truncate("abcdef", 4)).toBe("abc…");
  });

  it("norm trims and collapses whitespace", () => {
    expect(norm("  a   b \n c ")).toBe("a b c");
  });

  it("firstLine returns the first non-empty trimmed line", () => {
    expect(firstLine("\n   \n hello \nworld")).toBe("hello");
    expect(firstLine("")).toBe("");
  });

  it("exceedsLines counts explicit and wrapped lines", () => {
    expect(exceedsLines("a\nb\nc", 3)).toBe(false);
    expect(exceedsLines("a\nb\nc\nd", 3)).toBe(true);
    expect(exceedsLines("x".repeat(100), 3)).toBe(true); // ceil(100/32) = 4 lines
    expect(exceedsLines("x".repeat(90), 3)).toBe(false);
  });

  it("includesCI matches case-insensitively and treats an empty query as a match", () => {
    expect(includesCI(["Mong Kok"], "mong")).toBe(true);
    expect(includesCI(["a", null, undefined], "")).toBe(true);
    expect(includesCI(["a"], "z")).toBe(false);
  });

  it("includesCI needs every token, each in any field", () => {
    expect(includesCI(["wifi", "HK-5G pass"], "wifi 5g")).toBe(true);
    expect(includesCI(["wifi", "HK-5G pass"], "wifi 6g")).toBe(false);
  });

  it("joinParts drops empty parts", () => {
    expect(joinParts(["a", "", null, undefined, false, "b"])).toBe("a · b");
    expect(joinParts(["a", "b"], "/")).toBe("a/b");
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  it("returns 15 per page and reports more", () => {
    expect(pageSlice(items, 1)).toEqual({ items: items.slice(0, 15), hasMore: true });
    expect(pageSlice(items, 2)).toEqual({ items: items.slice(15), hasMore: false });
  });
  it("treats an invalid page as page 1", () => {
    expect(pageSlice(items, 0).items[0]).toBe(0);
    expect(pageSlice(items, Number.NaN).items[0]).toBe(0);
  });
});

describe("trip helpers", () => {
  it("tripNowHHMM uses the trip timezone", () => {
    expect(tripNowHHMM(mkTrip(), new Date("2026-11-20T03:00:00Z"))).toBe("11:00");
  });
  it("appUrl builds an in-app link", () => {
    expect(appUrl(ORIGIN, "t1", "bookings")).toBe("https://app.test/trips/t1/bookings");
  });
  it("outOfRangeText mentions the trip range", () => {
    expect(outOfRangeText(mkTrip())).toContain("นอกช่วงทริป");
  });
  it("exposes the verbatim no-trip text", () => {
    expect(NO_TRIP_TEXT).toBe('ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ');
    expect(GONE_TEXT).toContain("ไม่เจอ");
  });
});

describe("splitLongText / longTextMessages", () => {
  it("short text is one part", () => expect(splitLongText("hello")).toEqual({ parts: ["hello"], truncated: false }));
  it("exactly max (4800) is one part", () => expect(splitLongText("a".repeat(4800)).parts).toHaveLength(1));
  it("cuts at the nearest newline", () => {
    expect(splitLongText(`${"a".repeat(10)}\n${"b".repeat(10)}`, 15)).toEqual({ parts: ["a".repeat(10), "b".repeat(10)], truncated: false });
  });
  it("hard-cuts when there is no newline", () => {
    expect(splitLongText("x".repeat(25), 10).parts).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
  it("stops at maxParts and reports truncation", () => {
    const r = splitLongText("x".repeat(100), 10, 5);
    expect(r.parts).toHaveLength(5);
    expect(r.truncated).toBe(true);
  });
  it("empty text has no parts", () => expect(splitLongText("")).toEqual({ parts: [], truncated: false }));

  it("longTextMessages: ≤ 5 texts, suffix on truncation, each ≤ 5000 chars", () => {
    const url = "https://app.test/trips/t1/info?tab=quicknotes";
    const msgs = longTextMessages("x".repeat(4800 * 6), url, "ว่าง");
    expect(msgs).toHaveLength(5);
    expect(String((msgs[4] as { text: string }).text)).toContain(`…ยังมีต่อ อ่านในแอป ${url}`);
    expect(msgs.every((m) => String((m as { text: string }).text).length <= 5000)).toBe(true);
    expect(longTextMessages("", url, "ว่าง")).toEqual([expect.objectContaining({ type: "text", text: "ว่าง" })]);
  });
});

describe("flex helpers", () => {
  it("emptyStateMessage shows the text and an open-app uri button", () => {
    const msg = emptyStateMessage("ทริปนี้ยังไม่มีการจอง", "https://app.test/trips/t1/bookings");
    expect(allText(msg)).toContain("ทริปนี้ยังไม่มีการจอง");
    expect(actionsOf(msg).some((a) => a.type === "uri" && a.uri === "https://app.test/trips/t1/bookings")).toBe(true);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("zoomHero opens the full image and labels it", () => {
    const hero = zoomHero({ origin: ORIGIN, photoId: "p1" });
    expect(actionsOf(hero).some((a) => a.type === "uri" && a.uri === imageUrl(ORIGIN, "p1"))).toBe(true);
    expect(allText(hero)).toContain("แตะเพื่อขยาย");
    expect(hasEmptyText(hero)).toBe(false);
  });

  it("zoomHero shows a badge when given", () => {
    expect(allText(zoomHero({ origin: ORIGIN, photoId: "p1", badge: "⭐ ต้องลอง" }))).toContain("⭐ ต้องลอง");
  });

  it("albumMessage always returns a flex message containing the photos", () => {
    const msg = albumMessage({ origin: ORIGIN, photoIds: ["p1", "p2"], title: "รูป", moreUrl: `${ORIGIN}/trips/t1` });
    expect(msg.type).toBe("flex");
    expect(JSON.stringify(msg)).toContain(imageUrl(ORIGIN, "p2"));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/line-view-kit.test.ts`
Expected: FAIL with `Failed to resolve import "./line-view-kit"`

- [ ] **Step 4: Write the kit**

Create `lib/line-view-kit.ts`:

```ts
// Shared pure helpers for the read-only LINE views (booking, places, quick info/notes).
import { CLAY, compact, txt, uriAction, imageUrl, flexMessage, textMessage, buildPhotoAlbum, type FlexNode } from "@/lib/line-flex";
import { nowHHMMInTz, thaiDateLabel } from "@/lib/line-date";
import type { Trip } from "@/lib/models/types";

// Re-exported (not redefined) so the wording stays single-sourced in the foundation's lib/line-menu.ts.
// tripDateCtx lives in lib/line-date.ts (foundation); import it from there.
export { NO_TRIP_TEXT } from "@/lib/line-menu";
export const GONE_TEXT = "ไม่เจอรายการนี้แล้ว (อาจถูกลบในแอป)";
export const LIST_PAGE_SIZE = 15;

export function tripNowHHMM(trip: Trip, now: Date): string {
  return nowHHMMInTz(trip.trip_timezone, now);
}

export function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// Every whitespace-separated query token must appear in at least one field
// ("wifi 5G" matches label "wifi" + value "HK-5G").
export function includesCI(fields: (string | null | undefined)[], query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields.map((f) => (f ?? "").toLowerCase());
  return tokens.every((t) => hay.some((h) => h.includes(t)));
}

// Counts code points (not UTF-16 units) so Thai/emoji are not split mid-character.
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}

export function firstLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "") ?? "";
}

// Heuristic for "will Flex maxLines cut this?" -- explicit newlines plus soft wraps.
export function exceedsLines(text: string, maxLines: number, charsPerLine = 32): boolean {
  const visual = text
    .split(/\r?\n/)
    .reduce((sum, l) => sum + Math.max(1, Math.ceil(Array.from(l).length / charsPerLine)), 0);
  return visual > maxLines;
}

export function pageSlice<T>(items: T[], page: number, size = LIST_PAGE_SIZE): { items: T[]; hasMore: boolean } {
  const p = Math.max(1, Math.floor(page) || 1);
  const start = (p - 1) * size;
  return { items: items.slice(start, start + size), hasMore: items.length > start + size };
}

export function joinParts(parts: (string | null | undefined | false)[], sep = " · "): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(sep);
}

export function appUrl(origin: string, tripId: string, path: string): string {
  return `${origin}/trips/${encodeURIComponent(tripId)}/${path}`;
}

export function btn(action: FlexNode, style: "primary" | "secondary" | "link" = "secondary"): FlexNode {
  return { type: "button", style, height: "sm", ...(style === "primary" ? { color: CLAY.coral } : {}), action };
}

export function emptyStateMessage(text: string, openUrl: string): FlexNode {
  return flexMessage(truncate(text, 400), {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: CLAY.cream,
      paddingAll: "16px",
      contents: compact([txt(text, { wrap: true, size: "md", color: CLAY.ink })]),
    },
    footer: { type: "box", layout: "vertical", contents: [btn(uriAction("เปิดแอป", openUrl), "primary")] },
  });
}

const BADGE_BOX = { type: "box", layout: "vertical", position: "absolute", cornerRadius: "12px", paddingAll: "4px", paddingStart: "8px", paddingEnd: "8px" };

// Hero = the photo itself; tapping anywhere opens the full image in LINE's browser (zoom/save there).
export function zoomHero(p: { origin: string; photoId: string; badge?: string }): FlexNode {
  const full = imageUrl(p.origin, p.photoId);
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "0px",
    action: uriAction("ขยายรูป", full),
    contents: compact([
      { type: "image", url: full, size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      p.badge
        ? { ...BADGE_BOX, offsetTop: "8px", offsetStart: "8px", backgroundColor: "#FFFFFFE6", contents: compact([txt(p.badge, { size: "xs", weight: "bold", color: CLAY.ink })]) }
        : null,
      { ...BADGE_BOX, offsetBottom: "8px", offsetEnd: "8px", backgroundColor: "#00000080", contents: compact([txt("แตะเพื่อขยาย", { size: "xxs", color: "#FFFFFF" })]) },
    ]),
  };
}

// buildPhotoAlbum is specified as returning "a FlexNode" -- wrap it unless it is already a full message.
export function albumMessage(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode {
  const album = buildPhotoAlbum(p);
  return album.type === "flex" ? album : flexMessage(truncate(`📷 ${p.title}`, 400), album);
}

export function outOfRangeText(trip: Trip): string {
  return `วันที่นั้นอยู่นอกช่วงทริป (${thaiDateLabel(trip.start_date)} – ${thaiDateLabel(trip.end_date)})`;
}

// LINE text messages cap at 5000 chars. 4800 leaves room for the "…ยังมีต่อ อ่านในแอป <url>" suffix.
export const LONG_TEXT_CHUNK = 4800;

export function splitLongText(text: string, max = LONG_TEXT_CHUNK, maxParts = 5): { parts: string[]; truncated: boolean } {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > 0 && parts.length < maxParts) {
    if (rest.length <= max) {
      parts.push(rest);
      rest = "";
      break;
    }
    let cut = rest.lastIndexOf("\n", max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  return { parts, truncated: rest.length > 0 };
}

// Long free text (booking notes, quick notes) as ≤ 5 plain text messages.
export function longTextMessages(text: string, moreUrl: string, emptyText: string): FlexNode[] {
  const { parts, truncated } = splitLongText(text);
  if (parts.length === 0) return [textMessage(emptyText)];
  if (truncated) parts[parts.length - 1] += `\n…ยังมีต่อ อ่านในแอป ${moreUrl}`;
  return parts.map((t) => textMessage(t));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/line-view-kit.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 6: Commit**

```bash
git add lib/line-view-kit.ts lib/line-view-kit.test.ts lib/line-view.test-helpers.ts
git commit -m "$(cat <<'EOF'
feat(line): shared view kit for read-only LINE cards

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Booking logic (parse rest, filter, sort, countdown)

**Files:**
- Create: `lib/line-booking.ts`
- Test: `lib/line-booking.test.ts`

**Interfaces:**
- Consumes: `extractDate`, `TripDateCtx` (`@/lib/line-date`); `includesCI`, `norm`, `truncate`, `firstLine` (`@/lib/line-view-kit`, Task 1)
- Produces:
  - `interface BookingFilter { type?: BookingType; date?: string; query: string }`
  - `BOOKING_TYPES: readonly BookingType[]` (`["flight","hotel","car","activity"]`)
  - `typeMeta(t: string): { icon: string; label: string }`
  - `parseBookingRest(rest: string, dateCtx: TripDateCtx): { filter: BookingFilter; outOfRange: boolean }`
  - `filterFromPostback(data: Record<string, string>): BookingFilter`
  - `bookingEnd(b: Booking): string`, `coversDate(b: Booking, date: string): boolean`, `isPast(b: Booking, today: string): boolean`, `isStaying(b: Booking, today: string): boolean`
  - `filterBookings(bookings: Booking[], f: BookingFilter): Booking[]`
  - `sortBookings(bookings: Booking[], today: string): { upcoming: Booking[]; past: Booking[] }`
  - `daysBetween(from: string, to: string): number`, `nights(b: Booking): number`
  - `countdown(b: Booking, today: string, nowHHMM: string): string`
  - `bookingTitle(b: Booking): string`
  - `linkedPlanItems(itinerary: ItineraryItem[], bookingId: string): ItineraryItem[]`

- [ ] **Step 1: Write the failing test**

Create `lib/line-booking.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseBookingRest, filterFromPostback, filterBookings, sortBookings, isPast, coversDate, isStaying, nights,
  countdown, bookingTitle, typeMeta, linkedPlanItems, daysBetween,
} from "./line-booking";
import { mkBooking, mkItem } from "./line-view.test-helpers";
import type { Booking } from "./models/types";

const CTX = { start: "2026-11-19", end: "2026-11-24", today: "2026-11-20" };
const TODAY = "2026-11-20";

describe("parseBookingRest (router rest after จอง/ตั๋ว/เอกสาร)", () => {
  it.each<[string, { type?: string; query: string }]>([
    ["", { query: "" }],
    ["เครื่อง", { type: "flight", query: "" }],                 // ตั๋วเครื่อง
    ["เครื่องบิน", { type: "flight", query: "" }],              // exact token, no stray "บิน"
    ["ไฟลต์", { type: "flight", query: "" }],
    ["การจองโรงแรม", { type: "hotel", query: "" }],             // เอกสารการจองโรงแรม
    ["ที่พัก", { type: "hotel", query: "" }],
    ["รถ", { type: "car", query: "" }],                         // การจองรถ / ตั๋วรถ
    ["กิจกรรม ดิสนีย์", { type: "activity", query: "ดิสนีย์" }],
    ["ดิสนีย์", { query: "ดิสนีย์" }],                           // ตั๋ว ดิสนีย์
    ["CX703 เครื่อง", { type: "flight", query: "CX703" }],
    ["ของ ดิสนีย์", { query: "ดิสนีย์" }],
    ["การ์ตูน", { query: "การ์ตูน" }],                            // not fillers + type word → search text
    ["การบินไทย", { query: "การบินไทย" }],                        // จอง การบินไทย: no "การ" strip, no "บิน" type
    ["รถไฟ", { query: "รถไฟ" }],                                  // จอง รถไฟ: "รถ" only as a whole token
    ["ตั๋วรถ", { type: "car", query: "" }],                        // if a keyword survives in rest
    ["การจองรถ", { type: "car", query: "" }],
    ["โรงแรม รถ", { type: "hotel", query: "รถ" }],                 // second, different type word → search text
  ])("%s", (rest, expected) => {
    const r = parseBookingRest(rest, CTX);
    expect(r.outOfRange).toBe(false);
    expect(r.filter.type).toBe(expected.type);
    expect(r.filter.date).toBeUndefined();
    expect(r.filter.query).toBe(expected.query);
  });

  it("extracts a relative date", () => {
    expect(parseBookingRest("พรุ่งนี้", CTX).filter).toEqual({ type: undefined, date: "2026-11-21", query: "" });
  });

  it("extracts d/m and keeps the type", () => {
    expect(parseBookingRest("โรงแรม 21/11", CTX).filter).toEqual({ type: "hotel", date: "2026-11-21", query: "" });
  });

  it("flags a date outside the trip", () => {
    expect(parseBookingRest("1/1", CTX).outOfRange).toBe(true);
  });
});

describe("filterFromPostback", () => {
  it("reads t/d/q and ignores an unknown type", () => {
    expect(filterFromPostback({ a: "bk_list", t: "hotel", d: "2026-11-21", q: "icon" })).toEqual({ type: "hotel", date: "2026-11-21", query: "icon" });
    expect(filterFromPostback({ a: "bk_list", t: "boat" })).toEqual({ type: undefined, date: undefined, query: "" });
  });
});

describe("date helpers", () => {
  const hotel = mkBooking({ type: "hotel", date_from: "2026-11-19", date_to: "2026-11-22" });
  it("coversDate is inclusive of date_to; date-only booking covers only date_from", () => {
    expect(coversDate(hotel, "2026-11-22")).toBe(true);
    expect(coversDate(hotel, "2026-11-23")).toBe(false);
    expect(coversDate(mkBooking({ date_from: "2026-11-21" }), "2026-11-21")).toBe(true);
    expect(coversDate(mkBooking({ date_from: "2026-11-21" }), "2026-11-22")).toBe(false);
    expect(coversDate(mkBooking(), "2026-11-21")).toBe(false);
  });
  it("isPast uses date_to when present; undated is never past", () => {
    expect(isPast(hotel, TODAY)).toBe(false);
    expect(isPast(mkBooking({ date_from: "2026-11-19" }), TODAY)).toBe(true);
    expect(isPast(mkBooking(), TODAY)).toBe(false);
  });
  it("isStaying only for hotels covering today", () => {
    expect(isStaying(hotel, TODAY)).toBe(true);
    expect(isStaying(mkBooking({ type: "car", date_from: "2026-11-19", date_to: "2026-11-22" }), TODAY)).toBe(false);
  });
  it("daysBetween and nights", () => {
    expect(daysBetween("2026-11-30", "2026-12-02")).toBe(2);
    expect(nights(hotel)).toBe(3);
    expect(nights(mkBooking({ date_from: "2026-11-19" }))).toBe(0);
  });
});

describe("filterBookings", () => {
  const all = [
    mkBooking({ id: "f", type: "flight", vendor: "Cathay", ref_no: "CX703", date_from: "2026-11-19" }),
    mkBooking({ id: "h", type: "hotel", vendor: "Hotel ICON", date_from: "2026-11-19", date_to: "2026-11-22", notes: "ขอห้องชั้นสูง" }),
    mkBooking({ id: "a", type: "activity", detail: "Disneyland 1 day", date_from: "2026-11-21" }),
  ];
  const ids = (bs: { id: string }[]) => bs.map((b) => b.id);
  it("by type", () => expect(ids(filterBookings(all, { type: "hotel", query: "" }))).toEqual(["h"]));
  it("by date within a hotel stay", () => expect(ids(filterBookings(all, { date: "2026-11-21", query: "" }))).toEqual(["h", "a"]));
  it("query matches vendor/ref/detail/notes case-insensitively", () => {
    expect(ids(filterBookings(all, { query: "cx7" }))).toEqual(["f"]);
    expect(ids(filterBookings(all, { query: "disney" }))).toEqual(["a"]);
    expect(ids(filterBookings(all, { query: "ชั้นสูง" }))).toEqual(["h"]);
    expect(ids(filterBookings(all, { query: "icon" }))).toEqual(["h"]);
  });
  it("empty filter returns everything", () => expect(filterBookings(all, { query: "" })).toHaveLength(3));
});

describe("sortBookings", () => {
  it("upcoming ascending (staying hotel included), past newest-first", () => {
    const b1 = mkBooking({ id: "b1", date_from: "2026-11-22", time_from: "10:00" });
    const b2 = mkBooking({ id: "b2", date_from: "2026-11-21" });
    const b3 = mkBooking({ id: "b3", date_from: "2026-11-18" });
    const b4 = mkBooking({ id: "b4", date_from: "2026-11-15" });
    const b5 = mkBooking({ id: "b5", type: "hotel", date_from: "2026-11-19", date_to: "2026-11-22" });
    const b6 = mkBooking({ id: "b6" });
    const { upcoming, past } = sortBookings([b1, b2, b3, b4, b5, b6], TODAY);
    expect(upcoming.map((b) => b.id)).toEqual(["b5", "b2", "b1", "b6"]);
    expect(past.map((b) => b.id)).toEqual(["b3", "b4"]);
  });
  it("same day: timed before untimed", () => {
    const a = mkBooking({ id: "a", date_from: "2026-11-21" });
    const b = mkBooking({ id: "b", date_from: "2026-11-21", time_from: "08:00" });
    expect(sortBookings([a, b], TODAY).upcoming.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("countdown", () => {
  const now = "11:00";
  it.each<[Partial<Booking>, string]>([
    [{ date_from: "2026-11-23" }, "อีก 3 วัน"],
    [{ date_from: TODAY, time_from: "13:30" }, "อีก 2 ชม."],
    [{ date_from: TODAY, time_from: "11:30" }, "อีก 30 นาที"],
    [{ date_from: TODAY, time_from: "09:00" }, "วันนี้"],
    [{ date_from: TODAY }, "วันนี้"],
    [{ type: "hotel", date_from: "2026-11-19", date_to: "2026-11-22" }, "กำลังพัก"],
    [{ date_from: "2026-11-18" }, "ผ่านไปแล้ว"],
    [{}, ""],
  ])("%o → %s", (p, expected) => {
    expect(countdown(mkBooking(p), TODAY, now)).toBe(expected);
  });
});

describe("bookingTitle / typeMeta", () => {
  it("uses the first detail line cut at 30, then vendor, then the type label", () => {
    expect(bookingTitle(mkBooking({ detail: "\nBKK → HKG\nseat 32A", vendor: "Cathay" }))).toBe("BKK → HKG");
    expect(bookingTitle(mkBooking({ detail: "x".repeat(40) }))).toBe("x".repeat(29) + "…");
    expect(bookingTitle(mkBooking({ vendor: "Cathay" }))).toBe("Cathay");
    expect(bookingTitle(mkBooking({ type: "hotel" }))).toBe("โรงแรม");
  });
  it("typeMeta falls back for unknown types", () => {
    expect(typeMeta("flight")).toEqual({ icon: "✈️", label: "เครื่องบิน" });
    expect(typeMeta("boat")).toEqual({ icon: "🎫", label: "การจอง" });
  });
});

describe("linkedPlanItems", () => {
  it("returns non-moved items linked to the booking, by day then time", () => {
    const items = [
      mkItem({ id: "x2", linked_booking_id: "h", day_date: "2026-11-20", time: "15:00" }),
      mkItem({ id: "x1", linked_booking_id: "h", day_date: "2026-11-19", time: "14:00" }),
      mkItem({ id: "x3", linked_booking_id: "h", status: "moved" }),
      mkItem({ id: "x4", linked_booking_id: "other" }),
    ];
    expect(linkedPlanItems(items, "h").map((i) => i.id)).toEqual(["x1", "x2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-booking.test.ts`
Expected: FAIL with `Failed to resolve import "./line-booking"`

- [ ] **Step 3: Write the implementation**

Create `lib/line-booking.ts`:

```ts
// Pure booking-view logic: parse the router's `rest`, filter, sort, countdown.
import type { Booking, BookingType, ItineraryItem } from "@/lib/models/types";
import { extractDate, type TripDateCtx } from "@/lib/line-date";
import { includesCI, norm, truncate, firstLine } from "@/lib/line-view-kit";

export interface BookingFilter { type?: BookingType; date?: string; query: string }

export const BOOKING_TYPES: readonly BookingType[] = ["flight", "hotel", "car", "activity"];

const TYPE_META: Record<BookingType, { icon: string; label: string }> = {
  flight: { icon: "✈️", label: "เครื่องบิน" },
  hotel: { icon: "🏨", label: "โรงแรม" },
  car: { icon: "🚗", label: "รถ" },
  activity: { icon: "🎡", label: "กิจกรรม" },
};

export function typeMeta(t: string): { icon: string; label: string } {
  return TYPE_META[t as BookingType] ?? { icon: "🎫", label: "การจอง" };
}

// Type words match only as an EXACT token (after peeling leading fillers), never
// as a substring: "รถไฟ" and "การบินไทย" stay search text.
const TYPE_WORDS: Record<string, BookingType> = {
  "เครื่องบิน": "flight", "เครื่อง": "flight", "บิน": "flight", "ไฟลต์": "flight",
  "โรงแรม": "hotel", "ที่พัก": "hotel",
  "รถ": "car",
  "กิจกรรม": "activity", "ทัวร์": "activity", "สวนสนุก": "activity",
};

// Connector/keyword words that may survive in `rest` (e.g. "เอกสารการจองโรงแรม" → rest "การจองโรงแรม").
const FILLERS = ["การ", "ของ", "จอง", "ตั๋ว", "เอกสาร"];

// A token is "structural" when it is entirely fillers followed by at most one
// exact type word: "การจองโรงแรม" = การ+จอง+โรงแรม, "ตั๋วรถ" = ตั๋ว+รถ, "ของ" = ของ.
// "การบินไทย" = การ + "บินไทย" (not a type word) → not structural → stays in the query.
function decomposeToken(tok: string): { ok: boolean; type?: BookingType } {
  if (tok === "") return { ok: true };
  const exact = TYPE_WORDS[tok];
  if (exact) return { ok: true, type: exact };
  for (const f of FILLERS) {
    if (tok.startsWith(f)) {
      const r = decomposeToken(tok.slice(f.length));
      if (r.ok) return r;
    }
  }
  return { ok: false };
}

export function parseBookingRest(rest: string, dateCtx: TripDateCtx): { filter: BookingFilter; outOfRange: boolean } {
  const d = extractDate(norm(rest), dateCtx);
  let type: BookingType | undefined;
  const query: string[] = [];
  for (const tok of norm(d.rest).split(" ")) {
    if (!tok) continue;
    const r = decomposeToken(tok);
    // A second, different type word is treated as search text.
    if (r.ok && (!r.type || !type || r.type === type)) type = type ?? r.type;
    else query.push(tok);
  }
  return { filter: { type, date: d.date ?? undefined, query: query.join(" ") }, outOfRange: d.outOfRange };
}

export function filterFromPostback(data: Record<string, string>): BookingFilter {
  const t = data.t as BookingType;
  return { type: BOOKING_TYPES.includes(t) ? t : undefined, date: data.d || undefined, query: data.q ?? "" };
}

export function bookingEnd(b: Booking): string {
  return b.date_to || b.date_from;
}

export function coversDate(b: Booking, date: string): boolean {
  return b.date_from !== "" && b.date_from <= date && date <= bookingEnd(b);
}

export function isPast(b: Booking, today: string): boolean {
  const end = bookingEnd(b);
  return end !== "" && end < today;
}

export function isStaying(b: Booking, today: string): boolean {
  return b.type === "hotel" && coversDate(b, today);
}

export function filterBookings(bookings: Booking[], f: BookingFilter): Booking[] {
  return bookings.filter(
    (b) =>
      (!f.type || b.type === f.type) &&
      (!f.date || coversDate(b, f.date)) &&
      includesCI([b.vendor, b.ref_no, b.detail, b.notes], f.query),
  );
}

const sortKey = (b: Booking) => `${b.date_from || "9999-99-99"} ${b.time_from || "99:99"}`;

export function sortBookings(bookings: Booking[], today: string): { upcoming: Booking[]; past: Booking[] } {
  const upcoming = bookings.filter((b) => !isPast(b, today)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const past = bookings.filter((b) => isPast(b, today)).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return { upcoming, past };
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function nights(b: Booking): number {
  return b.date_from && b.date_to && b.date_to > b.date_from ? daysBetween(b.date_from, b.date_to) : 0;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// today/nowHHMM are already in the trip timezone (see tripDateCtx / tripNowHHMM).
export function countdown(b: Booking, today: string, nowHHMM: string): string {
  if (!b.date_from) return "";
  if (isPast(b, today)) return "ผ่านไปแล้ว";
  if (b.date_from > today) return `อีก ${daysBetween(today, b.date_from)} วัน`;
  if (b.date_from === today && b.time_from) {
    const diff = toMin(b.time_from) - toMin(nowHHMM);
    if (diff >= 60) return `อีก ${Math.floor(diff / 60)} ชม.`;
    if (diff > 0) return `อีก ${diff} นาที`;
  }
  return isStaying(b, today) ? "กำลังพัก" : "วันนี้";
}

export function bookingTitle(b: Booking): string {
  const first = firstLine(b.detail);
  return (first && truncate(first, 30)) || b.vendor || typeMeta(b.type).label;
}

export function linkedPlanItems(itinerary: ItineraryItem[], bookingId: string): ItineraryItem[] {
  return itinerary
    .filter((it) => it.linked_booking_id === bookingId && it.status !== "moved")
    .sort((a, b) => a.day_date.localeCompare(b.day_date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.sort_order - b.sort_order);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-booking.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add lib/line-booking.ts lib/line-booking.test.ts
git commit -m "$(cat <<'EOF'
feat(line): booking query parsing, filter, sort and countdown

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Booking Flex messages + reply resolver

**Files:**
- Create: `lib/line-booking-messages.ts`
- Test: `lib/line-booking-messages.test.ts`

**Interfaces:**
- Consumes: Task 2 exports; Task 1 `appUrl`, `btn`, `emptyStateMessage`, `exceedsLines`, `pageSlice`, `truncate`, `zoomHero`, `joinParts`; foundation `CLAY`, `compact`, `txt`, `postbackAction`, `clipboardAction`, `imageUrl`, `flexMessage`, `textMessage`, `quickReply`, `FlexNode`, `thaiDateLabel`
- Produces:
  - `describeBookingFilter(f: BookingFilter): string`
  - `filterPostback(f: BookingFilter): Record<string, string | undefined>`
  - `buildBookingList(p: { origin: string; bookings: Booking[]; filter: BookingFilter; page: number; today: string }): FlexNode`
  - `buildBookingDetail(p: { origin: string; booking: Booking; filter: BookingFilter; linked: ItineraryItem[]; today: string; nowHHMM: string }): FlexNode`
  - `buildPlanPicker(linked: ItineraryItem[]): FlexNode`
  - `buildBookingReply(p: { trip: Trip; origin: string; bookings: Booking[]; itinerary: ItineraryItem[]; filter: BookingFilter; page: number; autoDetail: boolean; today: string; nowHHMM: string }): FlexNode[]`

Design notes for the implementer:
- `autoDetail` is `true` only for a typed command. A single match then opens the detail directly, and its "กลับรายการ" goes to the unfiltered list. A `bk_list` postback (`autoDetail: false`) always renders the list, even for 1 match. Without this split, "กลับรายการ" would loop back into the same detail.
- Thai text cannot be set in monospace in Flex (there is no font-family property). The ref box uses a large bold centered text instead.

- [ ] **Step 1: Write the failing test**

Create `lib/line-booking-messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBookingList, buildBookingDetail, buildPlanPicker, buildBookingReply, describeBookingFilter } from "./line-booking-messages";
import { allText, texts, actionsOf, postbacksOf, hasEmptyText, mkBooking, mkItem, mkTrip } from "./line-view.test-helpers";
import { imageUrl } from "./line-flex";
import { thaiDateLabel } from "./line-date";

const ORIGIN = "https://app.test";
const TODAY = "2026-11-20";
const NOW = "11:00";
const ALL = { query: "" };

const flight = mkBooking({ id: "f1", type: "flight", vendor: "Cathay", ref_no: "CX703", date_from: "2026-11-23", time_from: "09:40", detail: "BKK → HKG", slip_photo_ids: ["s1", "s2"] });
const hotel = mkBooking({ id: "h1", type: "hotel", vendor: "Hotel ICON", ref_no: "HTL-1", date_from: "2026-11-19", date_to: "2026-11-22" });
const pastCar = mkBooking({ id: "c1", type: "car", vendor: "Klook Van", date_from: "2026-11-18", detail: "รถรับสนามบิน" });

const bubbleOf = (msg: unknown) => (msg as { contents: Record<string, unknown> }).contents;

describe("describeBookingFilter", () => {
  it("joins type, date and query", () => {
    expect(describeBookingFilter({ type: "hotel", date: "2026-11-21", query: "icon" })).toBe(`โรงแรม · ${thaiDateLabel("2026-11-21")} · icon`);
    expect(describeBookingFilter(ALL)).toBe("");
  });
});

describe("buildBookingList", () => {
  const msg = buildBookingList({ origin: ORIGIN, bookings: [pastCar, flight, hotel], filter: ALL, page: 1, today: TODAY });
  const text = allText(msg);

  it("has a header with the count", () => {
    expect(text).toContain("🎫 การจองทั้งหมด · 3");
    expect(text).toContain("เรียงตามวัน · ที่ผ่านไปแล้วอยู่ท้าย");
  });

  it("puts upcoming first and past under 'ผ่านไปแล้ว' at the bottom", () => {
    const nodes = texts(msg); // exact text nodes, so the subtitle's "ผ่านไปแล้ว" substring doesn't interfere
    expect(nodes.indexOf("Hotel ICON")).toBeLessThan(nodes.indexOf("BKK → HKG"));
    expect(nodes.indexOf("BKK → HKG")).toBeLessThan(nodes.indexOf("ผ่านไปแล้ว"));
    expect(nodes.indexOf("ผ่านไปแล้ว")).toBeLessThan(nodes.indexOf("รถรับสนามบิน"));
  });

  it("shows hotel nights and the staying tag", () => {
    expect(text).toContain("3 คืน");
    expect(text).toContain("กำลังพัก");
  });

  it("an in-progress stay is grouped under today, not its check-in date", () => {
    const nodes = texts(msg);
    expect(nodes).toContain(`${thaiDateLabel(TODAY)} · วันนี้`);
    expect(nodes).not.toContain(thaiDateLabel("2026-11-19"));
  });

  it("row line 2 has time, vendor and ref", () => {
    expect(text).toContain("09:40 · Cathay · CX703");
  });

  it("each row opens the detail; footer has 4 type filters", () => {
    const pbs = postbacksOf(msg);
    expect(pbs.filter((p) => p.a === "bk_detail").map((p) => p.b).sort()).toEqual(["c1", "f1", "h1"]);
    expect(pbs.filter((p) => p.a === "bk_list").map((p) => p.t).sort()).toEqual(["activity", "car", "flight", "hotel"]);
  });

  it("uses the first slip photo as thumbnail", () => {
    expect(JSON.stringify(msg)).toContain(imageUrl(ORIGIN, "s1"));
  });

  it("never shows payment status and has no empty text", () => {
    expect(text).not.toMatch(/จ่ายแล้ว|ยังไม่จ่าย/);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("caps at 15 rows with a 'ดูต่อ' postback carrying the filter", () => {
    const many = Array.from({ length: 17 }, (_, i) => mkBooking({ id: `x${i}`, type: "car", vendor: `V${i}`, date_from: "2026-11-21", time_from: `${String(i).padStart(2, "0")}:00` }));
    const p1 = buildBookingList({ origin: ORIGIN, bookings: many, filter: { type: "car", query: "" }, page: 1, today: TODAY });
    expect(postbacksOf(p1).filter((p) => p.a === "bk_detail")).toHaveLength(15);
    expect(postbacksOf(p1).find((p) => p.a === "bk_list" && p.n === "2")).toMatchObject({ t: "car" });
    const p2 = buildBookingList({ origin: ORIGIN, bookings: many, filter: { type: "car", query: "" }, page: 2, today: TODAY });
    expect(postbacksOf(p2).filter((p) => p.a === "bk_detail").map((p) => p.b)).toEqual(["x15", "x16"]);
  });
});

describe("buildBookingDetail", () => {
  const rich = mkBooking({
    ...flight, amount: 1200, currency: "HKD", amount_thb: 5400, payer: "เก่ง", paid: true, pay_timing: "pay_before",
    notes: "line1\nline2\nline3\nline4",
  });

  it("shows the ref box, a copy button and the amount with payer", () => {
    const msg = buildBookingDetail({ origin: ORIGIN, booking: rich, filter: ALL, linked: [], today: TODAY, nowHHMM: NOW });
    const text = allText(msg);
    expect(text).toContain("CX703");
    expect(text).toContain("💰 1,200 HKD (~5,400฿) · เก่งจ่าย");
    expect(text).toContain("อีก 3 วัน");
    expect(actionsOf(msg).find((a) => a.type === "clipboard")).toMatchObject({ clipboardText: "CX703" });
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("never exposes paid / pay_timing", () => {
    const json = JSON.stringify(buildBookingDetail({ origin: ORIGIN, booking: rich, filter: ALL, linked: [], today: TODAY, nowHHMM: NOW }));
    expect(json).not.toMatch(/pay_before|prepaid|pay_after|จ่ายแล้ว|ยังไม่จ่าย/);
  });

  it("hero opens the full photo; photos button shows the count", () => {
    const msg = buildBookingDetail({ origin: ORIGIN, booking: rich, filter: ALL, linked: [], today: TODAY, nowHHMM: NOW });
    expect(bubbleOf(msg).hero).toBeDefined();
    expect(actionsOf(bubbleOf(msg).hero).some((a) => a.type === "uri" && a.uri === imageUrl(ORIGIN, "s1"))).toBe(true);
    expect(postbacksOf(msg).find((p) => p.a === "bk_photos")).toMatchObject({ b: "f1" });
    expect(allText(msg) + JSON.stringify(actionsOf(msg))).toContain("(2)");
  });

  it("long notes get a read-more postback; short notes do not", () => {
    const long = buildBookingDetail({ origin: ORIGIN, booking: rich, filter: ALL, linked: [], today: TODAY, nowHHMM: NOW });
    expect(postbacksOf(long).some((p) => p.a === "bk_note" && p.b === "f1")).toBe(true);
    const short = buildBookingDetail({ origin: ORIGIN, booking: { ...rich, notes: "สั้น" }, filter: ALL, linked: [], today: TODAY, nowHHMM: NOW });
    expect(postbacksOf(short).some((p) => p.a === "bk_note")).toBe(false);
  });

  it("hides every empty section", () => {
    const bare = mkBooking({ id: "z", type: "car", vendor: "Taxi" });
    const msg = buildBookingDetail({ origin: ORIGIN, booking: bare, filter: ALL, linked: [], today: TODAY, nowHHMM: NOW });
    expect(bubbleOf(msg).hero).toBeUndefined();
    expect(actionsOf(msg).some((a) => a.type === "clipboard")).toBe(false);
    expect(postbacksOf(msg).some((p) => p.a === "bk_photos")).toBe(false);
    expect(allText(msg)).not.toContain("💰");
    expect(allText(msg)).not.toContain("เลขจอง");
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("hotel shows check-in/check-out and nights", () => {
    const text = allText(buildBookingDetail({ origin: ORIGIN, booking: hotel, filter: ALL, linked: [], today: TODAY, nowHHMM: NOW }));
    expect(text).toContain("เช็คอิน");
    expect(text).toContain("เช็คเอาท์");
    expect(text).toContain("3 คืน");
    expect(text).toContain("กำลังพัก");
  });

  it("plan button: 1 linked → plan_detail postback, 2 → bk_plan, 0 → none", () => {
    const one = buildBookingDetail({ origin: ORIGIN, booking: hotel, filter: ALL, linked: [mkItem({ id: "i1", day_date: "2026-11-19" })], today: TODAY, nowHHMM: NOW });
    expect(postbacksOf(one)).toContainEqual({ a: "plan_detail", i: "i1", d: "2026-11-19" });
    const two = buildBookingDetail({ origin: ORIGIN, booking: hotel, filter: ALL, linked: [mkItem({ id: "i1" }), mkItem({ id: "i2" })], today: TODAY, nowHHMM: NOW });
    expect(postbacksOf(two).some((p) => p.a === "bk_plan" && p.b === "h1")).toBe(true);
    expect(postbacksOf(two).some((p) => p.a === "plan_detail")).toBe(false);
    const none = buildBookingDetail({ origin: ORIGIN, booking: hotel, filter: ALL, linked: [], today: TODAY, nowHHMM: NOW });
    expect(postbacksOf(none).some((p) => p.a === "plan_detail" || p.a === "bk_plan")).toBe(false);
  });

  it("back button returns to the list with the same filter", () => {
    const msg = buildBookingDetail({ origin: ORIGIN, booking: hotel, filter: { type: "hotel", query: "icon" }, linked: [], today: TODAY, nowHHMM: NOW });
    expect(postbacksOf(msg)).toContainEqual({ a: "bk_list", t: "hotel", q: "icon" });
  });
});

describe("buildPlanPicker", () => {
  it("offers one plan_detail quick reply per linked item", () => {
    const msg = buildPlanPicker([mkItem({ id: "i1", day_date: "2026-11-19", title: "เช็คอิน" }), mkItem({ id: "i2", day_date: "2026-11-22", title: "เช็คเอาท์" })]);
    expect(postbacksOf(msg)).toEqual([
      { a: "plan_detail", i: "i1", d: "2026-11-19" },
      { a: "plan_detail", i: "i2", d: "2026-11-22" },
    ]);
  });
});

describe("buildBookingReply", () => {
  const base = { trip: mkTrip(), origin: ORIGIN, itinerary: [], page: 1, today: TODAY, nowHHMM: NOW };

  it("trip with no bookings → empty state with open-app link", () => {
    const [msg] = buildBookingReply({ ...base, bookings: [], filter: ALL, autoDetail: true });
    expect(allText(msg)).toContain("ทริปนี้ยังไม่มีการจอง");
    expect(actionsOf(msg).some((a) => a.uri === "https://app.test/trips/t1/bookings")).toBe(true);
  });

  it("no match → 'ไม่เจอ' text with 4 type quick replies", () => {
    const [msg] = buildBookingReply({ ...base, bookings: [flight], filter: { query: "zzz" }, autoDetail: true });
    expect(allText(msg)).toContain("ไม่เจอ 'zzz'");
    expect(postbacksOf(msg).map((p) => p.t)).toEqual(["flight", "hotel", "car", "activity"]);
  });

  it("one match from a typed command → detail", () => {
    const [msg] = buildBookingReply({ ...base, bookings: [flight, hotel], filter: { type: "flight", query: "" }, autoDetail: true });
    expect(actionsOf(msg).some((a) => a.type === "clipboard")).toBe(true);
    expect(postbacksOf(msg)).toContainEqual({ a: "bk_list" }); // back → unfiltered list
  });

  it("one match from a list postback → still the list", () => {
    const [msg] = buildBookingReply({ ...base, bookings: [flight, hotel], filter: { type: "flight", query: "" }, autoDetail: false });
    expect(allText(msg)).toContain("เครื่องบิน · 1");
  });

  it("several matches → list", () => {
    const [msg] = buildBookingReply({ ...base, bookings: [flight, hotel], filter: ALL, autoDetail: true });
    expect(allText(msg)).toContain("การจองทั้งหมด · 2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-booking-messages.test.ts`
Expected: FAIL with `Failed to resolve import "./line-booking-messages"`

- [ ] **Step 3: Write the implementation**

Create `lib/line-booking-messages.ts`:

```ts
// Pure Flex builders for the LINE booking view.
import type { Booking, ItineraryItem, Trip } from "@/lib/models/types";
import { CLAY, compact, txt, postbackAction, clipboardAction, imageUrl, flexMessage, textMessage, quickReply, type FlexNode } from "@/lib/line-flex";
import { thaiDateLabel } from "@/lib/line-date";
import {
  BOOKING_TYPES, typeMeta, bookingTitle, filterBookings, sortBookings, isPast, coversDate, isStaying, nights,
  countdown, linkedPlanItems, type BookingFilter,
} from "@/lib/line-booking";
import { appUrl, btn, emptyStateMessage, exceedsLines, joinParts, pageSlice, truncate, zoomHero } from "@/lib/line-view-kit";

// "พฤ 20 พ.ย." → "20 พ.ย."
const dm = (date: string) => thaiDateLabel(date).replace(/^\S+\s+/, "");

const fmtNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function describeBookingFilter(f: BookingFilter): string {
  return joinParts([f.type ? typeMeta(f.type).label : null, f.date ? thaiDateLabel(f.date) : null, f.query || null]);
}

export function filterPostback(f: BookingFilter): Record<string, string | undefined> {
  return { t: f.type, d: f.date, q: f.query || undefined };
}

function typeQuickReply(): FlexNode {
  return quickReply(BOOKING_TYPES.map((t) => ({ label: `${typeMeta(t).icon} ${typeMeta(t).label}`, data: { a: "bk_list", t } })));
}

function typeFooter(): FlexNode {
  const b = BOOKING_TYPES.map((t) => ({ ...btn(postbackAction(`${typeMeta(t).icon} ${typeMeta(t).label}`, { a: "bk_list", t })), flex: 1 }));
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      { type: "box", layout: "horizontal", spacing: "xs", contents: [b[0], b[1]] },
      { type: "box", layout: "horizontal", spacing: "xs", contents: [b[2], b[3]] },
    ],
  };
}

function rowLine2(b: Booking, today: string): string {
  if (b.type === "hotel" && b.date_from) {
    const n = nights(b);
    return joinParts([
      b.date_to && b.date_to !== b.date_from ? `${dm(b.date_from)}–${dm(b.date_to)}` : dm(b.date_from),
      n > 0 ? `${n} คืน` : null,
      isStaying(b, today) ? "กำลังพัก" : null,
    ]);
  }
  const title = bookingTitle(b);
  return joinParts([b.time_from, b.vendor !== title ? b.vendor : null, b.ref_no]);
}

function groupHeader(group: string, today: string): FlexNode | null {
  const label = group === "past" ? "ผ่านไปแล้ว" : group === "nodate" ? "ไม่ระบุวัน" : `${thaiDateLabel(group)}${group === today ? " · วันนี้" : ""}`;
  return txt(label, { size: "xs", weight: "bold", color: group === "past" ? CLAY.grayInk : CLAY.coral, margin: "md" });
}

function bookingRow(b: Booking, origin: string, today: string, filter: BookingFilter): FlexNode {
  const past = isPast(b, today);
  const thumb = b.slip_photo_ids[0];
  return {
    type: "box",
    layout: "horizontal",
    spacing: "md",
    paddingAll: "8px",
    cornerRadius: "12px",
    ...(coversDate(b, today) ? { backgroundColor: CLAY.nextBg } : {}),
    action: postbackAction("ดูรายละเอียด", { a: "bk_detail", b: b.id, ...filterPostback(filter) }),
    contents: compact([
      txt(typeMeta(b.type).icon, { flex: 0, size: "lg", gravity: "center" }),
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact([
          txt(bookingTitle(b), { weight: "bold", size: "sm", wrap: true, maxLines: 2, color: past ? CLAY.grayInk : CLAY.ink }),
          txt(rowLine2(b, today) || null, { size: "xs", wrap: true, maxLines: 2, color: past ? CLAY.grayInk : CLAY.muted }),
        ]),
      },
      thumb ? { type: "image", url: imageUrl(origin, thumb), size: "40px", aspectRatio: "1:1", aspectMode: "cover", flex: 0 } : null,
    ]),
  };
}

export function buildBookingList(p: { origin: string; bookings: Booking[]; filter: BookingFilter; page: number; today: string }): FlexNode {
  const { upcoming, past } = sortBookings(p.bookings, p.today);
  const { items, hasMore } = pageSlice([...upcoming, ...past], p.page);
  const rows: (FlexNode | null)[] = [];
  let lastGroup = "";
  for (const b of items) {
    // In-progress items (started before today, not over) join today's group,
    // so a hotel stay shows under "… · วันนี้" instead of its check-in date.
    const group = isPast(b, p.today) ? "past" : !b.date_from ? "nodate" : b.date_from < p.today ? p.today : b.date_from;
    if (group !== lastGroup) {
      rows.push(groupHeader(group, p.today));
      lastGroup = group;
    }
    rows.push(bookingRow(b, p.origin, p.today, p.filter));
  }
  const page = Math.max(1, Math.floor(p.page) || 1);
  const title = `🎫 ${describeBookingFilter(p.filter) || "การจองทั้งหมด"} · ${p.bookings.length}`;
  return flexMessage(truncate(title, 400), {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: CLAY.cream,
      paddingAll: "14px",
      contents: compact([
        txt(title, { weight: "bold", size: "md", wrap: true, color: CLAY.ink }),
        txt("เรียงตามวัน · ที่ผ่านไปแล้วอยู่ท้าย", { size: "xxs", color: CLAY.muted }),
      ]),
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "10px",
      contents: compact([
        ...rows,
        hasMore ? btn(postbackAction("ดูต่อ", { a: "bk_list", ...filterPostback(p.filter), n: page + 1 }), "link") : null,
      ]),
    },
    footer: typeFooter(),
  });
}

function whenLines(b: Booking, today: string, nowHHMM: string): string[] {
  if (!b.date_from) return [];
  const cd = countdown(b, today, nowHHMM);
  if (b.type === "hotel") {
    const checkIn = `เช็คอิน ${thaiDateLabel(b.date_from)}${b.time_from ? ` ${b.time_from}` : ""}`;
    const checkOut = b.date_to && b.date_to !== b.date_from ? ` → เช็คเอาท์ ${thaiDateLabel(b.date_to)} · ${nights(b)} คืน` : "";
    return [checkIn + checkOut, cd];
  }
  const head = joinParts([thaiDateLabel(b.date_from), b.time_from]);
  const until = b.date_to && b.date_to !== b.date_from ? ` ถึง ${thaiDateLabel(b.date_to)}` : "";
  return [head + until, cd];
}

function amountLine(b: Booking): string {
  const cur = b.currency || "THB";
  const thb = cur !== "THB" && b.amount_thb ? ` (~${fmtNum(Math.round(b.amount_thb))}฿)` : "";
  return `💰 ${fmtNum(b.amount)} ${cur}${thb}${b.payer ? ` · ${b.payer}จ่าย` : ""}`;
}

function refBox(ref: string): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: CLAY.cream,
    cornerRadius: "12px",
    paddingAll: "12px",
    margin: "md",
    contents: compact([
      txt("เลขจอง", { size: "xxs", color: CLAY.muted, align: "center" }),
      txt(ref, { size: "xl", weight: "bold", color: CLAY.ink, align: "center", wrap: true }),
    ]),
  };
}

function planButton(b: Booking, linked: ItineraryItem[]): FlexNode | null {
  if (linked.length === 0) return null;
  if (linked.length === 1) return btn(postbackAction("📅 ดูในแพลน", { a: "plan_detail", i: linked[0].id, d: linked[0].day_date }));
  return btn(postbackAction("📅 ดูในแพลน", { a: "bk_plan", b: b.id }));
}

export function buildBookingDetail(p: { origin: string; booking: Booking; filter: BookingFilter; linked: ItineraryItem[]; today: string; nowHHMM: string }): FlexNode {
  const b = p.booking;
  const meta = typeMeta(b.type);
  const title = bookingTitle(b);
  const photo = b.slip_photo_ids[0];
  const [when, cd] = whenLines(b, p.today, p.nowHHMM);
  const body = compact([
    txt(`${meta.icon} ${meta.label}`, { size: "xs", color: CLAY.muted }),
    txt(title, { weight: "bold", size: "lg", wrap: true, color: CLAY.ink }),
    b.vendor && b.vendor !== title ? txt(b.vendor, { size: "sm", wrap: true, color: CLAY.muted }) : null,
    b.ref_no ? refBox(b.ref_no) : null,
    txt(when || null, { size: "sm", wrap: true, color: CLAY.ink, margin: "md" }),
    txt(cd || null, { size: "xs", weight: "bold", color: CLAY.nextInk }),
    b.detail.trim() && b.detail.trim() !== title ? txt(b.detail, { size: "sm", wrap: true, color: CLAY.ink, margin: "md" }) : null,
    b.amount ? txt(amountLine(b), { size: "sm", wrap: true, color: CLAY.ink, margin: "md" }) : null,
    b.notes ? txt(`📝 ${b.notes}`, { size: "sm", wrap: true, maxLines: 3, color: CLAY.muted, margin: "md" }) : null,
  ]);
  const footer = compact([
    b.ref_no ? btn(clipboardAction("📋 คัดลอกเลขจอง", truncate(b.ref_no, 1000)), "primary") : null,
    b.slip_photo_ids.length ? btn(postbackAction(`📷 ดูรูปทั้งหมด (${b.slip_photo_ids.length})`, { a: "bk_photos", b: b.id })) : null,
    b.notes && exceedsLines(b.notes, 3) ? btn(postbackAction("📝 อ่านโน้ตต่อ", { a: "bk_note", b: b.id })) : null,
    planButton(b, p.linked),
    btn(postbackAction("กลับรายการ", { a: "bk_list", ...filterPostback(p.filter) }), "link"),
  ]);
  return flexMessage(truncate(`${meta.icon} ${title}${b.ref_no ? ` · ${b.ref_no}` : ""}`, 400), {
    type: "bubble",
    size: "mega",
    ...(photo ? { hero: zoomHero({ origin: p.origin, photoId: photo }) } : {}),
    body: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "16px", contents: body },
    footer: { type: "box", layout: "vertical", spacing: "xs", contents: footer },
  });
}

export function buildPlanPicker(linked: ItineraryItem[]): FlexNode {
  return textMessage(
    "การจองนี้อยู่ในแพลนหลายรายการ เลือกได้เลย",
    quickReply(linked.slice(0, 13).map((it) => ({ label: `${dm(it.day_date)} ${it.title}`, data: { a: "plan_detail", i: it.id, d: it.day_date } }))),
  );
}

export function buildBookingReply(p: {
  trip: Trip; origin: string; bookings: Booking[]; itinerary: ItineraryItem[]; filter: BookingFilter;
  page: number; autoDetail: boolean; today: string; nowHHMM: string;
}): FlexNode[] {
  if (p.bookings.length === 0) return [emptyStateMessage("ทริปนี้ยังไม่มีการจอง", appUrl(p.origin, p.trip.id, "bookings"))];
  const matched = filterBookings(p.bookings, p.filter);
  if (matched.length === 0) return [textMessage(`ไม่เจอ '${describeBookingFilter(p.filter)}'`, typeQuickReply())];
  if (p.autoDetail && matched.length === 1) {
    const booking = matched[0];
    return [buildBookingDetail({ origin: p.origin, booking, filter: { query: "" }, linked: linkedPlanItems(p.itinerary, booking.id), today: p.today, nowHHMM: p.nowHHMM })];
  }
  return [buildBookingList({ origin: p.origin, bookings: matched, filter: p.filter, page: p.page, today: p.today })];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-booking-messages.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add lib/line-booking-messages.ts lib/line-booking-messages.test.ts
git commit -m "$(cat <<'EOF'
feat(line): booking list/detail Flex cards and reply resolver

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Booking handler (replace stub)

**Files:**
- Replace: `lib/line-handlers/booking.ts` (overwrite the foundation stub entirely)
- Test: `lib/line-handlers/booking.test.ts`

**Interfaces:**
- Consumes: `HandlerCtx`, `PostbackData` (`@/lib/line-handlers/types`); `Route` (`@/lib/line-router`); `listRows` (`@/lib/store`); Tasks 1–3
- Produces (handler contract from the shared spec):
  - `handleRoute(ctx: HandlerCtx, route: Route): Promise<void>`: handles only `route.kind === "booking"`
  - `handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void>`: `bk_list` (`t`,`d`,`q`,`n`), `bk_detail` (`b`,`t`,`d`,`q`), `bk_photos` (`b`), `bk_note` (`b`), `bk_plan` (`b`)

- [ ] **Step 1: Write the failing test**

Create `lib/line-handlers/booking.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ listRows: vi.fn(), updateRow: vi.fn() }));

import { listRows } from "@/lib/store";
import { handleRoute, handlePostback } from "./booking";
import { NO_TRIP_TEXT, GONE_TEXT } from "@/lib/line-view-kit";
import { allText, postbacksOf, mkBooking, mkCtx, mkItem, repliedMessages } from "@/lib/line-view.test-helpers";

const FLIGHT = mkBooking({ id: "f1", type: "flight", vendor: "Cathay", ref_no: "CX703", date_from: "2026-11-23", detail: "BKK → HKG", slip_photo_ids: ["s1", "s2"] });
const HOTEL = mkBooking({ id: "h1", type: "hotel", vendor: "Hotel ICON", ref_no: "HTL-1", date_from: "2026-11-19", date_to: "2026-11-22", notes: "a\nb\nc\nd\ne" });
const ITIN = [
  mkItem({ id: "i1", linked_booking_id: "h1", day_date: "2026-11-19", title: "เช็คอิน" }),
  mkItem({ id: "i2", linked_booking_id: "h1", day_date: "2026-11-22", title: "เช็คเอาท์" }),
  mkItem({ id: "i3", linked_booking_id: "f1", day_date: "2026-11-23", title: "บิน" }),
];
const DATA: Record<string, unknown[]> = { bookings: [FLIGHT, HOTEL], itinerary: ITIN };

beforeEach(() => {
  vi.mocked(listRows).mockReset();
  vi.mocked(listRows).mockImplementation((async (entity: string) => DATA[entity] ?? []) as never);
});

describe("booking handleRoute", () => {
  it("replies the no-trip text when there is no active trip", async () => {
    const ctx = mkCtx({ trip: null });
    await handleRoute(ctx, { kind: "booking", rest: "" });
    expect(repliedMessages(ctx)).toEqual([expect.objectContaining({ type: "text", text: NO_TRIP_TEXT })]);
    expect(listRows).not.toHaveBeenCalled();
  });

  it("ignores routes of other features", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "info", rest: "" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("ตั๋วเครื่อง (rest 'เครื่อง') with one flight → detail with plan link", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "booking", rest: "เครื่อง" });
    expect(listRows).toHaveBeenCalledWith("bookings", "t1");
    const msgs = repliedMessages(ctx);
    expect(allText(msgs)).toContain("CX703");
    expect(postbacksOf(msgs)).toContainEqual({ a: "plan_detail", i: "i3", d: "2026-11-23" });
  });

  it("จอง (empty rest) → list of all", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "booking", rest: "" });
    expect(allText(repliedMessages(ctx))).toContain("การจองทั้งหมด · 2");
  });

  it("a date outside the trip → out-of-range text, no reads", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "booking", rest: "1/1" });
    expect(allText(repliedMessages(ctx))).toContain("นอกช่วงทริป");
    expect(listRows).not.toHaveBeenCalled();
  });
});

describe("booking handlePostback", () => {
  it("bk_list always renders the list, even for one match", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "bk_list", t: "hotel" });
    expect(allText(repliedMessages(ctx))).toContain("โรงแรม · 1");
  });

  it("bk_detail for a deleted booking → gone text", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "bk_detail", b: "nope" });
    expect(allText(repliedMessages(ctx))).toBe(GONE_TEXT);
  });

  it("bk_detail keeps the filter for the back button", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "bk_detail", b: "h1", t: "hotel" });
    expect(postbacksOf(repliedMessages(ctx))).toContainEqual({ a: "bk_list", t: "hotel" });
  });

  it("bk_plan → quick reply of plan_detail postbacks", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "bk_plan", b: "h1" });
    expect(postbacksOf(repliedMessages(ctx))).toEqual([
      { a: "plan_detail", i: "i1", d: "2026-11-19" },
      { a: "plan_detail", i: "i2", d: "2026-11-22" },
    ]);
  });

  it("bk_photos → album with every slip photo", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "bk_photos", b: "f1" });
    const json = JSON.stringify(repliedMessages(ctx));
    expect(json).toContain("/api/img/s1");
    expect(json).toContain("/api/img/s2");
  });

  it("bk_note → full notes as plain text", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "bk_note", b: "h1" });
    expect(repliedMessages(ctx)).toEqual([expect.objectContaining({ type: "text", text: HOTEL.notes })]);
  });

  it("bk_note splits very long notes into ≤ 5 messages", async () => {
    DATA.bookings = [FLIGHT, { ...HOTEL, notes: "y".repeat(7000) }];
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "bk_note", b: "h1" });
    expect(repliedMessages(ctx)).toHaveLength(2);
    DATA.bookings = [FLIGHT, HOTEL];
  });

  it("no trip → no-trip text", async () => {
    const ctx = mkCtx({ trip: null });
    await handlePostback(ctx, { a: "bk_list" });
    expect(allText(repliedMessages(ctx))).toBe(NO_TRIP_TEXT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-handlers/booking.test.ts`
Expected: FAIL. The stub replies "ฟีเจอร์นี้กำลังพัฒนา", so the assertions on CX703, the list and the postbacks fail.

- [ ] **Step 3: Replace the handler**

Overwrite `lib/line-handlers/booking.ts` with:

```ts
// LINE booking view -- I/O only; all decisions live in lib/line-booking*.ts.
import { listRows } from "@/lib/store";
import type { Booking, ItineraryItem, Trip } from "@/lib/models/types";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { parseBookingRest, filterFromPostback, linkedPlanItems, bookingTitle, type BookingFilter } from "@/lib/line-booking";
import { buildBookingReply, buildBookingDetail, buildPlanPicker } from "@/lib/line-booking-messages";
import { tripDateCtx } from "@/lib/line-date";
import { NO_TRIP_TEXT, GONE_TEXT, tripNowHHMM, albumMessage, appUrl, outOfRangeText, longTextMessages } from "@/lib/line-view-kit";

async function load(tripId: string): Promise<{ bookings: Booking[]; itinerary: ItineraryItem[] }> {
  const [bookings, itinerary] = await Promise.all([
    listRows<Booking>("bookings", tripId),
    listRows<ItineraryItem>("itinerary", tripId),
  ]);
  return { bookings, itinerary };
}

async function replyView(ctx: HandlerCtx, trip: Trip, filter: BookingFilter, page: number, autoDetail: boolean): Promise<void> {
  const { bookings, itinerary } = await load(trip.id);
  await ctx.reply(
    buildBookingReply({
      trip, origin: ctx.origin, bookings, itinerary, filter, page, autoDetail,
      today: tripDateCtx(trip, ctx.now).today, nowHHMM: tripNowHHMM(trip, ctx.now),
    }),
  );
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "booking") return;
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const parsed = parseBookingRest(route.rest, tripDateCtx(trip, ctx.now));
  if (parsed.outOfRange) return ctx.reply([textMessage(outOfRangeText(trip))]);
  await replyView(ctx, trip, parsed.filter, 1, true);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);

  if (data.a === "bk_list") return replyView(ctx, trip, filterFromPostback(data), Number(data.n) || 1, false);

  const { bookings, itinerary } = await load(trip.id);
  const booking = bookings.find((b) => b.id === data.b);
  if (!booking) return ctx.reply([textMessage(GONE_TEXT)]);

  switch (data.a) {
    case "bk_detail":
      return ctx.reply([
        buildBookingDetail({
          origin: ctx.origin, booking, filter: filterFromPostback(data), linked: linkedPlanItems(itinerary, booking.id),
          today: tripDateCtx(trip, ctx.now).today, nowHHMM: tripNowHHMM(trip, ctx.now),
        }),
      ]);
    case "bk_photos":
      if (!booking.slip_photo_ids.length) return ctx.reply([textMessage("การจองนี้ไม่มีรูป")]);
      return ctx.reply([
        albumMessage({ origin: ctx.origin, photoIds: booking.slip_photo_ids, title: bookingTitle(booking), moreUrl: appUrl(ctx.origin, trip.id, "bookings") }),
      ]);
    case "bk_note":
      return ctx.reply(longTextMessages(booking.notes, appUrl(ctx.origin, trip.id, "bookings"), "ไม่มีโน้ต"));
    case "bk_plan": {
      const linked = linkedPlanItems(itinerary, booking.id);
      if (!linked.length) return ctx.reply([textMessage("การจองนี้ยังไม่ได้อยู่ในแพลน")]);
      return ctx.reply([buildPlanPicker(linked)]);
    }
    default:
      return;
  }
}
```

- [ ] **Step 3b: Remove the booking stub from the foundation's stub test**

`lib/line-handlers/stubs.test.ts` (foundation) asserts that every stub replies "ฟีเจอร์นี้กำลังพัฒนา". Once `booking.ts` is real, that suite fails. Delete exactly these two lines from it. Other feature plans delete their own lines, so if yours are already gone, leave the file as it is:

```ts
import * as booking from "./booking";
```
```ts
  ["booking", booking],
```

If this leaves `describe.each([])` with no rows (every feature plan has landed), delete the file instead: `git rm lib/line-handlers/stubs.test.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-handlers/booking.test.ts lib/line-booking.test.ts lib/line-booking-messages.test.ts lib/line-handlers/stubs.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add -A lib/line-handlers/booking.ts lib/line-handlers/booking.test.ts lib/line-handlers/stubs.test.ts
git commit -m "$(cat <<'EOF'
feat(line): booking view handler (list, detail, photos, notes, plan link)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Places logic

**Files:**
- Create: `lib/line-places.ts`
- Test: `lib/line-places.test.ts`

**Interfaces:**
- Consumes: Task 1 `includesCI`, `norm`, `joinParts`
- Produces:
  - `type PlaceKind = "r" | "w"`
  - `interface Place { id: string; kind: PlaceKind; name: string; area: string; mapsLink: string; note: string; starred: boolean; visited: boolean; priceLevel: number; photoIds: string[] }`
  - `interface PlaceFilter { starred?: boolean; visited?: boolean; query: string }`
  - `normalizePlace(row: Restaurant | WishItem, kind: PlaceKind): Place`
  - `parsePlacesRest(rest: string): PlaceFilter`
  - `encodePlaceFilter(f: PlaceFilter): string` (e.g. `"s.v0"`), `decodePlaceFilter(f: string | undefined, q: string | undefined): PlaceFilter`
  - `filterPlaces(places: Place[], f: PlaceFilter): Place[]`, `sortPlaces(places: Place[]): Place[]`
  - `topAreas(places: Place[], limit: number): { area: string; count: number }[]`
  - `countPlaces(places: Place[]): { starred: number; unvisited: number; visited: number }`
  - `FIRST_PAGE_SIZE = 10`, `NEXT_PAGE_SIZE = 11`
  - `paginatePlaces<T>(items: T[], page: number): { items: T[]; remaining: number; withHeader: boolean }`
  - `isPlaceFiltered(f: PlaceFilter): boolean`, `describePlaceFilter(f: PlaceFilter, kind: PlaceKind): string`, `placeMapsQuery(p: Place): string`
  - `starLabel(kind: PlaceKind): string` (`r` → `ต้องลอง`, `w` → `ติดดาว`)

- [ ] **Step 1: Write the failing test**

Create `lib/line-places.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizePlace, parsePlacesRest, encodePlaceFilter, decodePlaceFilter, filterPlaces, sortPlaces, topAreas,
  countPlaces, paginatePlaces, isPlaceFiltered, describePlaceFilter, placeMapsQuery, starLabel, type Place, type PlaceFilter,
} from "./line-places";
import { mkRestaurant, mkWish } from "./line-view.test-helpers";

const P = (p: Partial<Place>): Place => ({ id: "x", kind: "r", name: "", area: "", mapsLink: "", note: "", starred: false, visited: false, priceLevel: 0, photoIds: [], ...p });

describe("normalizePlace", () => {
  it("maps a restaurant (must_try → starred, keeps price)", () => {
    expect(normalizePlace(mkRestaurant({ id: "r1", name: "Kam's", area: "Wan Chai", maps_link: "https://g/x", must_try: true, price_level: 2, photo_ids: ["p"] }), "r"))
      .toEqual({ id: "r1", kind: "r", name: "Kam's", area: "Wan Chai", mapsLink: "https://g/x", note: "", starred: true, visited: false, priceLevel: 2, photoIds: ["p"] });
  });
  it("maps a wish item (star → starred, no price)", () => {
    const p = normalizePlace(mkWish({ id: "w1", name: "Peak", star: true, visited: true }), "w");
    expect(p).toMatchObject({ kind: "w", starred: true, visited: true, priceLevel: 0 });
  });
});

describe("parsePlacesRest", () => {
  it.each<[string, PlaceFilter]>([
    ["", { query: "" }],
    ["มงก๊ก", { query: "มงก๊ก" }],
    ["ต้องลอง", { starred: true, query: "" }],
    ["ดาว", { starred: true, query: "" }],
    ["ยังไม่ไป", { visited: false, query: "" }],
    ["ไปแล้ว", { visited: true, query: "" }],
    ["ยังไม่ไป มงก๊ก", { visited: false, query: "มงก๊ก" }],
    ["central", { query: "central" }],
  ])("%s", (rest, expected) => {
    expect(parsePlacesRest(rest)).toEqual(expected);
  });
});

describe("filter encoding", () => {
  it("round-trips through postback fields", () => {
    const f = { starred: true, visited: false, query: "TST" };
    expect(encodePlaceFilter(f)).toBe("s.v0");
    expect(decodePlaceFilter("s.v0", "TST")).toEqual(f);
    expect(decodePlaceFilter("v1", undefined)).toEqual({ visited: true, query: "" });
    expect(decodePlaceFilter(undefined, undefined)).toEqual({ query: "" });
    expect(encodePlaceFilter({ query: "" })).toBe("");
  });
});

describe("filterPlaces / sortPlaces", () => {
  const list = [
    P({ id: "a", name: "A", starred: true, visited: true, area: "Mong Kok" }),
    P({ id: "b", name: "B", note: "ห่านย่าง" }),
    P({ id: "c", name: "C", visited: true }),
    P({ id: "d", name: "D", starred: true }),
  ];
  const ids = (ps: Place[]) => ps.map((p) => p.id);
  it("filters by star, visited and query in name/area/note", () => {
    expect(ids(filterPlaces(list, { starred: true, query: "" }))).toEqual(["a", "d"]);
    expect(ids(filterPlaces(list, { visited: false, query: "" }))).toEqual(["b", "d"]);
    expect(ids(filterPlaces(list, { query: "mong" }))).toEqual(["a"]);
    expect(ids(filterPlaces(list, { query: "ห่าน" }))).toEqual(["b"]);
  });
  it("sorts starred → not visited → visited, by name within a group", () => {
    expect(ids(sortPlaces(list))).toEqual(["a", "d", "b", "c"]);
  });
});

describe("topAreas / countPlaces", () => {
  const list = [
    P({ area: "Mong Kok" }), P({ area: "Mong Kok" }), P({ area: "Mong Kok" }),
    P({ area: "TST", starred: true }), P({ area: "TST", visited: true }), P({ area: "" }), P({ area: "Central" }),
  ];
  it("counts, sorts and skips empty areas", () => {
    expect(topAreas(list, 4)).toEqual([{ area: "Mong Kok", count: 3 }, { area: "TST", count: 2 }, { area: "Central", count: 1 }]);
    expect(topAreas(list, 2)).toHaveLength(2);
  });
  it("countPlaces", () => {
    expect(countPlaces(list)).toEqual({ starred: 1, unvisited: 6, visited: 1 });
  });
});

describe("paginatePlaces", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  it("page 1: 10 with header", () => expect(paginatePlaces(items, 1)).toEqual({ items: items.slice(0, 10), remaining: 15, withHeader: true }));
  it("page 2: next 11, no header", () => expect(paginatePlaces(items, 2)).toEqual({ items: items.slice(10, 21), remaining: 4, withHeader: false }));
  it("page 3: rest", () => expect(paginatePlaces(items, 3)).toEqual({ items: items.slice(21), remaining: 0, withHeader: false }));
  it("≤ 10 fits on page 1", () => expect(paginatePlaces(items.slice(0, 10), 1).remaining).toBe(0));
});

describe("misc", () => {
  it("isPlaceFiltered / describePlaceFilter / starLabel / placeMapsQuery", () => {
    expect(isPlaceFiltered({ query: "" })).toBe(false);
    expect(isPlaceFiltered({ visited: false, query: "" })).toBe(true);
    expect(describePlaceFilter({ starred: true, visited: false, query: "TST" }, "r")).toBe("ต้องลอง · ยังไม่ไป · TST");
    expect(describePlaceFilter({ starred: true, query: "" }, "w")).toBe("ติดดาว");
    expect(starLabel("r")).toBe("ต้องลอง");
    expect(placeMapsQuery(P({ name: "Kam's", area: "Wan Chai" }))).toBe("Kam's Wan Chai");
    expect(placeMapsQuery(P({ name: "Kam's" }))).toBe("Kam's");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-places.test.ts`
Expected: FAIL with `Failed to resolve import "./line-places"`

- [ ] **Step 3: Write the implementation**

Create `lib/line-places.ts`:

```ts
// Pure places-view logic (restaurants + wishlist share one shape: Place).
import type { Restaurant, WishItem } from "@/lib/models/types";
import { includesCI, norm, joinParts } from "@/lib/line-view-kit";

export type PlaceKind = "r" | "w";

export interface Place {
  id: string; kind: PlaceKind; name: string; area: string; mapsLink: string; note: string;
  starred: boolean; visited: boolean; priceLevel: number; photoIds: string[];
}

export interface PlaceFilter { starred?: boolean; visited?: boolean; query: string }

export function starLabel(kind: PlaceKind): string {
  return kind === "r" ? "ต้องลอง" : "ติดดาว";
}

export function normalizePlace(row: Restaurant | WishItem, kind: PlaceKind): Place {
  return {
    id: row.id,
    kind,
    name: row.name ?? "",
    area: row.area ?? "",
    mapsLink: row.maps_link ?? "",
    note: row.note ?? "",
    starred: kind === "r" ? Boolean((row as Restaurant).must_try) : Boolean((row as WishItem).star),
    visited: Boolean(row.visited),
    priceLevel: kind === "r" ? Number((row as Restaurant).price_level) || 0 : 0,
    photoIds: row.photo_ids ?? [],
  };
}

const FILTER_WORDS: Record<string, Partial<PlaceFilter>> = {
  "ต้องลอง": { starred: true },
  "ดาว": { starred: true },
  "ติดดาว": { starred: true },
  "ยังไม่ไป": { visited: false },
  "ไปแล้ว": { visited: true },
};

// Whole-token match only, so a place name containing e.g. "ดาว" is still searchable.
export function parsePlacesRest(rest: string): PlaceFilter {
  const f: PlaceFilter = { query: "" };
  const left: string[] = [];
  for (const tok of norm(rest).split(" ")) {
    if (!tok) continue;
    const hit = FILTER_WORDS[tok];
    if (hit) Object.assign(f, hit);
    else left.push(tok);
  }
  f.query = left.join(" ");
  return f;
}

export function encodePlaceFilter(f: PlaceFilter): string {
  return [f.starred ? "s" : "", f.visited === false ? "v0" : f.visited === true ? "v1" : ""].filter(Boolean).join(".");
}

export function decodePlaceFilter(f: string | undefined, q: string | undefined): PlaceFilter {
  const parts = (f ?? "").split(".");
  const out: PlaceFilter = { query: q ?? "" };
  if (parts.includes("s")) out.starred = true;
  if (parts.includes("v0")) out.visited = false;
  if (parts.includes("v1")) out.visited = true;
  return out;
}

export function filterPlaces(places: Place[], f: PlaceFilter): Place[] {
  return places.filter(
    (p) =>
      (!f.starred || p.starred) &&
      (f.visited === undefined || p.visited === f.visited) &&
      includesCI([p.name, p.area, p.note], f.query),
  );
}

const rank = (p: Place) => (p.starred ? 0 : p.visited ? 2 : 1);

export function sortPlaces(places: Place[]): Place[] {
  return [...places].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "th"));
}

export function topAreas(places: Place[], limit: number): { area: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of places) {
    const a = p.area.trim();
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
    .slice(0, limit);
}

export function countPlaces(places: Place[]): { starred: number; unvisited: number; visited: number } {
  return {
    starred: places.filter((p) => p.starred).length,
    unvisited: places.filter((p) => !p.visited).length,
    visited: places.filter((p) => p.visited).length,
  };
}

// Page 1 = header + 10 + "more"; later pages = 11 + "more" -> never above 12 bubbles.
export const FIRST_PAGE_SIZE = 10;
export const NEXT_PAGE_SIZE = 11;

export function paginatePlaces<T>(items: T[], page: number): { items: T[]; remaining: number; withHeader: boolean } {
  const p = Math.max(1, Math.floor(page) || 1);
  const start = p === 1 ? 0 : FIRST_PAGE_SIZE + (p - 2) * NEXT_PAGE_SIZE;
  const size = p === 1 ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE;
  const slice = items.slice(start, start + size);
  return { items: slice, remaining: Math.max(0, items.length - start - slice.length), withHeader: p === 1 };
}

export function isPlaceFiltered(f: PlaceFilter): boolean {
  return Boolean(f.starred) || f.visited !== undefined || f.query.trim() !== "";
}

export function describePlaceFilter(f: PlaceFilter, kind: PlaceKind): string {
  return joinParts([
    f.starred ? starLabel(kind) : null,
    f.visited === false ? "ยังไม่ไป" : f.visited === true ? "ไปแล้ว" : null,
    f.query,
  ]);
}

export function placeMapsQuery(p: Place): string {
  return `${p.name} ${p.area}`.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-places.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add lib/line-places.ts lib/line-places.test.ts
git commit -m "$(cat <<'EOF'
feat(line): places filter, sort, areas and carousel paging logic

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Places Flex carousel + reply resolver

**Files:**
- Create: `lib/line-places-messages.ts`
- Test: `lib/line-places-messages.test.ts`

**Interfaces:**
- Consumes: Task 5 exports; Task 1 `appUrl`, `btn`, `emptyStateMessage`, `truncate`, `zoomHero`, `joinParts`; foundation `CLAY`, `compact`, `txt`, `postbackAction`, `flexMessage`, `textMessage`, `quickReply`, `FlexNode`; `mapButtons` (`@/lib/line-maps`)
- Produces:
  - `PLACE_KIND_META: Record<PlaceKind, { icon: string; title: string; empty: string; tab: string }>`
  - `buildPlaceBubble(origin: string, place: Place): FlexNode`
  - `buildSinglePlaceMessage(origin: string, place: Place): FlexNode`: a carousel holding 1 bubble
  - `buildPlacesCarousel(p: { origin: string; kind: PlaceKind; all: Place[]; matched: Place[]; filter: PlaceFilter; page: number }): FlexNode`
  - `buildPlacesReply(p: { trip: Trip; origin: string; kind: PlaceKind; places: Place[]; filter: PlaceFilter; page: number; fromCommand: boolean }): FlexNode[]`

Visited toggle postback: `pl_visit` (mark visited, sent with `v=0` = current value) or `pl_unvisit` (sent with `v=1`). Header area buttons set `q=<area>` because the query matches `area`. Area buttons are computed from the unfiltered list so the user can switch areas.

- [ ] **Step 1: Write the failing test**

Create `lib/line-places-messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPlaceBubble, buildSinglePlaceMessage, buildPlacesCarousel, buildPlacesReply } from "./line-places-messages";
import { normalizePlace, sortPlaces, type Place } from "./line-places";
import { allText, actionsOf, postbacksOf, hasEmptyText, countBubbles, mkRestaurant, mkWish, mkTrip } from "./line-view.test-helpers";
import { imageUrl } from "./line-flex";

const ORIGIN = "https://app.test";
const r = (p: Parameters<typeof mkRestaurant>[0]) => normalizePlace(mkRestaurant(p), "r");
const w = (p: Parameters<typeof mkWish>[0]) => normalizePlace(mkWish(p), "w");

describe("buildPlaceBubble", () => {
  const withPhoto = r({ id: "r1", name: "Kam's Roast Goose", area: "Wan Chai", must_try: true, price_level: 2, note: "ห่านย่าง", photo_ids: ["p1", "p2"] });

  it("hero opens the full photo with the star badge", () => {
    const b = buildPlaceBubble(ORIGIN, withPhoto) as Record<string, unknown>;
    expect(actionsOf(b.hero).some((a) => a.type === "uri" && a.uri === imageUrl(ORIGIN, "p1"))).toBe(true);
    expect(allText(b.hero)).toContain("⭐ ต้องลอง");
    expect(allText(b.hero)).toContain("แตะเพื่อขยาย");
  });

  it("shows area + price, note, photos button, visit toggle and maps buttons", () => {
    const b = buildPlaceBubble(ORIGIN, withPhoto);
    expect(allText(b)).toContain("📍 Wan Chai · ฿฿");
    expect(allText(b)).toContain("ห่านย่าง");
    expect(postbacksOf(b)).toContainEqual({ a: "pl_photos", k: "r", id: "r1" });
    expect(postbacksOf(b)).toContainEqual({ a: "pl_visit", k: "r", id: "r1", v: "0" });
    expect(actionsOf(b).some((a) => a.type === "uri" && String(a.uri).includes("amap"))).toBe(true);
    expect(hasEmptyText(b)).toBe(false);
  });

  it("no photo → no hero, badge after the name, no photos button; visited → unvisit toggle", () => {
    const b = buildPlaceBubble(ORIGIN, r({ id: "r2", name: "Tsim Chai Kee", visited: true })) as Record<string, unknown>;
    expect(b.hero).toBeUndefined();
    expect(allText(b)).toContain("Tsim Chai Kee  ✓ ไปแล้ว");
    expect(postbacksOf(b).some((p) => p.a === "pl_photos")).toBe(false);
    expect(postbacksOf(b)).toContainEqual({ a: "pl_unvisit", k: "r", id: "r2", v: "1" });
    expect(hasEmptyText(b)).toBe(false);
  });

  it("starred AND visited shows both badges", () => {
    const withPic = buildPlaceBubble(ORIGIN, r({ id: "r3", name: "Yat Lok", must_try: true, visited: true, photo_ids: ["p1"] })) as Record<string, unknown>;
    expect(allText(withPic.hero)).toContain("⭐ ต้องลอง · ✓ ไปแล้ว");
    expect(allText(buildPlaceBubble(ORIGIN, r({ id: "r4", name: "Mak's", must_try: true, visited: true })))).toContain("Mak's  ⭐ ต้องลอง · ✓ ไปแล้ว");
  });

  it("wishlist: star label 'ติดดาว' and never a price", () => {
    const b = buildPlaceBubble(ORIGIN, w({ id: "w1", name: "Victoria Peak", area: "Central", star: true }));
    expect(allText(b)).toContain("⭐ ติดดาว");
    expect(allText(b)).not.toContain("฿");
    expect(postbacksOf(b)).toContainEqual({ a: "pl_visit", k: "w", id: "w1", v: "0" });
  });
});

describe("buildSinglePlaceMessage", () => {
  it("is a carousel with exactly one bubble", () => {
    expect(countBubbles(buildSinglePlaceMessage(ORIGIN, r({ id: "r1", name: "A" })))).toBe(1);
  });
});

describe("buildPlacesCarousel", () => {
  const many: Place[] = sortPlaces(Array.from({ length: 25 }, (_, i) => r({ id: `r${i}`, name: `R${String(i).padStart(2, "0")}`, area: i % 2 ? "Mong Kok" : "TST" })));
  const base = { origin: ORIGIN, kind: "r" as const, all: many, matched: many, filter: { query: "" } };

  it("page 1 = header + 10 + more (12 bubbles)", () => {
    const msg = buildPlacesCarousel({ ...base, page: 1 });
    expect(countBubbles(msg)).toBe(12);
    expect(allText(msg)).toContain("🍜 ร้านอาหาร · 25");
    expect(postbacksOf(msg).find((p) => p.a === "pl_list" && p.n === "2")).toMatchObject({ k: "r" });
  });

  it("page 2 = 11 + more, no header; page 3 = rest", () => {
    const p2 = buildPlacesCarousel({ ...base, page: 2 });
    expect(countBubbles(p2)).toBe(12);
    expect(allText(p2)).not.toContain("🍜 ร้านอาหาร · 25");
    expect(countBubbles(buildPlacesCarousel({ ...base, page: 3 }))).toBe(4);
  });

  it("header: counts, top-area buttons and the star filter", () => {
    const msg = buildPlacesCarousel({ ...base, page: 1 });
    expect(allText(msg)).toContain("ต้องลอง 0 · ยังไม่ไป 25 · ไปแล้ว 0");
    const pbs = postbacksOf(msg);
    expect(pbs).toContainEqual({ a: "pl_list", k: "r", q: "Mong Kok" });
    expect(pbs).toContainEqual({ a: "pl_list", k: "r", f: "s" });
  });

  it("filtered header shows the filter and a clear button", () => {
    const msg = buildPlacesCarousel({ ...base, matched: many.slice(0, 3), filter: { visited: false, query: "TST" }, page: 1 });
    expect(allText(msg)).toContain("กรอง: ยังไม่ไป · TST");
    expect(postbacksOf(msg)).toContainEqual({ a: "pl_list", k: "r" });
    expect(postbacksOf(msg).some((p) => p.f === "s")).toBe(false);
  });

  it("more card keeps the filter", () => {
    const msg = buildPlacesCarousel({ ...base, filter: { visited: false, query: "" }, page: 1 });
    expect(postbacksOf(msg).find((p) => p.n === "2")).toEqual({ a: "pl_list", k: "r", f: "v0", n: "2" });
  });

  it("has no empty text", () => {
    expect(hasEmptyText(buildPlacesCarousel({ ...base, page: 1 }))).toBe(false);
  });
});

describe("buildPlacesReply", () => {
  const base = { trip: mkTrip(), origin: ORIGIN, page: 1 };
  const places = [r({ id: "a", name: "Kam's", area: "Wan Chai", must_try: true }), r({ id: "b", name: "Tim Ho Wan", area: "Mong Kok" })];

  it("empty list → empty state with link to the right tab", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "w", places: [], filter: { query: "" }, fromCommand: true });
    expect(allText(msg)).toContain("ยังไม่มีที่เที่ยวในทริปนี้");
    expect(actionsOf(msg).some((a) => a.uri === "https://app.test/trips/t1/info?tab=wishlist")).toBe(true);
  });

  it("no match → 'ไม่เจอ' + area quick replies", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "r", places, filter: { query: "zzz" }, fromCommand: true });
    expect(allText(msg)).toContain("ไม่เจอ 'zzz'");
    expect(postbacksOf(msg)).toEqual([
      { a: "pl_list", k: "r", q: "Mong Kok" },
      { a: "pl_list", k: "r", q: "Wan Chai" },
    ]);
  });

  it("one match with a query from a command → single bubble, no header", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "r", places, filter: { query: "kam" }, fromCommand: true });
    expect(countBubbles(msg)).toBe(1);
  });

  it("one match with only a filter → header + 1", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "r", places, filter: { starred: true, query: "" }, fromCommand: true });
    expect(countBubbles(msg)).toBe(2);
  });

  it("no filter → header + all", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "r", places, filter: { query: "" }, fromCommand: true });
    expect(countBubbles(msg)).toBe(3);
  });

  it("a stale page beyond the end falls back to page 1", () => {
    const [msg] = buildPlacesReply({ ...base, page: 9, kind: "r", places, filter: { query: "" }, fromCommand: false });
    expect(countBubbles(msg)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-places-messages.test.ts`
Expected: FAIL with `Failed to resolve import "./line-places-messages"`

- [ ] **Step 3: Write the implementation**

Create `lib/line-places-messages.ts`:

```ts
// Pure Flex builders for the LINE restaurants / wishlist view.
import type { Trip } from "@/lib/models/types";
import { CLAY, compact, txt, postbackAction, flexMessage, textMessage, quickReply, type FlexNode } from "@/lib/line-flex";
import { mapButtons } from "@/lib/line-maps";
import {
  countPlaces, describePlaceFilter, encodePlaceFilter, filterPlaces, isPlaceFiltered, paginatePlaces, placeMapsQuery,
  sortPlaces, starLabel, topAreas, type Place, type PlaceFilter, type PlaceKind,
} from "@/lib/line-places";
import { appUrl, btn, emptyStateMessage, joinParts, truncate, zoomHero } from "@/lib/line-view-kit";

export const PLACE_KIND_META: Record<PlaceKind, { icon: string; title: string; empty: string; tab: string }> = {
  r: { icon: "🍜", title: "ร้านอาหาร", empty: "ยังไม่มีร้านในทริปนี้", tab: "restaurants" },
  w: { icon: "📍", title: "ที่อยากไป", empty: "ยังไม่มีที่เที่ยวในทริปนี้", tab: "wishlist" },
};

function filterData(kind: PlaceKind, f: PlaceFilter): Record<string, string | undefined> {
  return { k: kind, f: encodePlaceFilter(f) || undefined, q: f.query || undefined };
}

export function buildPlaceBubble(origin: string, p: Place): FlexNode {
  const photo = p.photoIds[0];
  const badge = joinParts([p.starred ? `⭐ ${starLabel(p.kind)}` : null, p.visited ? "✓ ไปแล้ว" : null]) || undefined;
  const name = !photo && badge ? `${p.name}  ${badge}` : p.name;
  const line = joinParts([p.area ? `📍 ${p.area}` : null, p.kind === "r" && p.priceLevel > 0 ? "฿".repeat(p.priceLevel) : null]);
  const toggle = p.visited
    ? btn(postbackAction("↩ ยังไม่ไป", { a: "pl_unvisit", k: p.kind, id: p.id, v: 1 }))
    : btn(postbackAction("✓ ไปแล้ว", { a: "pl_visit", k: p.kind, id: p.id, v: 0 }), "primary");
  return {
    type: "bubble",
    size: "kilo",
    ...(photo ? { hero: zoomHero({ origin, photoId: photo, badge }) } : {}),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: compact([
        txt(name || "(ไม่มีชื่อ)", { weight: "bold", size: "md", wrap: true, maxLines: 2, color: p.visited ? CLAY.grayInk : CLAY.ink }),
        txt(line || null, { size: "xs", wrap: true, color: CLAY.muted }),
        txt(p.note || null, { size: "xs", wrap: true, maxLines: 3, color: CLAY.muted }),
      ]),
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: compact([
        ...mapButtons({ query: placeMapsQuery(p), mapsLink: p.mapsLink || undefined }),
        p.photoIds.length ? btn(postbackAction(`📷 รูป (${p.photoIds.length})`, { a: "pl_photos", k: p.kind, id: p.id })) : null,
        toggle,
      ]),
    },
  };
}

export function buildSinglePlaceMessage(origin: string, p: Place): FlexNode {
  return flexMessage(truncate(p.name || PLACE_KIND_META[p.kind].title, 400), { type: "carousel", contents: [buildPlaceBubble(origin, p)] });
}

function headerBubble(kind: PlaceKind, all: Place[], matched: Place[], f: PlaceFilter): FlexNode {
  const meta = PLACE_KIND_META[kind];
  const c = countPlaces(matched);
  const filtered = isPlaceFiltered(f);
  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      contents: compact([
        txt(`${meta.icon} ${meta.title} · ${matched.length}`, { weight: "bold", size: "lg", wrap: true, color: CLAY.ink }),
        txt(`${starLabel(kind)} ${c.starred} · ยังไม่ไป ${c.unvisited} · ไปแล้ว ${c.visited}`, { size: "xs", wrap: true, color: CLAY.muted }),
        filtered ? txt(`กรอง: ${describePlaceFilter(f, kind)}`, { size: "xs", wrap: true, color: CLAY.coral }) : null,
      ]),
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: compact([
        ...topAreas(all, 4).map((a) => btn(postbackAction(`${truncate(a.area, 14)} (${a.count})`, { a: "pl_list", k: kind, q: a.area }))),
        filtered
          ? btn(postbackAction("ล้างตัวกรอง", { a: "pl_list", k: kind }), "link")
          : btn(postbackAction(`⭐ เฉพาะ${starLabel(kind)}`, { a: "pl_list", k: kind, f: "s" }), "primary"),
      ]),
    },
  };
}

function moreBubble(kind: PlaceKind, f: PlaceFilter, nextPage: number, remaining: number): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      contents: [btn(postbackAction(`ดูต่อ (${remaining})`, { a: "pl_list", ...filterData(kind, f), n: nextPage }), "primary")],
    },
  };
}

export function buildPlacesCarousel(p: { origin: string; kind: PlaceKind; all: Place[]; matched: Place[]; filter: PlaceFilter; page: number }): FlexNode {
  const page = Math.max(1, Math.floor(p.page) || 1);
  const pg = paginatePlaces(p.matched, page);
  const bubbles = compact([
    pg.withHeader ? headerBubble(p.kind, p.all, p.matched, p.filter) : null,
    ...pg.items.map((pl) => buildPlaceBubble(p.origin, pl)),
    pg.remaining > 0 ? moreBubble(p.kind, p.filter, page + 1, pg.remaining) : null,
  ]);
  const meta = PLACE_KIND_META[p.kind];
  return flexMessage(truncate(`${meta.icon} ${meta.title} · ${p.matched.length}`, 400), { type: "carousel", contents: bubbles });
}

function areaQuickReply(kind: PlaceKind, places: Place[]): FlexNode | undefined {
  const areas = topAreas(places, 13);
  return areas.length ? quickReply(areas.map((a) => ({ label: a.area, data: { a: "pl_list", k: kind, q: a.area } }))) : undefined;
}

export function buildPlacesReply(p: { trip: Trip; origin: string; kind: PlaceKind; places: Place[]; filter: PlaceFilter; page: number; fromCommand: boolean }): FlexNode[] {
  const meta = PLACE_KIND_META[p.kind];
  if (p.places.length === 0) return [emptyStateMessage(meta.empty, appUrl(p.origin, p.trip.id, `info?tab=${meta.tab}`))];
  const matched = sortPlaces(filterPlaces(p.places, p.filter));
  if (matched.length === 0) return [textMessage(`ไม่เจอ '${describePlaceFilter(p.filter, p.kind)}'`, areaQuickReply(p.kind, p.places))];
  if (p.fromCommand && p.filter.query && matched.length === 1) return [buildSinglePlaceMessage(p.origin, matched[0])];
  const page = paginatePlaces(matched, p.page).items.length ? p.page : 1;
  return [buildPlacesCarousel({ origin: p.origin, kind: p.kind, all: p.places, matched, filter: p.filter, page })];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-places-messages.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add lib/line-places-messages.ts lib/line-places-messages.test.ts
git commit -m "$(cat <<'EOF'
feat(line): restaurants/wishlist carousel with header card and paging

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Places handler with visited toggle (replace stub)

**Files:**
- Replace: `lib/line-handlers/places.ts` (overwrite the foundation stub entirely)
- Test: `lib/line-handlers/places.test.ts`

**Interfaces:**
- Consumes: `HandlerCtx`, `PostbackData`, `Route`, `listRows`, `updateRow` (`@/lib/store`), `EntityName` (`@/lib/models/mappers`); Tasks 1, 5, 6
- Produces:
  - `handleRoute(ctx, route)`: handles only `route.kind === "places"` (uses `route.placeKind`, `route.rest`)
  - `handlePostback(ctx, data)`: `pl_list` (`k`,`f`,`q`,`n`), `pl_photos` (`k`,`id`), `pl_visit` / `pl_unvisit` (`k`,`id`,`v`)

Toggle rule: re-read the row. Write only if the stored `visited` still equals the postback's `v` AND differs from the target. Otherwise do not write. Reply a short "สถานะเปลี่ยนไปแล้ว" note plus the place's current card.

- [ ] **Step 1: Write the failing test**

Create `lib/line-handlers/places.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ listRows: vi.fn(), updateRow: vi.fn() }));

import { listRows, updateRow } from "@/lib/store";
import { handleRoute, handlePostback } from "./places";
import { NO_TRIP_TEXT, GONE_TEXT } from "@/lib/line-view-kit";
import { allText, postbacksOf, countBubbles, mkCtx, mkRestaurant, mkWish, repliedMessages } from "@/lib/line-view.test-helpers";

let DATA: Record<string, unknown[]>;

beforeEach(() => {
  DATA = {
    restaurants: [
      mkRestaurant({ id: "r1", name: "Kam's", area: "Wan Chai", must_try: true, photo_ids: ["p1", "p2"] }),
      mkRestaurant({ id: "r2", name: "Tim Ho Wan", area: "Mong Kok", visited: true }),
    ],
    wishlist: [mkWish({ id: "w1", name: "Peak", area: "Central", star: true })],
  };
  vi.mocked(listRows).mockReset();
  vi.mocked(updateRow).mockReset();
  vi.mocked(listRows).mockImplementation((async (entity: string) => DATA[entity] ?? []) as never);
  vi.mocked(updateRow).mockResolvedValue(undefined);
});

describe("places handleRoute", () => {
  it("no trip → no-trip text", async () => {
    const ctx = mkCtx({ trip: null });
    await handleRoute(ctx, { kind: "places", placeKind: "r", rest: "" });
    expect(allText(repliedMessages(ctx))).toBe(NO_TRIP_TEXT);
  });

  it("ignores other routes", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "booking", rest: "" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("ร้าน → restaurants carousel with header", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "places", placeKind: "r", rest: "" });
    expect(listRows).toHaveBeenCalledWith("restaurants", "t1");
    expect(countBubbles(repliedMessages(ctx))).toBe(3);
    expect(allText(repliedMessages(ctx))).toContain("🍜 ร้านอาหาร · 2");
  });

  it("ที่เที่ยว → wishlist", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "places", placeKind: "w", rest: "" });
    expect(listRows).toHaveBeenCalledWith("wishlist", "t1");
    expect(allText(repliedMessages(ctx))).toContain("Peak");
  });

  it("ร้าน ยังไม่ไป → only unvisited", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "places", placeKind: "r", rest: "ยังไม่ไป" });
    const text = allText(repliedMessages(ctx));
    expect(text).toContain("Kam's");
    expect(text).not.toContain("Tim Ho Wan");
  });
});

describe("places handlePostback", () => {
  it("pl_list with a query from a postback keeps the header (not a command)", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_list", k: "r", q: "Mong Kok" });
    expect(countBubbles(repliedMessages(ctx))).toBe(2);
  });

  it("pl_photos → album", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_photos", k: "r", id: "r1" });
    expect(JSON.stringify(repliedMessages(ctx))).toContain("/api/img/p2");
  });

  it("pl_visit with matching current value → writes visited=true and replies the updated card", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_visit", k: "r", id: "r1", v: "0" });
    expect(updateRow).toHaveBeenCalledWith("restaurants", "r1", expect.objectContaining({ id: "r1", visited: true, must_try: true }));
    expect(postbacksOf(repliedMessages(ctx))).toContainEqual({ a: "pl_unvisit", k: "r", id: "r1", v: "1" });
  });

  it("pl_unvisit on wishlist writes visited=false", async () => {
    DATA.wishlist = [mkWish({ id: "w1", name: "Peak", visited: true })];
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_unvisit", k: "w", id: "w1", v: "1" });
    expect(updateRow).toHaveBeenCalledWith("wishlist", "w1", expect.objectContaining({ visited: false }));
  });

  it("stale toggle (someone already changed it) → no write, current card", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_visit", k: "r", id: "r2", v: "0" }); // r2 is already visited
    expect(updateRow).not.toHaveBeenCalled();
    const msgs = repliedMessages(ctx);
    expect(allText(msgs)).toContain("สถานะเปลี่ยนไปแล้ว");
    expect(postbacksOf(msgs)).toContainEqual({ a: "pl_unvisit", k: "r", id: "r2", v: "1" });
  });

  it("deleted place → gone text, no write", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_visit", k: "r", id: "nope", v: "0" });
    expect(updateRow).not.toHaveBeenCalled();
    expect(allText(repliedMessages(ctx))).toBe(GONE_TEXT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-handlers/places.test.ts`
Expected: FAIL (the stub reply does not contain the carousel and never calls `updateRow`)

- [ ] **Step 3: Replace the handler**

Overwrite `lib/line-handlers/places.ts` with:

```ts
// LINE restaurants / wishlist view -- I/O only; logic in lib/line-places*.ts.
import { listRows, updateRow } from "@/lib/store";
import type { EntityName } from "@/lib/models/mappers";
import type { Restaurant, Trip, WishItem } from "@/lib/models/types";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { decodePlaceFilter, normalizePlace, parsePlacesRest, type PlaceFilter, type PlaceKind } from "@/lib/line-places";
import { buildPlacesReply, buildSinglePlaceMessage, PLACE_KIND_META } from "@/lib/line-places-messages";
import { NO_TRIP_TEXT, GONE_TEXT, albumMessage, appUrl } from "@/lib/line-view-kit";

type PlaceRow = Restaurant | WishItem;

const ENTITY: Record<PlaceKind, EntityName> = { r: "restaurants", w: "wishlist" };

const loadRows = (tripId: string, kind: PlaceKind) => listRows<PlaceRow>(ENTITY[kind], tripId);

async function replyList(ctx: HandlerCtx, trip: Trip, kind: PlaceKind, filter: PlaceFilter, page: number, fromCommand: boolean): Promise<void> {
  const rows = await loadRows(trip.id, kind);
  await ctx.reply(
    buildPlacesReply({ trip, origin: ctx.origin, kind, places: rows.map((r) => normalizePlace(r, kind)), filter, page, fromCommand }),
  );
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "places") return;
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  await replyList(ctx, trip, route.placeKind, parsePlacesRest(route.rest), 1, true);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const kind: PlaceKind = data.k === "w" ? "w" : "r";

  if (data.a === "pl_list") return replyList(ctx, trip, kind, decodePlaceFilter(data.f, data.q), Number(data.n) || 1, false);

  const rows = await loadRows(trip.id, kind);
  const row = rows.find((r) => r.id === data.id);
  if (!row) return ctx.reply([textMessage(GONE_TEXT)]);

  if (data.a === "pl_photos") {
    if (!row.photo_ids.length) return ctx.reply([textMessage("รายการนี้ไม่มีรูป")]);
    return ctx.reply([
      albumMessage({ origin: ctx.origin, photoIds: row.photo_ids, title: row.name, moreUrl: appUrl(ctx.origin, trip.id, `info?tab=${PLACE_KIND_META[kind].tab}`) }),
    ]);
  }

  if (data.a === "pl_visit" || data.a === "pl_unvisit") {
    const target = data.a === "pl_visit";
    const expectedCurrent = data.v === "1";
    // Re-check: the other person (or the app) may have flipped it since this card was sent.
    if (row.visited !== expectedCurrent || row.visited === target) {
      return ctx.reply([textMessage("สถานะเปลี่ยนไปแล้ว นี่คือข้อมูลล่าสุด"), buildSinglePlaceMessage(ctx.origin, normalizePlace(row, kind))]);
    }
    const updated: PlaceRow = { ...row, visited: target };
    await updateRow<PlaceRow>(ENTITY[kind], row.id, updated);
    return ctx.reply([buildSinglePlaceMessage(ctx.origin, normalizePlace(updated, kind))]);
  }
}
```

- [ ] **Step 3b: Remove the places stub from the foundation's stub test**

`lib/line-handlers/stubs.test.ts` (foundation) asserts that every stub replies "ฟีเจอร์นี้กำลังพัฒนา". Once `places.ts` is real, that suite fails. Delete exactly these two lines from it. Other feature plans delete their own lines, so if yours are already gone, leave the file as it is:

```ts
import * as places from "./places";
```
```ts
  ["places", places],
```

If this leaves `describe.each([])` with no rows (every feature plan has landed), delete the file instead: `git rm lib/line-handlers/stubs.test.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-handlers/places.test.ts lib/line-places.test.ts lib/line-places-messages.test.ts lib/line-handlers/stubs.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add -A lib/line-handlers/places.ts lib/line-handlers/places.test.ts lib/line-handlers/stubs.test.ts
git commit -m "$(cat <<'EOF'
feat(line): places view handler with re-checked visited toggle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Quick info / notes logic

**Files:**
- Create: `lib/line-info.ts`
- Test: `lib/line-info.test.ts`

**Interfaces:**
- Consumes: Task 1 `includesCI`, `firstLine`
- Produces:
  - `type ValueKind = "phone" | "url" | "address" | "text"`
  - `classifyValue(label: string, value: string): ValueKind`
  - `telUri(value: string): string`
  - `sortQuickInfo(rows: QuickInfo[]): QuickInfo[]`: pinned first, then `sort_order`
  - `searchQuickInfo(rows: QuickInfo[], query: string): QuickInfo[]`
  - `sortNotes(rows: QuickNote[]): QuickNote[]`, `searchNotes(rows: QuickNote[], query: string): QuickNote[]`
  - `nonEmptyLines(text: string): string[]`, `noteTitle(n: QuickNote): string`
  - `bigTextSize(value: string): "5xl" | "4xl" | "3xl"`

- [ ] **Step 1: Write the failing test**

Create `lib/line-info.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyValue, telUri, sortQuickInfo, searchQuickInfo, sortNotes, searchNotes, noteTitle, nonEmptyLines, bigTextSize } from "./line-info";
import { mkQuickInfo, mkNote } from "./line-view.test-helpers";

describe("classifyValue", () => {
  it.each([
    ["เบอร์โรงแรม", "+852 2345 6789", "phone"],
    ["ฉุกเฉิน", "999", "phone"],
    ["เบอร์", "081-234-5678", "phone"],
    ["เว็บ", "https://example.com/x", "url"],
    ["ที่อยู่โรงแรม", "17 Science Museum Rd", "address"],
    ["ที่พัก", "彌敦道 123號", "address"],
    ["ร้าน", "88 Queen's Road Central", "address"],
    ["Hotel", "ICON", "address"],
    ["กรมธรรม์", "POL-2291-TH", "text"],
    ["wifi", "pass: abc12345", "text"],
    ["x", "12", "text"],
  ])("%s / %s → %s", (label, value, expected) => {
    expect(classifyValue(label, value)).toBe(expected);
  });
});

describe("telUri", () => {
  it("keeps digits and +", () => expect(telUri("+852 2345-6789")).toBe("tel:+85223456789"));
});

describe("quick info sort/search", () => {
  const rows = [
    mkQuickInfo({ id: "a", label: "wifi", value: "HK-5G", sort_order: 1 }),
    mkQuickInfo({ id: "b", label: "ที่อยู่", value: "Nathan Rd", sort_order: 0 }),
    mkQuickInfo({ id: "c", label: "ฉุกเฉิน", value: "999", pinned: true, sort_order: 5 }),
  ];
  it("pinned first, then sort_order", () => expect(sortQuickInfo(rows).map((r) => r.id)).toEqual(["c", "b", "a"]));
  it("search label and value", () => {
    expect(searchQuickInfo(rows, "WIFI").map((r) => r.id)).toEqual(["a"]);
    expect(searchQuickInfo(rows, "nathan").map((r) => r.id)).toEqual(["b"]);
    expect(searchQuickInfo(rows, "")).toHaveLength(3);
  });
});

describe("notes sort/search/title", () => {
  const rows = [
    mkNote({ id: "a", title: "วีซ่า", content: "ไม่ต้องใช้", sort_order: 2 }),
    mkNote({ id: "b", title: "", content: "\n  ของฝาก\nขนม", sort_order: 1 }),
  ];
  it("sorts by sort_order", () => expect(sortNotes(rows).map((r) => r.id)).toEqual(["b", "a"]));
  it("searches title and content", () => {
    expect(searchNotes(rows, "วีซ่า").map((r) => r.id)).toEqual(["a"]);
    expect(searchNotes(rows, "ขนม").map((r) => r.id)).toEqual(["b"]);
  });
  it("noteTitle falls back to the first content line", () => {
    expect(noteTitle(rows[0])).toBe("วีซ่า");
    expect(noteTitle(rows[1])).toBe("ของฝาก");
    expect(noteTitle(mkNote())).toBe("(ไม่มีหัวข้อ)");
  });
  it("nonEmptyLines", () => expect(nonEmptyLines("\n a \n\n b")).toEqual(["a", "b"]));
});

describe("bigTextSize", () => {
  it("picks a size by length", () => {
    expect(bigTextSize("x".repeat(20))).toBe("5xl");
    expect(bigTextSize("x".repeat(21))).toBe("4xl");
    expect(bigTextSize("x".repeat(60))).toBe("4xl");
    expect(bigTextSize("x".repeat(61))).toBe("3xl");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-info.test.ts`
Expected: FAIL with `Failed to resolve import "./line-info"`

- [ ] **Step 3: Write the implementation**

Create `lib/line-info.ts`:

```ts
// Pure quick-info / quick-notes logic. Server-side: no localStorage, so the
// app's lib/quickinfo-order.ts override is intentionally NOT used here.
import type { QuickInfo, QuickNote } from "@/lib/models/types";
import { includesCI, firstLine } from "@/lib/line-view-kit";

export type ValueKind = "phone" | "url" | "address" | "text";

const PHONE_RE = /^\+?[\d\s-]+$/;
const ADDRESS_LABEL_RE = /ที่อยู่|address|โรงแรม|hotel/i;
const ADDRESS_VALUE_RE = /\b(road|rd|st|street)\b|[道號街]/i;

export function classifyValue(label: string, value: string): ValueKind {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return "url";
  if (PHONE_RE.test(v)) {
    const digits = v.replace(/\D/g, "").length;
    if (digits >= 3 && digits <= 20) return "phone";
  }
  if (ADDRESS_LABEL_RE.test(label) || ADDRESS_VALUE_RE.test(v)) return "address";
  return "text";
}

export function telUri(value: string): string {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}

export function sortQuickInfo(rows: QuickInfo[]): QuickInfo[] {
  return [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sort_order - b.sort_order);
}

export function searchQuickInfo(rows: QuickInfo[], query: string): QuickInfo[] {
  return rows.filter((r) => includesCI([r.label, r.value], query));
}

export function sortNotes(rows: QuickNote[]): QuickNote[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

export function searchNotes(rows: QuickNote[], query: string): QuickNote[] {
  return rows.filter((n) => includesCI([n.title, n.content], query));
}

export function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
}

export function noteTitle(n: QuickNote): string {
  return n.title.trim() || firstLine(n.content) || "(ไม่มีหัวข้อ)";
}

export function bigTextSize(value: string): "5xl" | "4xl" | "3xl" {
  const n = Array.from(value).length;
  return n <= 20 ? "5xl" : n <= 60 ? "4xl" : "3xl";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-info.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add lib/line-info.ts lib/line-info.test.ts
git commit -m "$(cat <<'EOF'
feat(line): quick info value classification, sorting and long-text split

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Quick info / notes Flex messages + reply resolvers

**Files:**
- Create: `lib/line-info-messages.ts`
- Test: `lib/line-info-messages.test.ts`

**Interfaces:**
- Consumes: Task 8 exports; Task 1 `appUrl`, `btn`, `emptyStateMessage`, `exceedsLines`, `pageSlice`, `truncate`, `zoomHero`; foundation `CLAY`, `compact`, `txt`, `postbackAction`, `uriAction`, `clipboardAction`, `flexMessage`, `textMessage`, `quickReply`, `FlexNode`; `mapButtons`
- Produces:
  - `buildQuickInfoList(p: { rows: QuickInfo[]; query: string; page: number }): FlexNode`
  - `buildQuickInfoDetail(p: { origin: string; row: QuickInfo }): FlexNode[]`: card + plain-text value
  - `buildBigText(value: string): FlexNode`
  - `buildQuickInfoReply(p: { trip: Trip; origin: string; rows: QuickInfo[]; query: string; page: number; autoDetail: boolean }): FlexNode[]`
  - `buildNoteList(p: { rows: QuickNote[]; query: string; page: number }): FlexNode`
  - `buildNoteDetail(p: { origin: string; note: QuickNote; query?: string }): FlexNode` (back button keeps `query`)
  - `buildNoteFullText(note: QuickNote, appLink: string): FlexNode[]`: ≤ 5 text messages
  - `buildNotesReply(p: { trip: Trip; origin: string; rows: QuickNote[]; query: string; page: number; autoDetail: boolean }): FlexNode[]`

- [ ] **Step 1: Write the failing test**

Create `lib/line-info-messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildQuickInfoList, buildQuickInfoDetail, buildBigText, buildQuickInfoReply,
  buildNoteList, buildNoteDetail, buildNoteFullText, buildNotesReply,
} from "./line-info-messages";
import { allText, texts, actionsOf, postbacksOf, hasEmptyText, mkQuickInfo, mkNote, mkTrip } from "./line-view.test-helpers";
import { imageUrl } from "./line-flex";

const ORIGIN = "https://app.test";
const phone = mkQuickInfo({ id: "q1", label: "ฉุกเฉิน", value: "999", pinned: true });
const url = mkQuickInfo({ id: "q2", label: "เว็บ MTR", value: "https://mtr.com.hk", sort_order: 1 });
const addr = mkQuickInfo({ id: "q3", label: "ที่อยู่โรงแรม", value: "17 Science Museum Rd", sort_order: 2, photo_ids: ["p1", "p2"] });
const plain = mkQuickInfo({ id: "q4", label: "wifi", value: "pass: abc12345", sort_order: 3 });

describe("buildQuickInfoList", () => {
  const msg = buildQuickInfoList({ rows: [phone, url, addr, plain], query: "", page: 1 });

  it("header with count; rows with pin/photo markers and 2-line values", () => {
    const text = allText(msg);
    expect(text).toContain("ℹ️ ข้อมูลด่วน · 4");
    expect(text).toContain("📌 ฉุกเฉิน");
    expect(text).toContain("ที่อยู่โรงแรม 📷");
    expect(JSON.stringify(msg)).toContain('"maxLines":2');
  });

  it("row buttons follow the value kind; rows open the detail", () => {
    const acts = actionsOf(msg);
    expect(acts.some((a) => a.type === "uri" && a.uri === "tel:999")).toBe(true);
    expect(acts.some((a) => a.type === "uri" && a.uri === "https://mtr.com.hk")).toBe(true);
    expect(acts.filter((a) => a.type === "clipboard").map((a) => a.clipboardText)).toEqual(["17 Science Museum Rd", "pass: abc12345"]);
    expect(postbacksOf(msg).filter((p) => p.a === "qi_detail").map((p) => p.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("shows the active query and pages after 15", () => {
    const rows = Array.from({ length: 16 }, (_, i) => mkQuickInfo({ id: `x${i}`, label: `L${i}`, value: "v" }));
    const m = buildQuickInfoList({ rows, query: "v", page: 1 });
    expect(allText(m)).toContain('กรอง "v"');
    expect(postbacksOf(m)).toContainEqual({ a: "qi_list", q: "v", n: "2" });
  });
});

describe("buildQuickInfoDetail", () => {
  it("returns the card followed by the plain value text", () => {
    const msgs = buildQuickInfoDetail({ origin: ORIGIN, row: phone });
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({ type: "text", text: "999" });
    const acts = actionsOf(msgs[0]);
    expect(acts.some((a) => a.type === "clipboard" && a.clipboardText === "999")).toBe(true);
    expect(acts.some((a) => a.uri === "tel:999")).toBe(true);
    expect(postbacksOf(msgs[0])).toContainEqual({ a: "qi_big", id: "q1" });
    expect(allText(msgs[0])).toContain("📌 ฉุกเฉิน");
  });

  it("address → maps buttons; >1 photo → photos button; hero opens the photo", () => {
    const [card] = buildQuickInfoDetail({ origin: ORIGIN, row: addr });
    const acts = actionsOf(card);
    expect(acts.some((a) => a.type === "uri" && String(a.uri).includes("amap"))).toBe(true);
    expect(acts.some((a) => a.type === "uri" && a.uri === imageUrl(ORIGIN, "p1"))).toBe(true);
    expect(postbacksOf(card)).toContainEqual({ a: "qi_photos", id: "q3" });
    expect(hasEmptyText(card)).toBe(false);
  });

  it("single photo → no photos button", () => {
    const [card] = buildQuickInfoDetail({ origin: ORIGIN, row: { ...plain, photo_ids: ["p9"] } });
    expect(postbacksOf(card).some((p) => p.a === "qi_photos")).toBe(false);
  });
});

describe("buildBigText", () => {
  it("giga bubble, size by length, no buttons, no label", () => {
    const msg = buildBigText("彌敦道 123號") as { contents: Record<string, unknown> };
    expect(msg.contents.size).toBe("giga");
    expect(JSON.stringify(msg)).toContain('"size":"5xl"');
    expect(actionsOf(msg)).toHaveLength(0);
    expect(JSON.stringify(buildBigText("x".repeat(70)))).toContain('"size":"3xl"');
  });
});

describe("buildQuickInfoReply", () => {
  const base = { trip: mkTrip(), origin: ORIGIN, page: 1 };
  it("empty → empty state linking to the quickinfo tab", () => {
    const [msg] = buildQuickInfoReply({ ...base, rows: [], query: "", autoDetail: true });
    expect(allText(msg)).toContain("ยังไม่มีข้อมูลด่วนในทริปนี้");
    expect(actionsOf(msg).some((a) => a.uri === "https://app.test/trips/t1/info?tab=quickinfo")).toBe(true);
  });
  it("no match → 'ไม่เจอ' + quick replies of existing labels (sorted)", () => {
    const [msg] = buildQuickInfoReply({ ...base, rows: [plain, phone], query: "zzz", autoDetail: true });
    expect(allText(msg)).toContain("ไม่เจอ 'zzz'");
    expect(postbacksOf(msg)).toEqual([{ a: "qi_detail", id: "q1" }, { a: "qi_detail", id: "q4" }]);
  });
  it("one match from a command → detail (card + text)", () => {
    expect(buildQuickInfoReply({ ...base, rows: [plain, phone], query: "wifi", autoDetail: true })).toHaveLength(2);
  });
  it("several → list, pinned first", () => {
    const [msg] = buildQuickInfoReply({ ...base, rows: [plain, phone], query: "", autoDetail: true });
    const t = allText(msg);
    expect(t.indexOf("ฉุกเฉิน")).toBeLessThan(t.indexOf("wifi"));
  });
});

describe("notes", () => {
  const visa = mkNote({ id: "n1", title: "วีซ่า", content: "ไทยไม่ต้องใช้วีซ่า\nอยู่ได้ 30 วัน", sort_order: 1 });
  const gifts = mkNote({ id: "n2", title: "", content: "ของฝาก\nขนมไข่", photo_ids: ["p1"], sort_order: 0 });
  const long = mkNote({ id: "n3", title: "ยาว", content: Array.from({ length: 20 }, (_, i) => `บรรทัด ${i}`).join("\n") });

  it("list: title (fallback to first line), preview, 📷 or ›, rows open detail", () => {
    const msg = buildNoteList({ rows: [gifts, visa], query: "", page: 1 });
    const t = allText(msg);
    expect(t).toContain("📒 โน้ต · 2");
    expect(t).toContain("ของฝาก");
    expect(t).toContain("ขนมไข่");
    expect(t).toContain("ไทยไม่ต้องใช้วีซ่า");
    expect(t).toContain("📷");
    expect(t).toContain("›");
    expect(postbacksOf(msg).map((p) => p.id)).toEqual(["n2", "n1"]);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("detail: short note has no read-full button; back goes to the list", () => {
    const msg = buildNoteDetail({ origin: ORIGIN, note: visa });
    expect(postbacksOf(msg).some((p) => p.a === "qn_full")).toBe(false);
    expect(postbacksOf(msg)).toContainEqual({ a: "qn_list" });
    expect(JSON.stringify(msg)).toContain('"maxLines":12');
  });

  it("detail: long note has read-full; photo note has hero + photos button", () => {
    expect(postbacksOf(buildNoteDetail({ origin: ORIGIN, note: long }))).toContainEqual({ a: "qn_full", id: "n3" });
    const withPhoto = buildNoteDetail({ origin: ORIGIN, note: gifts }) as { contents: Record<string, unknown> };
    expect(withPhoto.contents.hero).toBeDefined();
    expect(postbacksOf(withPhoto)).toContainEqual({ a: "qn_photos", id: "n2" });
  });

  it("detail: empty title uses the first line once (not repeated in the body)", () => {
    const nodes = texts(buildNoteDetail({ origin: ORIGIN, note: gifts }));
    expect(nodes.filter((t) => t.includes("ของฝาก"))).toEqual(["ของฝาก"]);
    expect(nodes).toContain("ขนมไข่");
  });

  it("detail: back button keeps the search query; list rows carry it", () => {
    expect(postbacksOf(buildNoteDetail({ origin: ORIGIN, note: visa, query: "วีซ่า" }))).toContainEqual({ a: "qn_list", q: "วีซ่า" });
    expect(postbacksOf(buildNoteList({ rows: [visa], query: "วีซ่า", page: 1 }))).toContainEqual({ a: "qn_detail", id: "n1", q: "วีซ่า" });
  });

  it("full text: splits and appends the app link when truncated", () => {
    const huge = mkNote({ id: "n9", content: "x".repeat(4800 * 6) });
    const msgs = buildNoteFullText(huge, "https://app.test/trips/t1/info?tab=quicknotes");
    expect(msgs).toHaveLength(5);
    expect(String((msgs[4] as { text: string }).text)).toContain("…ยังมีต่อ อ่านในแอป https://app.test/trips/t1/info?tab=quicknotes");
    expect(buildNoteFullText(visa, "x")).toEqual([expect.objectContaining({ type: "text", text: visa.content })]);
    expect(buildNoteFullText(mkNote(), "x")).toEqual([expect.objectContaining({ text: "โน้ตนี้ไม่มีเนื้อหา" })]);
  });

  it("reply: empty / not found / single / list", () => {
    const base = { trip: mkTrip(), origin: ORIGIN, page: 1 };
    expect(allText(buildNotesReply({ ...base, rows: [], query: "", autoDetail: true }))).toContain("ยังไม่มีโน้ตในทริปนี้");
    const [nf] = buildNotesReply({ ...base, rows: [visa, gifts], query: "zzz", autoDetail: true });
    expect(postbacksOf(nf)).toEqual([{ a: "qn_detail", id: "n2" }, { a: "qn_detail", id: "n1" }]);
    const [single] = buildNotesReply({ ...base, rows: [visa, gifts], query: "วีซ่า", autoDetail: true });
    expect(postbacksOf(single)).toContainEqual({ a: "qn_list", q: "วีซ่า" });
    const [list] = buildNotesReply({ ...base, rows: [visa, gifts], query: "", autoDetail: true });
    expect(allText(list)).toContain("📒 โน้ต · 2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-info-messages.test.ts`
Expected: FAIL with `Failed to resolve import "./line-info-messages"`

- [ ] **Step 3: Write the implementation**

Create `lib/line-info-messages.ts`:

```ts
// Pure Flex builders for LINE quick info (ข้อมูลด่วน) and quick notes (โน้ต).
import type { QuickInfo, QuickNote, Trip } from "@/lib/models/types";
import { CLAY, compact, txt, postbackAction, uriAction, clipboardAction, flexMessage, textMessage, quickReply, type FlexNode } from "@/lib/line-flex";
import { mapButtons } from "@/lib/line-maps";
import { bigTextSize, classifyValue, noteTitle, nonEmptyLines, searchNotes, searchQuickInfo, sortNotes, sortQuickInfo, telUri } from "@/lib/line-info";
import { appUrl, btn, emptyStateMessage, exceedsLines, longTextMessages, pageSlice, truncate, zoomHero } from "@/lib/line-view-kit";

const clip = (v: string) => truncate(v, 1000);

function listBubble(title: string, rows: FlexNode[], more: FlexNode | null): FlexNode {
  return {
    type: "bubble",
    size: "mega",
    header: { type: "box", layout: "vertical", backgroundColor: CLAY.cream, paddingAll: "14px", contents: compact([txt(title, { weight: "bold", size: "md", wrap: true, color: CLAY.ink })]) },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "10px", contents: compact([...rows, more]) },
  };
}

// ---------- quick info ----------

function rowButton(r: QuickInfo): FlexNode | null {
  const v = r.value.trim();
  if (!v) return null;
  const kind = classifyValue(r.label, v);
  const action = kind === "phone" ? uriAction("📞", telUri(v)) : kind === "url" ? uriAction("🔗", v) : clipboardAction("📋", clip(v));
  return { type: "button", style: "link", height: "sm", flex: 0, action };
}

function qiLabel(r: QuickInfo, withPhotoIcon: boolean): string {
  return `${r.pinned ? "📌 " : ""}${r.label || "ข้อมูล"}${withPhotoIcon && r.photo_ids.length ? " 📷" : ""}`;
}

function qiRow(r: QuickInfo): FlexNode {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    paddingAll: "8px",
    cornerRadius: "12px",
    backgroundColor: CLAY.card,
    action: postbackAction("ดูรายละเอียด", { a: "qi_detail", id: r.id }),
    contents: compact([
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact([
          txt(qiLabel(r, true), { size: "xxs", wrap: true, color: CLAY.muted }),
          txt(r.value || null, { size: "sm", wrap: true, maxLines: 2, color: CLAY.ink }),
        ]),
      },
      rowButton(r),
    ]),
  };
}

export function buildQuickInfoList(p: { rows: QuickInfo[]; query: string; page: number }): FlexNode {
  const { items, hasMore } = pageSlice(p.rows, p.page);
  const page = Math.max(1, Math.floor(p.page) || 1);
  const title = `ℹ️ ข้อมูลด่วน · ${p.rows.length}${p.query ? ` · กรอง "${p.query}"` : ""}`;
  const more = hasMore ? btn(postbackAction("ดูต่อ", { a: "qi_list", q: p.query || undefined, n: page + 1 }), "link") : null;
  return flexMessage(truncate(title, 400), listBubble(title, items.map(qiRow), more));
}

function typeButtons(r: QuickInfo): FlexNode[] {
  const v = r.value.trim();
  if (!v) return [];
  switch (classifyValue(r.label, v)) {
    case "phone": return [btn(uriAction("📞 โทร", telUri(v)))];
    case "url": return [btn(uriAction("🔗 เปิดลิงก์", v))];
    case "address": return mapButtons({ query: v });
    default: return [];
  }
}

export function buildQuickInfoDetail(p: { origin: string; row: QuickInfo }): FlexNode[] {
  const r = p.row;
  const photo = r.photo_ids[0];
  const buttons = compact([
    r.value ? btn(clipboardAction("📋 คัดลอก", clip(r.value)), "primary") : null,
    ...typeButtons(r),
    r.photo_ids.length > 1 ? btn(postbackAction(`📷 รูป (${r.photo_ids.length})`, { a: "qi_photos", id: r.id })) : null,
    r.value ? btn(postbackAction("🔍 โชว์ตัวใหญ่", { a: "qi_big", id: r.id })) : null,
  ]);
  const card = flexMessage(truncate(`${r.label}: ${r.value}`, 400), {
    type: "bubble",
    size: "mega",
    ...(photo ? { hero: zoomHero({ origin: p.origin, photoId: photo }) } : {}),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: compact([
        txt(qiLabel(r, false), { size: "xs", wrap: true, color: CLAY.muted }),
        txt(r.value || "(ว่าง)", { size: "xl", weight: "bold", wrap: true, color: CLAY.ink }),
      ]),
    },
    ...(buttons.length ? { footer: { type: "box", layout: "vertical", spacing: "xs", contents: buttons } } : {}),
  });
  return compact([card, r.value ? textMessage(truncate(r.value, 5000)) : null]);
}

export function buildBigText(value: string): FlexNode {
  return flexMessage(truncate(value, 400), {
    type: "bubble",
    size: "giga",
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      paddingAll: "24px",
      contents: compact([txt(value, { size: bigTextSize(value), weight: "bold", wrap: true, align: "center", color: "#000000" })]),
    },
  });
}

export function buildQuickInfoReply(p: { trip: Trip; origin: string; rows: QuickInfo[]; query: string; page: number; autoDetail: boolean }): FlexNode[] {
  if (p.rows.length === 0) return [emptyStateMessage("ยังไม่มีข้อมูลด่วนในทริปนี้", appUrl(p.origin, p.trip.id, "info?tab=quickinfo"))];
  const sorted = sortQuickInfo(p.rows);
  const matched = searchQuickInfo(sorted, p.query);
  if (matched.length === 0) {
    return [textMessage(`ไม่เจอ '${p.query}'`, quickReply(sorted.slice(0, 13).map((r) => ({ label: r.label || r.value || "ข้อมูล", data: { a: "qi_detail", id: r.id } }))))];
  }
  if (p.autoDetail && matched.length === 1) return buildQuickInfoDetail({ origin: p.origin, row: matched[0] });
  return [buildQuickInfoList({ rows: matched, query: p.query, page: p.page })];
}

// ---------- quick notes ----------

function noteRow(n: QuickNote, query: string): FlexNode {
  const lines = nonEmptyLines(n.content);
  const preview = n.title.trim() ? lines[0] : lines[1];
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    paddingAll: "8px",
    cornerRadius: "12px",
    backgroundColor: CLAY.card,
    action: postbackAction("อ่านโน้ต", { a: "qn_detail", id: n.id, q: query || undefined }),
    contents: compact([
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact([
          txt(noteTitle(n), { weight: "bold", size: "sm", maxLines: 1, color: CLAY.ink }),
          txt(preview || null, { size: "xs", maxLines: 1, color: CLAY.muted }),
        ]),
      },
      txt(n.photo_ids.length ? "📷" : "›", { flex: 0, gravity: "center", color: CLAY.muted }),
    ]),
  };
}

export function buildNoteList(p: { rows: QuickNote[]; query: string; page: number }): FlexNode {
  const { items, hasMore } = pageSlice(p.rows, p.page);
  const page = Math.max(1, Math.floor(p.page) || 1);
  const title = `📒 โน้ต · ${p.rows.length}${p.query ? ` · กรอง "${p.query}"` : ""}`;
  const more = hasMore ? btn(postbackAction("ดูต่อ", { a: "qn_list", q: p.query || undefined, n: page + 1 }), "link") : null;
  return flexMessage(truncate(title, 400), listBubble(title, items.map((n) => noteRow(n, p.query)), more));
}

export function buildNoteDetail(p: { origin: string; note: QuickNote; query?: string }): FlexNode {
  const n = p.note;
  const photo = n.photo_ids[0];
  const title = noteTitle(n);
  // Title empty → the first line already became the title; don't repeat it in the body.
  const body = n.title.trim() ? n.content : n.content.replace(/^\s*[^\n]*\n?/, "");
  return flexMessage(truncate(`📒 ${title}`, 400), {
    type: "bubble",
    size: "mega",
    ...(photo ? { hero: zoomHero({ origin: p.origin, photoId: photo }) } : {}),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: compact([
        txt(title, { weight: "bold", size: "lg", wrap: true, color: CLAY.ink }),
        txt(body.trim() ? body : null, { size: "sm", wrap: true, maxLines: 12, color: CLAY.ink }),
      ]),
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: compact([
        exceedsLines(body, 12) ? btn(postbackAction("📄 อ่านเต็ม", { a: "qn_full", id: n.id }), "primary") : null,
        n.photo_ids.length ? btn(postbackAction(`📷 รูป (${n.photo_ids.length})`, { a: "qn_photos", id: n.id })) : null,
        btn(postbackAction("กลับรายการ", { a: "qn_list", q: p.query || undefined }), "link"),
      ]),
    },
  });
}

export function buildNoteFullText(note: QuickNote, appLink: string): FlexNode[] {
  return longTextMessages(note.content, appLink, "โน้ตนี้ไม่มีเนื้อหา");
}

export function buildNotesReply(p: { trip: Trip; origin: string; rows: QuickNote[]; query: string; page: number; autoDetail: boolean }): FlexNode[] {
  if (p.rows.length === 0) return [emptyStateMessage("ยังไม่มีโน้ตในทริปนี้", appUrl(p.origin, p.trip.id, "info?tab=quicknotes"))];
  const sorted = sortNotes(p.rows);
  const matched = searchNotes(sorted, p.query);
  if (matched.length === 0) {
    return [textMessage(`ไม่เจอ '${p.query}'`, quickReply(sorted.slice(0, 13).map((n) => ({ label: noteTitle(n), data: { a: "qn_detail", id: n.id } }))))];
  }
  if (p.autoDetail && matched.length === 1) return [buildNoteDetail({ origin: p.origin, note: matched[0], query: p.query })];
  return [buildNoteList({ rows: matched, query: p.query, page: p.page })];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-info-messages.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add lib/line-info-messages.ts lib/line-info-messages.test.ts
git commit -m "$(cat <<'EOF'
feat(line): quick info and quick notes Flex cards

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Info handler (replace stub)

**Files:**
- Replace: `lib/line-handlers/info.ts` (overwrite the foundation stub entirely)
- Test: `lib/line-handlers/info.test.ts`

**Interfaces:**
- Consumes: `HandlerCtx`, `PostbackData`, `Route`, `listRows`; Tasks 1, 8, 9
- Produces:
  - `handleRoute(ctx, route)`: handles `route.kind === "info"` (quickinfo) and `route.kind === "notes"` (quicknotes). The query is `norm(route.rest)`.
  - `handlePostback(ctx, data)`: `qi_list` (`q`,`n`), `qi_detail` / `qi_big` / `qi_photos` (`id`), `qn_list` (`q`,`n`), `qn_detail` / `qn_full` / `qn_photos` (`id`)

- [ ] **Step 1: Write the failing test**

Create `lib/line-handlers/info.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ listRows: vi.fn(), updateRow: vi.fn() }));

import { listRows } from "@/lib/store";
import { handleRoute, handlePostback } from "./info";
import { NO_TRIP_TEXT, GONE_TEXT } from "@/lib/line-view-kit";
import { allText, postbacksOf, mkCtx, mkQuickInfo, mkNote, repliedMessages } from "@/lib/line-view.test-helpers";

const DATA: Record<string, unknown[]> = {
  quickinfo: [
    mkQuickInfo({ id: "q1", label: "wifi", value: "HK-5G pass 1234", sort_order: 1, photo_ids: ["p1", "p2"] }),
    mkQuickInfo({ id: "q2", label: "ฉุกเฉิน", value: "999", pinned: true }),
  ],
  quicknotes: [
    mkNote({ id: "n1", title: "วีซ่า", content: "ไม่ต้องใช้" }),
    mkNote({ id: "n2", title: "ยาวมาก", content: "x".repeat(6000) }),
  ],
};

beforeEach(() => {
  vi.mocked(listRows).mockReset();
  vi.mocked(listRows).mockImplementation((async (entity: string) => DATA[entity] ?? []) as never);
});

describe("info handleRoute", () => {
  it("no trip → no-trip text", async () => {
    const ctx = mkCtx({ trip: null });
    await handleRoute(ctx, { kind: "info", rest: "" });
    expect(allText(repliedMessages(ctx))).toBe(NO_TRIP_TEXT);
  });

  it("ignores other routes", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "booking", rest: "" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("ข้อมูล → list from quickinfo, pinned first", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "info", rest: "" });
    expect(listRows).toHaveBeenCalledWith("quickinfo", "t1");
    const t = allText(repliedMessages(ctx));
    expect(t.indexOf("ฉุกเฉิน")).toBeLessThan(t.indexOf("wifi"));
  });

  it("ข้อมูล wifi 5G → single detail + plain text (digits never matter here)", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "info", rest: "wifi  5G" });
    const msgs = repliedMessages(ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({ type: "text", text: "HK-5G pass 1234" });
  });

  it("โน้ต วีซ่า → note detail", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "notes", rest: "วีซ่า" });
    expect(listRows).toHaveBeenCalledWith("quicknotes", "t1");
    expect(postbacksOf(repliedMessages(ctx))).toContainEqual({ a: "qn_list", q: "วีซ่า" });
  });
});

describe("info handlePostback", () => {
  it("qi_list renders the list (no auto-detail)", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "qi_list", q: "wifi" });
    expect(allText(repliedMessages(ctx))).toContain('ℹ️ ข้อมูลด่วน · 1 · กรอง "wifi"');
  });

  it("qi_detail / qi_big / qi_photos", async () => {
    const c1 = mkCtx();
    await handlePostback(c1, { a: "qi_detail", id: "q2" });
    expect(repliedMessages(c1)[1]).toMatchObject({ text: "999" });

    const c2 = mkCtx();
    await handlePostback(c2, { a: "qi_big", id: "q2" });
    expect(JSON.stringify(repliedMessages(c2))).toContain('"giga"');

    const c3 = mkCtx();
    await handlePostback(c3, { a: "qi_photos", id: "q1" });
    expect(JSON.stringify(repliedMessages(c3))).toContain("/api/img/p2");
  });

  it("unknown id → gone text", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "qn_detail", id: "nope" });
    expect(allText(repliedMessages(ctx))).toBe(GONE_TEXT);
  });

  it("qn_full splits a long note into text messages (≤ 5)", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "qn_full", id: "n2" });
    const msgs = repliedMessages(ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs.every((m) => m.type === "text")).toBe(true);
  });

  it("qn_list renders the note list", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "qn_list" });
    expect(allText(repliedMessages(ctx))).toContain("📒 โน้ต · 2");
  });

  it("no trip → no-trip text", async () => {
    const ctx = mkCtx({ trip: null });
    await handlePostback(ctx, { a: "qi_list" });
    expect(allText(repliedMessages(ctx))).toBe(NO_TRIP_TEXT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/line-handlers/info.test.ts`
Expected: FAIL (the stub reply has none of the expected content)

- [ ] **Step 3: Replace the handler**

Overwrite `lib/line-handlers/info.ts` with:

```ts
// LINE quick info (ข้อมูลด่วน) + quick notes (โน้ต) -- I/O only; logic in lib/line-info*.ts.
import { listRows } from "@/lib/store";
import type { QuickInfo, QuickNote } from "@/lib/models/types";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { noteTitle } from "@/lib/line-info";
import { buildQuickInfoReply, buildQuickInfoDetail, buildBigText, buildNotesReply, buildNoteDetail, buildNoteFullText } from "@/lib/line-info-messages";
import { NO_TRIP_TEXT, GONE_TEXT, albumMessage, appUrl, norm } from "@/lib/line-view-kit";

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "info" && route.kind !== "notes") return;
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const query = norm(route.rest);
  if (route.kind === "info") {
    const rows = await listRows<QuickInfo>("quickinfo", trip.id);
    return ctx.reply(buildQuickInfoReply({ trip, origin: ctx.origin, rows, query, page: 1, autoDetail: true }));
  }
  const rows = await listRows<QuickNote>("quicknotes", trip.id);
  return ctx.reply(buildNotesReply({ trip, origin: ctx.origin, rows, query, page: 1, autoDetail: true }));
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const page = Number(data.n) || 1;
  const query = data.q ?? "";
  const action = data.a ?? "";

  if (action.startsWith("qi_")) {
    const rows = await listRows<QuickInfo>("quickinfo", trip.id);
    if (data.a === "qi_list") return ctx.reply(buildQuickInfoReply({ trip, origin: ctx.origin, rows, query, page, autoDetail: false }));
    const row = rows.find((r) => r.id === data.id);
    if (!row) return ctx.reply([textMessage(GONE_TEXT)]);
    if (data.a === "qi_detail") return ctx.reply(buildQuickInfoDetail({ origin: ctx.origin, row }));
    if (data.a === "qi_big") return ctx.reply([row.value ? buildBigText(row.value) : textMessage("ไม่มีข้อความ")]);
    if (data.a === "qi_photos") {
      if (!row.photo_ids.length) return ctx.reply([textMessage("รายการนี้ไม่มีรูป")]);
      return ctx.reply([albumMessage({ origin: ctx.origin, photoIds: row.photo_ids, title: row.label, moreUrl: appUrl(ctx.origin, trip.id, "info?tab=quickinfo") })]);
    }
    return;
  }

  if (action.startsWith("qn_")) {
    const rows = await listRows<QuickNote>("quicknotes", trip.id);
    if (data.a === "qn_list") return ctx.reply(buildNotesReply({ trip, origin: ctx.origin, rows, query, page, autoDetail: false }));
    const note = rows.find((n) => n.id === data.id);
    if (!note) return ctx.reply([textMessage(GONE_TEXT)]);
    const notesUrl = appUrl(ctx.origin, trip.id, "info?tab=quicknotes");
    if (data.a === "qn_detail") return ctx.reply([buildNoteDetail({ origin: ctx.origin, note, query })]);
    if (data.a === "qn_full") return ctx.reply(buildNoteFullText(note, notesUrl));
    if (data.a === "qn_photos") {
      if (!note.photo_ids.length) return ctx.reply([textMessage("โน้ตนี้ไม่มีรูป")]);
      return ctx.reply([albumMessage({ origin: ctx.origin, photoIds: note.photo_ids, title: noteTitle(note), moreUrl: notesUrl })]);
    }
  }
}
```

- [ ] **Step 3b: Remove the info stub from the foundation's stub test**

`lib/line-handlers/stubs.test.ts` (foundation) asserts that every stub replies "ฟีเจอร์นี้กำลังพัฒนา". Once `info.ts` is real, that suite fails. Delete exactly these two lines from it. Other feature plans delete their own lines, so if yours are already gone, leave the file as it is:

```ts
import * as info from "./info";
```
```ts
  ["info", info],
```

If this leaves `describe.each([])` with no rows (every feature plan has landed), delete the file instead: `git rm lib/line-handlers/stubs.test.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/line-handlers/info.test.ts lib/line-info.test.ts lib/line-info-messages.test.ts lib/line-handlers/stubs.test.ts`
Expected: PASS

Then run: `npx tsc --noEmit`
Expected: exit code 0, no output. tsc must pass before EVERY task commit, not just at the end.

- [ ] **Step 5: Commit**

```bash
git add -A lib/line-handlers/info.ts lib/line-handlers/info.test.ts lib/line-handlers/stubs.test.ts
git commit -m "$(cat <<'EOF'
feat(line): quick info and notes view handler

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Full verification

**Files:**
- No new files. Fix in place only if a check fails.

**Interfaces:**
- Consumes: everything above plus the foundation's dispatch (unchanged)
- Produces: a green test suite, typecheck and lint

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS. All suites green, including the foundation's `line-router` / `line-dispatch` tests. Those tests must still pass because this plan did not touch them.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit code 0, no output. Common failure: a foundation signature differs slightly from the shared spec, for example `quickReply` item typing. Fix the call site in THIS plan's files to match the real foundation export. Do not edit the foundation.

- [ ] **Step 3: Lint**

Run: `npx eslint lib/line-view-kit.ts lib/line-view.test-helpers.ts lib/line-booking.ts lib/line-booking-messages.ts lib/line-places.ts lib/line-places-messages.ts lib/line-info.ts lib/line-info-messages.ts lib/line-handlers/booking.ts lib/line-handlers/places.ts lib/line-handlers/info.ts`
Expected: no errors

- [ ] **Step 4: Commit fixes (only if steps 1–3 required changes)**

```bash
git add -u lib/
git commit -m "$(cat <<'EOF'
fix(line): align view features with foundation signatures

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Manual LINE smoke test (after the project's normal deploy, which is push → Vercel; no local preview)**

In the LINE group, send each of the following and confirm the reply:
- `จอง` → list, past at the bottom
- `ตั๋วเครื่อง` → flight detail with ref box + 📋 copy
- `เอกสารการจองโรงแรม` → hotel
- `ตั๋วรถ 50` → the ambiguity prompt (from dispatch, not this plan)
- `จอง 21/11` → that day's bookings
- `ร้าน` → carousel with header; tap a photo → full image; ✓ ไปแล้ว → card flips
- `ที่เที่ยว ดาว` → starred wishlist
- `ข้อมูล` → list, pinned first
- `ข้อมูล wifi 5G` → detail + plain text; 🔍 โชว์ตัวใหญ่ → giga card
- `โน้ต` → list → tap → 12-line card → 📄 อ่านเต็ม

---

## Self-Review Notes

- **Spec coverage:** booking keywords/type words/date/query (T2). List: grouping, past last, today highlight, thumbnail, 15 + ดูต่อ, 4 type buttons (T3). Detail: hero, ref box, copy, when/countdown, amount + payer, notes + อ่านต่อ, photos, ดูในแพลน, กลับรายการ (T3). Album (T1/T4). Places: 2 kinds, filters, sort, header card, paging ≤ 12, bubble badges, Maps, toggle with re-check, photos (T5–T7). Quick info: classify, buttons, list with 2-line values, detail + plain text, big text, sort pinned → sort_order (T8–T10). Notes: list, 12-line detail, อ่านเต็ม split ≤ 5, title fallback (T8–T10). Empty / not-found / single / list resolution for all three (T3/T6/T9).
- **Shared-spec overrides applied:** `extractDate` instead of `parsePlanQuery`; no ambiguity prompt in these handlers (dispatch owns `amb_*`); quick info not sorted by `quickinfo-order.ts`; `bk_`/`pl_`/`qi_`/`qn_` prefixes.
- **Deliberate deviations (documented):** countdown adds "อีก N นาที" for under an hour and "กำลังพัก" for an in-progress hotel stay. The ref box is not monospace (Flex has no font family). `countdown` takes `today`/`nowHHMM` strings instead of `(now, tz)`, which keeps it pure. A "📝 อ่านโน้ตต่อ" button (`bk_note`) replaces inline "อ่านต่อ". Booking type words match only as exact tokens (after peeling leading การ/ของ/จอง/ตั๋ว/เอกสาร), so `จอง การบินไทย` and `จอง รถไฟ` are searches. In-progress stays are grouped under today. A place that is both starred and visited shows both badges. Long text splits at 4,800 chars via the kit's `longTextMessages`, which `bk_note` and `qn_full` share. Search matches per token: every whitespace-separated word must appear in some field, so `ข้อมูล wifi 5G` still finds label "wifi" + value "HK-5G". A list postback never auto-opens the detail, which prevents a "กลับรายการ" loop.
