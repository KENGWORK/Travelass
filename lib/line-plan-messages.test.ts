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
