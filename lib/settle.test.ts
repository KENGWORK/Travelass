import { describe, it, expect } from "vitest";
import { netBalances, simplifyDebts, expensesBetween } from "./settle";
import type { Expense } from "./models/types";

const e = (over: Partial<Expense>): Expense => ({
  id: "e", trip_id: "t", datetime: "2026-07-12T09:00:00.000Z", category: "อาหาร",
  description: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0,
  payer: "เก่ง", slip_photo_ids: [], splits: [], ...over,
});

describe("netBalances", () => {
  it("ignores expenses with no splits", () => {
    expect(netBalances([e({ amount_thb: 500 })])).toEqual({});
  });

  it("even split: payer is owed, the other person owes", () => {
    const balances = netBalances([
      e({ amount_thb: 500, payer: "เก่ง", splits: [{ name: "โอ", amount_thb: 250 }] }),
    ]);
    expect(balances).toEqual({ "เก่ง": 250, "โอ": -250 });
  });

  it("itemized/uneven split: miniso scenario", () => {
    // เก่งจ่าย 5 CNY (THB equivalent used here for simplicity), โอเป็นเจ้าของ 3, เก่งเอง 2
    const balances = netBalances([
      e({ amount_thb: 5, payer: "เก่ง", splits: [{ name: "โอ", amount_thb: 3 }] }),
    ]);
    expect(balances).toEqual({ "เก่ง": 3, "โอ": -3 });
  });

  it("accumulates across multiple expenses and payers", () => {
    const balances = netBalances([
      e({ amount_thb: 500, payer: "เก่ง", splits: [{ name: "โอ", amount_thb: 250 }] }),
      e({ amount_thb: 300, payer: "โอ", splits: [{ name: "เก่ง", amount_thb: 150 }] }),
    ]);
    expect(balances).toEqual({ "เก่ง": 100, "โอ": -100 });
  });

  it("a split entry naming the payer themself is a no-op", () => {
    const balances = netBalances([
      e({ amount_thb: 500, payer: "เก่ง", splits: [{ name: "เก่ง", amount_thb: 500 }] }),
    ]);
    expect(balances).toEqual({});
  });
});

describe("simplifyDebts", () => {
  it("returns nothing when balanced", () => {
    expect(simplifyDebts({ "เก่ง": 0, "โอ": 0 })).toEqual([]);
  });

  it("settles a simple 2-person debt", () => {
    expect(simplifyDebts({ "เก่ง": 250, "โอ": -250 })).toEqual([{ from: "โอ", to: "เก่ง", amount: 250 }]);
  });

  it("minimizes transactions for 3 people (debtor pays the biggest creditor first)", () => {
    // เก่ง +300, โอ +100, มิว -400 -> มิว should pay เก่ง 300 and โอ 100, not more transactions
    const settlements = simplifyDebts({ "เก่ง": 300, "โอ": 100, "มิว": -400 });
    expect(settlements).toEqual([
      { from: "มิว", to: "เก่ง", amount: 300 },
      { from: "มิว", to: "โอ", amount: 100 },
    ]);
  });

  it("handles multiple creditors and debtors", () => {
    // เก่ง +200, โอ +200, มิว -150, ปุ๊ก -250
    const settlements = simplifyDebts({ "เก่ง": 200, "โอ": 200, "มิว": -150, "ปุ๊ก": -250 });
    const total = settlements.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(400);
    for (const s of settlements) expect(["มิว", "ปุ๊ก"]).toContain(s.from);
  });
});

describe("expensesBetween", () => {
  it("finds lines in both directions between a pair, sorted by date", () => {
    const lines = expensesBetween(
      [
        e({ id: "e1", description: "ตุ๊กตา", datetime: "2026-07-13T09:00:00.000Z", payer: "เก่ง", splits: [{ name: "โอ", amount_thb: 100 }] }),
        e({ id: "e2", description: "ค่าแท็กซี่", datetime: "2026-07-12T09:00:00.000Z", payer: "โอ", splits: [{ name: "เก่ง", amount_thb: 50 }] }),
        e({ id: "e3", description: "ไม่เกี่ยว", payer: "มิว", splits: [{ name: "เก่ง", amount_thb: 30 }] }),
      ],
      "เก่ง", "โอ",
    );
    expect(lines).toEqual([
      { id: "e2", description: "ค่าแท็กซี่", category: "อาหาร", datetime: "2026-07-12T09:00:00.000Z", amount_thb: 50, from: "เก่ง", to: "โอ" },
      { id: "e1", description: "ตุ๊กตา", category: "อาหาร", datetime: "2026-07-13T09:00:00.000Z", amount_thb: 100, from: "โอ", to: "เก่ง" },
    ]);
  });

  it("ignores expenses involving a third person", () => {
    expect(expensesBetween([e({ payer: "มิว", splits: [{ name: "เก่ง", amount_thb: 30 }] })], "เก่ง", "โอ")).toEqual([]);
  });
});
