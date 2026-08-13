import { describe, it, expect } from "vitest";
import { netBalances, simplifyDebts, pairSettlements, expensesBetween, applyPayment, splitsSharingSlip, reconcileSplitsOnEdit } from "./settle";
import type { Expense, ExpenseSplit } from "./models/types";

const split = (over: Partial<ExpenseSplit>): ExpenseSplit => ({
  name: "โอ", amount_thb: 0, paid: false, paid_slip_photo_ids: [], ...over,
});

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
      e({ amount_thb: 500, payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 250 })] }),
    ]);
    expect(balances).toEqual({ "เก่ง": 250, "โอ": -250 });
  });

  it("itemized/uneven split: miniso scenario", () => {
    // เก่งจ่าย 5 CNY (THB equivalent used here for simplicity), โอเป็นเจ้าของ 3, เก่งเอง 2
    const balances = netBalances([
      e({ amount_thb: 5, payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 3 })] }),
    ]);
    expect(balances).toEqual({ "เก่ง": 3, "โอ": -3 });
  });

  it("accumulates across multiple expenses and payers", () => {
    const balances = netBalances([
      e({ amount_thb: 500, payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 250 })] }),
      e({ amount_thb: 300, payer: "โอ", splits: [split({ name: "เก่ง", amount_thb: 150 })] }),
    ]);
    expect(balances).toEqual({ "เก่ง": 100, "โอ": -100 });
  });

  it("a split entry naming the payer themself is a no-op", () => {
    const balances = netBalances([
      e({ amount_thb: 500, payer: "เก่ง", splits: [split({ name: "เก่ง", amount_thb: 500 })] }),
    ]);
    expect(balances).toEqual({});
  });

  it("skips paid splits entirely", () => {
    const balances = netBalances([
      e({
        amount_thb: 500, payer: "เก่ง",
        splits: [split({ name: "โอ", amount_thb: 250, paid: true, paid_slip_photo_ids: ["p1"] })],
      }),
    ]);
    expect(balances).toEqual({});
  });

  it("partial payment: only the unpaid split still counts", () => {
    const balances = netBalances([
      e({
        id: "e1", amount_thb: 245.39, payer: "เก่ง",
        splits: [split({ name: "โอ", amount_thb: 245.39, paid: true, paid_slip_photo_ids: ["p1"] })],
      }),
      e({
        id: "e2", amount_thb: 188.95, payer: "เก่ง",
        splits: [split({ name: "โอ", amount_thb: 188.95 })],
      }),
    ]);
    expect(balances).toEqual({ "เก่ง": 188.95, "โอ": -188.95 });
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

describe("pairSettlements", () => {
  it("matches a simple 2-person debt", () => {
    const settlements = pairSettlements([
      e({ id: "e1", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 250 })] }),
    ]);
    expect(settlements).toEqual([{ from: "โอ", to: "เก่ง", amount: 250 }]);
  });

  it("nets both directions between the same pair", () => {
    // เก่ง paid, โอ owes เก่ง back 168.77; โอ paid, เก่ง owes โอ back 88.61 ->
    // net โอ owes เก่ง 80.16.
    const settlements = pairSettlements([
      e({ id: "e1", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 168.77 })] }),
      e({ id: "e2", payer: "โอ", splits: [split({ name: "เก่ง", amount_thb: 88.61 })] }),
    ]);
    expect(settlements).toEqual([{ from: "โอ", to: "เก่ง", amount: 80.16 }]);
  });

  it("drops a pair that nets to zero", () => {
    const settlements = pairSettlements([
      e({ id: "e1", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 100 })] }),
      e({ id: "e2", payer: "โอ", splits: [split({ name: "เก่ง", amount_thb: 100 })] }),
    ]);
    expect(settlements).toEqual([]);
  });

  it("skips paid splits", () => {
    const settlements = pairSettlements([
      e({ id: "e1", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 100, paid: true, paid_slip_photo_ids: ["p1"] })] }),
    ]);
    expect(settlements).toEqual([]);
  });

  // The whole reason pairSettlements exists instead of simplifyDebts for
  // real payments: with a third person involved, simplifyDebts synthesizes
  // an edge (A owes C) between two people who never directly transacted --
  // เก่ง owes โอ 100 (direct), โอ owes มิว 50 (direct), no เก่ง<->มิว expense
  // at all. simplifyDebts nets this to "เก่ง owes โอ 50, เก่ง owes มิว 50",
  // which doesn't match what expensesBetween(เก่ง, โอ) actually contains
  // (a single ฿100 line) -- exactly the QR-shows-wrong-amount bug this
  // replaces. pairSettlements keeps each pair's own real total instead.
  it("never diverges from a pair's own raw total, unlike simplifyDebts, with a third person present", () => {
    const expenses = [
      e({ id: "e1", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 100 })] }),
      e({ id: "e2", payer: "โอ", splits: [split({ name: "มิว", amount_thb: 50 })] }),
    ];
    const settlements = pairSettlements(expenses);
    expect(settlements).toEqual(
      expect.arrayContaining([
        { from: "โอ", to: "เก่ง", amount: 100 },
        { from: "มิว", to: "โอ", amount: 50 },
      ]),
    );
    for (const s of settlements) {
      const rawTotal = expensesBetween(expenses, s.from, s.to).reduce((sum, l) => sum + (l.paid ? 0 : l.amount_thb), 0);
      expect(s.amount).toBe(rawTotal);
    }
  });

  it("doesn't merge two different pairs whose names happen to share a space", () => {
    // ("John Smith", "Bob") and ("John", "Smith Bob") both join to the same
    // "Bob John Smith" string on a plain space-separated key -- these must
    // stay two separate settlements, not get merged into one.
    const expenses = [
      e({ id: "e1", payer: "John Smith", splits: [split({ name: "Bob", amount_thb: 100 })] }),
      e({ id: "e2", payer: "Smith Bob", splits: [split({ name: "John", amount_thb: 40 })] }),
    ];
    const settlements = pairSettlements(expenses);
    expect(settlements).toEqual(
      expect.arrayContaining([
        { from: "Bob", to: "John Smith", amount: 100 },
        { from: "John", to: "Smith Bob", amount: 40 },
      ]),
    );
    expect(settlements).toHaveLength(2);
  });
});

describe("expensesBetween", () => {
  it("finds lines in both directions between a pair, sorted by date", () => {
    const lines = expensesBetween(
      [
        e({ id: "e1", description: "ตุ๊กตา", datetime: "2026-07-13T09:00:00.000Z", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 100 })] }),
        e({ id: "e2", description: "ค่าแท็กซี่", datetime: "2026-07-12T09:00:00.000Z", payer: "โอ", splits: [split({ name: "เก่ง", amount_thb: 50 })] }),
        e({ id: "e3", description: "ไม่เกี่ยว", payer: "มิว", splits: [split({ name: "เก่ง", amount_thb: 30 })] }),
      ],
      "เก่ง", "โอ",
    );
    expect(lines).toEqual([
      { id: "e2", description: "ค่าแท็กซี่", category: "อาหาร", datetime: "2026-07-12T09:00:00.000Z", amount_thb: 50, from: "เก่ง", to: "โอ", key: "e2:0", paid: false, paid_slip_photo_ids: [] },
      { id: "e1", description: "ตุ๊กตา", category: "อาหาร", datetime: "2026-07-13T09:00:00.000Z", amount_thb: 100, from: "โอ", to: "เก่ง", key: "e1:0", paid: false, paid_slip_photo_ids: [] },
    ]);
  });

  it("ignores expenses involving a third person", () => {
    expect(expensesBetween([e({ payer: "มิว", splits: [split({ name: "เก่ง", amount_thb: 30 })] })], "เก่ง", "โอ")).toEqual([]);
  });

  it("includes already-paid lines too, not just outstanding ones", () => {
    const lines = expensesBetween(
      [e({ id: "e1", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 100, paid: true, paid_slip_photo_ids: ["p1"] })] })],
      "เก่ง", "โอ",
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ paid: true, paid_slip_photo_ids: ["p1"], key: "e1:0" });
  });
});

describe("applyPayment", () => {
  it("marks the addressed splits paid with the shared photo ids, returns only changed expenses", () => {
    const expenses = [
      e({ id: "e1", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 245.39 })] }),
      e({ id: "e2", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 188.95 })] }),
      e({ id: "e3", payer: "โอ", splits: [split({ name: "เก่ง", amount_thb: 30 })] }),
    ];
    const changed = applyPayment(expenses, ["e1:0", "e2:0"], ["slip1"]);
    expect(changed).toHaveLength(2);
    expect(changed.find((c) => c.id === "e1")?.splits[0]).toEqual({ name: "โอ", amount_thb: 245.39, paid: true, paid_slip_photo_ids: ["slip1"] });
    expect(changed.find((c) => c.id === "e2")?.splits[0]).toEqual({ name: "โอ", amount_thb: 188.95, paid: true, paid_slip_photo_ids: ["slip1"] });
  });

  it("leaves splits not addressed by a key untouched", () => {
    const expenses = [e({ id: "e1", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 100 }), split({ name: "มิว", amount_thb: 50 })] })];
    const changed = applyPayment(expenses, ["e1:0"], ["slip1"]);
    expect(changed[0].splits[0].paid).toBe(true);
    expect(changed[0].splits[1].paid).toBe(false);
  });
});

describe("splitsSharingSlip", () => {
  it("finds every paid split sharing a photo id, including the queried one", () => {
    const expenses = [
      e({ id: "e1", description: "อาหาร A", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 245.39, paid: true, paid_slip_photo_ids: ["slip1"] })] }),
      e({ id: "e2", description: "อาหาร B", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 188.95, paid: true, paid_slip_photo_ids: ["slip1"] })] }),
      e({ id: "e3", description: "ไม่เกี่ยว", payer: "เก่ง", splits: [split({ name: "โอ", amount_thb: 10, paid: true, paid_slip_photo_ids: ["slip2"] })] }),
    ];
    const shared = splitsSharingSlip(expenses, ["slip1"]);
    expect(shared.map((s) => s.key).sort()).toEqual(["e1:0", "e2:0"]);
  });

  it("returns nothing for an empty photo id list", () => {
    expect(splitsSharingSlip([e({ splits: [split({ paid: true, paid_slip_photo_ids: ["slip1"] })] })], [])).toEqual([]);
  });
});

describe("reconcileSplitsOnEdit", () => {
  it("no-ops when there are no splits", () => {
    expect(reconcileSplitsOnEdit([], 100, 200, false)).toEqual({ splits: [], blocked: false });
  });

  it("blocks the edit if any split is already paid", () => {
    const splits = [split({ name: "โอ", amount_thb: 50, paid: true, paid_slip_photo_ids: ["p1"] })];
    const result = reconcileSplitsOnEdit(splits, 100, 200, false);
    expect(result.blocked).toBe(true);
    expect(result.splits).toBe(splits);
  });

  it("clears splits when the payer changes", () => {
    const splits = [split({ name: "โอ", amount_thb: 50 })];
    expect(reconcileSplitsOnEdit(splits, 100, 100, true)).toEqual({ splits: [], blocked: false });
  });

  it("rescales unpaid splits proportionally when only the amount changes", () => {
    const splits = [split({ name: "โอ", amount_thb: 50 }), split({ name: "มิว", amount_thb: 25 })];
    const result = reconcileSplitsOnEdit(splits, 100, 200, false);
    expect(result.blocked).toBe(false);
    expect(result.splits.map((s) => s.amount_thb)).toEqual([100, 50]);
  });

  it("leaves splits untouched when the amount doesn't change", () => {
    const splits = [split({ name: "โอ", amount_thb: 50 })];
    expect(reconcileSplitsOnEdit(splits, 100, 100, false)).toEqual({ splits, blocked: false });
  });
});
