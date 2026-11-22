// lib/line-expense-flow.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import { parseExpenseText } from "./line-expense-parse";
import {
  attachPhoto,
  buildSplits,
  ceil2,
  enterConflict,
  finalize,
  fmtNum,
  initialState,
  isFlowStep,
  missingFields,
  needsRate,
  normalizeStep,
  settle,
  partnerFor,
  stateFromExpense,
  validateOwed,
  withRate,
  type FlowData,
  type FlowState,
} from "./line-expense-flow";

const M = ["เก่ง", "โอ"];
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อื่นๆ", description: "",
  amount: 0, currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: [], splits: [], pending: true,
  ...over,
});
const split = (name: string, amount_thb: number) => ({ name, amount_thb, paid: false, paid_slip_photo_ids: [] });

describe("rounding and formatting", () => {
  it("ceil2 rounds up to the satang without float noise", () => {
    expect(ceil2(270.005)).toBe(270.01);
    expect(ceil2(270)).toBe(270);
    expect(ceil2(100 / 3)).toBe(33.34);
  });

  it("fmtNum groups thousands and keeps up to 2 decimals", () => {
    expect(fmtNum(1200)).toBe("1,200");
    expect(fmtNum(12.5)).toBe("12.5");
  });

  it("isFlowStep recognises only flow steps", () => {
    expect(isFlowStep("owed")).toBe(true);
    expect(isFlowStep("missing")).toBe(true);
    expect(isFlowStep("summary")).toBe(false);
    expect(isFlowStep("awaiting_name")).toBe(false);
  });

  it("normalizeStep maps rows left by the old flow onto the new steps", () => {
    expect(normalizeStep("summary", true)).toBe("missing");
    expect(normalizeStep("payer", true)).toBe("missing");
    expect(normalizeStep("conflict", true)).toBe("conflict");
    expect(normalizeStep("confirm_cancel", false)).toBe("confirm_cancel");
    expect(normalizeStep("summary", false)).toBe("edit");
    expect(normalizeStep("category", false)).toBe("category");
    expect(normalizeStep("awaiting_name", false)).toBe("edit");
  });
});

describe("buildSplits", () => {
  it("stores nothing for ไม่หาร", () => {
    expect(buildSplits("none", 540, 0, "โอ")).toEqual([]);
  });

  it("rounds the other person's half up for หารเท่า", () => {
    expect(buildSplits("equal", 540.01, 0, "โอ")).toEqual([split("โอ", 270.01)]);
  });

  it("stores the owed THB for หารไม่เท่า, including owing the whole amount", () => {
    expect(buildSplits("unequal", 500, 20, "โอ")).toEqual([split("โอ", 20)]);
    expect(buildSplits("unequal", 500, 500, "โอ")).toEqual([split("โอ", 500)]);
  });
});

describe("validateOwed", () => {
  it("flags zero and over-total, accepts up to the total", () => {
    expect(validateOwed(0, 500)).toBe("zero");
    expect(validateOwed(501, 500)).toBe("over");
    expect(validateOwed(500, 500)).toBe("ok");
    expect(validateOwed(20, 500)).toBe("ok");
  });
});

describe("partnerFor", () => {
  it("is the only other member in a 2-person trip", () => {
    expect(partnerFor("เก่ง", {}, M)).toBe("โอ");
  });

  it("needs an explicit pick when there are more members, and ignores a pick equal to the payer", () => {
    const three = ["เก่ง", "โอ", "ต้น"];
    expect(partnerFor("เก่ง", {}, three)).toBeUndefined();
    expect(partnerFor("เก่ง", { partner: "ต้น" }, three)).toBe("ต้น");
    expect(partnerFor("เก่ง", { partner: "เก่ง" }, three)).toBeUndefined();
  });
});

describe("initialState", () => {
  const base = { id: "e1", tripId: "t1", now: "2026-11-21T03:00:00.000Z", tripCurrency: "HKD" };

  it("starts at the missing card with rev 1 and remembers what the text said", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("120 HKD ข้าว หาร"), payer: "เก่ง" });
    expect(st.step).toBe("missing");
    expect(st.expense).toEqual(exp({ payer: "เก่ง", amount: 120, currency: "HKD", category: "อาหาร", description: "ข้าว" }));
    expect(st.data).toEqual({ rev: 1, currencyConfirmed: true, splitMode: "equal" });
    expect(missingFields(st.expense, st.data, M)).toEqual([]);
  });

  it("a photo-only draft with an unmatched name misses amount, currency, payer and split", () => {
    const st = initialState({ ...base, parsed: parseExpenseText(""), payer: "", photoId: "p1", asker: "Kengz" });
    expect(st.expense.slip_photo_ids).toEqual(["p1"]);
    expect(st.data).toEqual({ rev: 1, asker: "Kengz" });
    expect(missingFields(st.expense, st.data, M)).toEqual(["amount", "currency", "payer", "split"]);
  });

  it("keeps amount candidates for the picker", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("50 ข้าว 30 น้ำ"), payer: "เก่ง" });
    expect(st.expense.amount).toBe(0);
    expect(st.data.amountCandidates).toEqual([50, 30]);
  });

  it("turns a typed ฝาก 0 into the zero-owed state", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("500 บาท ฝาก 0"), payer: "เก่ง" });
    expect(st.data.owedZero).toBe(true);
    expect(st.data.owedAmount).toBeUndefined();
    expect(missingFields(st.expense, st.data, M)).toEqual(["owed"]);
  });
});

describe("settle", () => {
  it("saves a complete draft (pending off) and asks again otherwise", () => {
    const done: FlowState = { expense: exp({ payer: "เก่ง", amount: 120 }), step: "missing", data: { rev: 1, currencyConfirmed: true, splitMode: "none" } };
    expect(settle(done, M)).toEqual({ k: "saved", state: { ...done, expense: { ...done.expense, pending: false } } });
    const open = settle({ ...done, data: { rev: 1 } }, M);
    expect(open).toMatchObject({ k: "ask", state: { step: "missing" } });
  });

  it("for a saved expense, asks the first missing field's step", () => {
    const st: FlowState = { expense: exp({ payer: "เก่ง", amount: 120, pending: false }), step: "split", data: { rev: 1, currencyConfirmed: true, splitMode: "unequal" } };
    expect(settle(st, M)).toMatchObject({ k: "ask", state: { step: "owed" } });
  });

  it("a notice keeps an edit step open instead of saving", () => {
    const st: FlowState = { expense: exp({ payer: "เก่ง", amount: 120, pending: false }), step: "amount", data: { rev: 1, currencyConfirmed: true, splitMode: "none" } };
    expect(settle(st, M, "ยอดต้องมากกว่า 0 นะ")).toMatchObject({ k: "ask", state: { step: "amount" }, notice: "ยอดต้องมากกว่า 0 นะ" });
  });
});

describe("stateFromExpense", () => {
  const done = (over: Partial<Expense>) => exp({ payer: "เก่ง", amount: 120, fx_rate: 4.5, amount_thb: 540, pending: false, ...over });

  it("opens a confirmed expense at the edit step and recognises an equal split", () => {
    const st = stateFromExpense(done({ splits: [split("โอ", 270)] }), "HKD", "เก่ง");
    expect(st.step).toBe("edit");
    expect(st.data).toEqual({ rev: 1, asker: "เก่ง", currencyConfirmed: true, rateCurrency: "HKD", splitMode: "equal", partner: "โอ" });
    expect(missingFields(st.expense, st.data, M)).toEqual([]);
  });

  it("recovers the owed amount in the expense currency for an unequal split", () => {
    const st = stateFromExpense(done({ amount: 500, amount_thb: 2250, splits: [split("โอ", 90)] }), "HKD");
    expect(st.data.splitMode).toBe("unequal");
    expect(st.data.owedAmount).toBe(20);
  });

  it("recognises no split, and locks splits shared by more than one person", () => {
    expect(stateFromExpense(done({}), "HKD").data.splitMode).toBe("none");
    expect(stateFromExpense(done({ splits: [split("โอ", 100), split("ต้น", 100)] }), "HKD").data.lockedSplits).toBe(true);
  });

  it("opens a pending draft at the missing card", () => {
    const st = stateFromExpense(exp({ payer: "เก่ง" }), "HKD");
    expect(st.step).toBe("missing");
    expect(st.data.currencyConfirmed).toBeUndefined();
    expect(missingFields(st.expense, st.data, M)).toEqual(["amount", "currency", "split"]);
  });

  it("treats a parked draft's currency as chosen when the row shows it", () => {
    // HKD chosen in a HKD trip: the fetched rate gives it away.
    const fetched = stateFromExpense(exp({ payer: "เก่ง", amount: 120, fx_rate: 4.5, amount_thb: 540 }), "HKD");
    expect(fetched.data).toMatchObject({ currencyConfirmed: true, rateCurrency: "HKD" });
    // THB chosen in a HKD trip: the currency differs from the trip default.
    expect(stateFromExpense(exp({ payer: "เก่ง", amount: 120, currency: "THB" }), "HKD").data.currencyConfirmed).toBe(true);
    // Rate fetch failed (rate 1) but amount_thb was filled: confirmed, and the rate is fetched again.
    const failed = stateFromExpense(exp({ payer: "เก่ง", amount: 120, amount_thb: 120 }), "HKD");
    expect(failed.data.currencyConfirmed).toBe(true);
    expect(failed.data.rateCurrency).toBeUndefined();
  });

  it("still asks the currency when the draft only has the trip default", () => {
    const st = stateFromExpense(exp({ payer: "เก่ง", amount: 120 }), "HKD");
    expect(missingFields(st.expense, st.data, M)).toEqual(["currency", "split"]);
  });
});

describe("rate and finalize", () => {
  const st = (e: Partial<Expense>, d: FlowData): FlowState => ({ expense: exp({ payer: "เก่ง", ...e }), step: "missing", data: d });

  it("needs a rate once amount and currency are both known, until fetched", () => {
    expect(needsRate(st({ amount: 120 }, { currencyConfirmed: true }))).toBe(true);
    expect(needsRate(st({ amount: 120 }, {}))).toBe(false);
    expect(needsRate(withRate(st({ amount: 120 }, { currencyConfirmed: true }), 4.5, false))).toBe(false);
  });

  it("withRate records the rate, the currency it is for, and failure", () => {
    const r = withRate(st({ amount: 120 }, { currencyConfirmed: true }), 1, true);
    expect(r.expense.fx_rate).toBe(1);
    expect(r.data.rateCurrency).toBe("HKD");
    expect(r.data.fxFailed).toBe(true);
  });

  it("computes amount_thb and the splits", () => {
    const c = { currencyConfirmed: true } as const;
    expect(finalize(st({ amount: 120, fx_rate: 4.5 }, { ...c, splitMode: "equal" }), M).expense).toMatchObject({ amount_thb: 540, splits: [split("โอ", 270)] });
    expect(finalize(st({ amount: 120, fx_rate: 4.5, splits: [split("โอ", 1)] }, { ...c, splitMode: "none" }), M).expense.splits).toEqual([]);
    expect(finalize(st({ amount: 500, fx_rate: 4.5 }, { ...c, splitMode: "unequal", owedAmount: 20 }), M).expense.splits).toEqual([split("โอ", 90)]);
  });

  it("leaves amount_thb at 0 until the currency is confirmed", () => {
    expect(finalize(st({ amount: 120, fx_rate: 1 }, {}), M).expense.amount_thb).toBe(0);
  });

  it("carries paid / paid_slip_photo_ids over to the rebuilt split for the same person, even if the amount changed", () => {
    const paid = { name: "โอ", amount_thb: 270, paid: true, paid_slip_photo_ids: ["s1"] };
    expect(finalize(st({ amount: 200, fx_rate: 4.5, splits: [paid] }, { currencyConfirmed: true, splitMode: "equal" }), M).expense.splits)
      .toEqual([{ name: "โอ", amount_thb: 450, paid: true, paid_slip_photo_ids: ["s1"] }]);
  });

  it("never touches locked splits", () => {
    const many = [split("โอ", 100), split("ต้น", 100)];
    expect(finalize(st({ amount: 120, fx_rate: 4.5, splits: many }, { lockedSplits: true }), M).expense.splits).toEqual(many);
  });
});

describe("enterConflict / attachPhoto", () => {
  const s: FlowState = { expense: exp({ payer: "เก่ง", amount: 120 }), step: "missing", data: { rev: 3 } };

  it("remembers where to resume, what to start next, and bumps the rev", () => {
    const c = enterConflict(s, { text: "50 กาแฟ" });
    expect(c.step).toBe("conflict");
    expect(c.data.resumeStep).toBe("missing");
    expect(c.data.pendingText).toBe("50 กาแฟ");
    expect(c.data.rev).toBe(4);
    const again = enterConflict(c, { photoId: "p2" });
    expect(again.data.resumeStep).toBe("missing");
    expect(again.data.rev).toBe(5);
  });

  it("attaches a photo and bumps the rev", () => {
    const a = attachPhoto(s, "p1");
    expect(a.expense.slip_photo_ids).toEqual(["p1"]);
    expect(a.data.rev).toBe(4);
  });
});

describe("missingFields", () => {
  const d = (over: FlowData = {}): FlowData => ({ currencyConfirmed: true, splitMode: "none", ...over });
  const e = (over: Partial<Expense> = {}) => exp({ payer: "เก่ง", amount: 120, ...over });

  it("lists every missing field in card order", () => {
    expect(missingFields(exp(), {}, M)).toEqual(["amount", "currency", "payer", "split"]);
  });

  it("is empty once everything is known", () => {
    expect(missingFields(e(), d(), M)).toEqual([]);
    expect(missingFields(e(), d({ splitMode: "equal" }), M)).toEqual([]);
  });

  it("does not ask the payer when the trip has no members", () => {
    expect(missingFields(exp({ amount: 120 }), d(), [])).toEqual([]);
  });

  it("asks who to split with only for 3+ members and only once the payer is known", () => {
    const three = ["เก่ง", "โอ", "ต้น"];
    expect(missingFields(e(), d({ splitMode: "equal" }), three)).toEqual(["partner"]);
    expect(missingFields(e({ payer: "" }), d({ splitMode: "equal" }), three)).toEqual(["payer"]);
    expect(missingFields(e(), d({ splitMode: "equal", partner: "ต้น" }), three)).toEqual([]);
  });

  it("needs a valid owed amount for หารไม่เท่า", () => {
    const x = e({ amount: 500 });
    expect(missingFields(x, d({ splitMode: "unequal" }), M)).toEqual(["owed"]);
    expect(missingFields(x, d({ splitMode: "unequal", owedAmount: 600 }), M)).toEqual(["owed"]);
    expect(missingFields(x, d({ splitMode: "unequal", owedAmount: 20 }), M)).toEqual([]);
  });

  it("cannot accept an owed amount while the total is unknown", () => {
    expect(missingFields(e({ amount: 0 }), d({ splitMode: "unequal", owedAmount: 20 }), M)).toEqual(["amount", "owed"]);
  });

  it("never asks split, partner or owed for splits made in the app", () => {
    expect(missingFields(e(), d({ lockedSplits: true, splitMode: undefined }), M)).toEqual([]);
  });
});
