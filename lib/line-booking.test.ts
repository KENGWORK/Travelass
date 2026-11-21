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
