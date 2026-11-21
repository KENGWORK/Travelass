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
