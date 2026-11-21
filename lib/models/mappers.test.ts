import { describe, it, expect } from "vitest";
import { ENTITIES } from "./mappers";
import type { Expense, Transport, LineSession } from "./types";

const expense: Expense = {
  id: "e1", trip_id: "t1", datetime: "2026-07-12T09:30:00.000Z",
  category: "อาหาร", description: "ราเมง", amount: 3200, currency: "JPY",
  fx_rate: 0.23, amount_thb: 736, payer: "เรา", slip_photo_ids: ["f1", "f2"],
  splits: [{ name: "แฟน", amount_thb: 368, paid: false, paid_slip_photo_ids: [] }],
  pending: false,
};

const transport: Transport = {
  id: "tr1", trip_id: "t1", day_date: "2026-07-12", from: "NRT", to: "โรงแรม",
  mode: "รถไฟ", pickup_point: "ชานชาลา 2", pickup_photo_ids: [],
  departure_times: ["09:15", "10:40"], depart_time: "09:15", arrive_time: "10:07", duration_min: 52,
  alt_option: "บัส airport limousine ¥3600", price_amount: 3200, price_currency: "JPY",
  fx_rate: 0.23, price_thb: 736, payer: "แฟน", pay_timing: "prepaid",
  paid: true, slip_photo_ids: ["f9"], notes: "",
};

describe("mappers", () => {
  it("expense roundtrips through row", () => {
    const { toRow, fromRow } = ENTITIES.expenses;
    expect(fromRow(toRow(expense))).toEqual(expense);
  });
  it("transport roundtrips (arrays, bool, numbers)", () => {
    const { toRow, fromRow } = ENTITIES.transports;
    expect(fromRow(toRow(transport))).toEqual(transport);
  });
  it("fromRow tolerates short row (missing trailing cells)", () => {
    const { fromRow } = ENTITIES.expenses;
    const e = fromRow(["e2", "t1", "2026-07-12T00:00:00.000Z", "อื่นๆ", "", "100", "THB", "1", "100", "เรา"]);
    expect(e.slip_photo_ids).toEqual([]);
    expect(e.amount_thb).toBe(100);
    expect(e.splits).toEqual([]);
  });
  it("columns match toRow length for every entity", () => {
    for (const [name, def] of Object.entries(ENTITIES)) {
      expect(def.columns.length, name).toBeGreaterThan(0);
    }
  });
});

describe("line_sessions mapper", () => {
  it("roundtrips the data JSON column", () => {
    const s: LineSession = {
      id: "group:g1:user:u1#ctx", trip_id: "t1", expense_id: "", step: "ctx",
      updated_at: "2026-11-20T03:00:00.000Z", data: { lastPlanDate: "2026-11-20" },
    };
    const { toRow, fromRow } = ENTITIES.line_sessions;
    expect(toRow(s)[5]).toBe('{"lastPlanDate":"2026-11-20"}');
    expect(fromRow(toRow(s))).toEqual(s);
  });

  it("an old row without the data column reads data as [] (normalized later by line-session)", () => {
    const s = ENTITIES.line_sessions.fromRow(["user:u1", "t1", "e1", "awaiting_name", "2026-11-20T03:00:00.000Z"]);
    expect(s.step).toBe("awaiting_name");
    expect(s.data).toEqual([]);
  });
});
