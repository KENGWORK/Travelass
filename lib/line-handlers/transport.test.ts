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
