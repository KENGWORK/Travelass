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
