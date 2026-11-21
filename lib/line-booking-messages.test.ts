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
