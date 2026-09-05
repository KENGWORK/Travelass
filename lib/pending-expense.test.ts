import { describe, it, expect } from "vitest";
import { buildPendingExpense, selectPendingExpenses } from "./pending-expense";
import type { Expense } from "./models/types";

describe("buildPendingExpense", () => {
  it("creates a draft expense holding just the slip photo, marked pending", () => {
    const exp = buildPendingExpense({ id: "e1", tripId: "t1", photoId: "p1", currency: "HKD", now: "2026-09-05T10:00:00.000Z" });
    expect(exp).toEqual({
      id: "e1", trip_id: "t1", datetime: "2026-09-05T10:00:00.000Z",
      category: "อื่นๆ", description: "", amount: 0, currency: "HKD",
      fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: ["p1"], splits: [], pending: true,
    });
  });
});

describe("selectPendingExpenses", () => {
  const e = (over: Partial<Expense>): Expense => ({
    id: "e", trip_id: "t", datetime: "2026-09-01T00:00:00.000Z", category: "อื่นๆ",
    description: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0,
    payer: "", slip_photo_ids: [], splits: [], pending: false, ...over,
  });

  it("keeps only pending expenses", () => {
    const result = selectPendingExpenses([e({ id: "a", pending: true }), e({ id: "b", pending: false })]);
    expect(result.map((x) => x.id)).toEqual(["a"]);
  });

  it("sorts newest-captured first", () => {
    const result = selectPendingExpenses([
      e({ id: "old", pending: true, datetime: "2026-09-01T00:00:00.000Z" }),
      e({ id: "new", pending: true, datetime: "2026-09-03T00:00:00.000Z" }),
    ]);
    expect(result.map((x) => x.id)).toEqual(["new", "old"]);
  });
});
