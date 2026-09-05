import { describe, it, expect } from "vitest";
import { summarize } from "./summary";
import type { Expense, Booking, Transport } from "./models/types";

const e = (over: Partial<Expense>): Expense => ({ id: "e", trip_id: "t", datetime: "2026-07-12T09:00:00.000Z", category: "อาหาร", description: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0, payer: "เรา", slip_photo_ids: [], splits: [], pending: false, ...over });
const b = (over: Partial<Booking>): Booking => ({ id: "b", trip_id: "t", type: "hotel", vendor: "", ref_no: "", date_from: "", date_to: "", time_from: "", detail: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0, payer: "เรา", pay_timing: "prepaid", paid: true, slip_photo_ids: [], notes: "", ...over });
const tr = (over: Partial<Transport>): Transport => ({ id: "tr", trip_id: "t", day_date: "", from: "", to: "", mode: "", pickup_point: "", pickup_photo_ids: [], departure_times: [], depart_time: "", arrive_time: "", duration_min: 0, alt_option: "", price_amount: 0, price_currency: "THB", fx_rate: 1, price_thb: 0, payer: "เรา", pay_timing: "prepaid", paid: true, slip_photo_ids: [], notes: "", ...over });

describe("summarize", () => {
  it("sums totals and splits prepaid vs onsite", () => {
    const s = summarize(
      [e({ amount_thb: 100 }), e({ amount_thb: 50, payer: "แฟน", datetime: "2026-07-13T10:00:00.000Z" })],
      [b({ amount_thb: 5000 }), b({ amount_thb: 999, paid: false })],
      [tr({ price_thb: 736, pay_timing: "pay_after" })],
    );
    expect(s.totalTHB).toBe(100 + 50 + 5000 + 736);
    expect(s.prepaidTHB).toBe(5000);
    expect(s.onsiteTHB).toBe(100 + 50 + 736);
    expect(s.byPayer).toEqual({ "เรา": 100 + 5000 + 736, "แฟน": 50 });
    expect(s.byDay).toEqual({ "2026-07-12": 100, "2026-07-13": 50 });
    // paid hotel booking -> ที่พัก, paid transport -> เดินทาง, alongside food expenses
    expect(s.byCategory).toEqual({ "อาหาร": 150, "ที่พัก": 5000, "เดินทาง": 736 });
  });
  it("maps paid bookings/transports into byCategory and byDay by their own date", () => {
    const s = summarize(
      [e({ amount_thb: 200, category: "อาหาร", datetime: "2026-07-12T09:00:00.000Z" })],
      [b({ type: "flight", amount_thb: 8000, date_from: "2026-07-12", paid: true })],
      [tr({ price_thb: 500, day_date: "2026-07-13", paid: true })],
    );
    expect(s.byCategory).toEqual({ "อาหาร": 200, "เดินทาง": 8000 + 500 });
    expect(s.byDay).toEqual({ "2026-07-12": 200 + 8000, "2026-07-13": 500 });
  });
  it("excludes unpaid bookings/transports from every tally", () => {
    const s = summarize(
      [],
      [b({ type: "hotel", amount_thb: 9000, date_from: "2026-07-12", paid: false })],
      [tr({ price_thb: 400, day_date: "2026-07-12", paid: false })],
    );
    expect(s.totalTHB).toBe(0);
    expect(s.byCategory).toEqual({});
    expect(s.byDay).toEqual({});
  });
  it("empty inputs give zeros", () => {
    const s = summarize([], [], []);
    expect(s.totalTHB).toBe(0);
    expect(s.byCategory).toEqual({});
  });
});
