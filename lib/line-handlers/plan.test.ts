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
