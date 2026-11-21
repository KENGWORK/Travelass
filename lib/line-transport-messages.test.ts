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
