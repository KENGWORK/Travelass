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
  nextMissingStep,
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
    expect(isFlowStep("awaiting_name")).toBe(false);
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

describe("nextMissingStep", () => {
  const d = (over: FlowData = {}): FlowData => ({ currencyConfirmed: true, ...over });

  it("asks in order payer → amount → currency → split", () => {
    expect(nextMissingStep(exp(), {}, M)).toBe("payer");
    expect(nextMissingStep(exp({ payer: "เก่ง" }), {}, M)).toBe("amount");
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), {}, M)).toBe("currency");
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d(), M)).toBe("split");
  });

  it("is complete once the split is known", () => {
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d({ splitMode: "none" }), M)).toBe("summary");
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d({ splitMode: "equal" }), M)).toBe("summary");
  });

  it("asks who to split with when the trip does not have exactly 2 members", () => {
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d({ splitMode: "equal" }), ["เก่ง", "โอ", "ต้น"])).toBe("partner");
  });

  it("needs a valid owed amount for หารไม่เท่า", () => {
    const e = exp({ payer: "เก่ง", amount: 500 });
    expect(nextMissingStep(e, d({ splitMode: "unequal" }), M)).toBe("owed");
    expect(nextMissingStep(e, d({ splitMode: "unequal", owedAmount: 600 }), M)).toBe("owed");
    expect(nextMissingStep(e, d({ splitMode: "unequal", owedAmount: 20 }), M)).toBe("summary");
  });

  it("treats splits it cannot edit (more than one person) as done", () => {
    expect(nextMissingStep(exp({ payer: "เก่ง", amount: 120 }), d({ lockedSplits: true }), M)).toBe("summary");
  });
});

describe("initialState", () => {
  const base = { id: "e1", tripId: "t1", now: "2026-11-21T03:00:00.000Z", tripCurrency: "HKD" };

  it("goes straight to the summary when the text says everything", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("120 HKD ข้าว หาร"), payer: "เก่ง" }, M);
    expect(st.step).toBe("summary");
    expect(st.expense).toEqual(exp({ payer: "เก่ง", amount: 120, currency: "HKD", category: "อาหาร", description: "ข้าว" }));
    expect(st.data).toEqual({ prevSteps: [], currencyConfirmed: true, splitMode: "equal" });
  });

  it("starts a photo-only draft by asking who paid when the name did not match", () => {
    const st = initialState({ ...base, parsed: parseExpenseText(""), payer: "", photoId: "p1", asker: "Kengz" }, M);
    expect(st.step).toBe("payer");
    expect(st.expense.slip_photo_ids).toEqual(["p1"]);
    expect(st.expense.currency).toBe("HKD");
    expect(st.data).toEqual({ prevSteps: [], asker: "Kengz" });
  });

  it("keeps amount candidates for the picker", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("50 ข้าว 30 น้ำ"), payer: "เก่ง" }, M);
    expect(st.step).toBe("amount");
    expect(st.data.amountCandidates).toEqual([50, 30]);
  });

  it("turns a typed ฝาก 0 into the zero-owed prompt", () => {
    const st = initialState({ ...base, parsed: parseExpenseText("500 บาท ฝาก 0"), payer: "เก่ง" }, M);
    expect(st.step).toBe("owed");
    expect(st.data.owedZero).toBe(true);
    expect(st.data.owedAmount).toBeUndefined();
  });
});

describe("stateFromExpense", () => {
  const done = (over: Partial<Expense>) => exp({ payer: "เก่ง", amount: 120, fx_rate: 4.5, amount_thb: 540, pending: false, ...over });

  it("recognises an equal split on a confirmed expense", () => {
    const st = stateFromExpense(done({ splits: [split("โอ", 270)] }), M, "HKD", "เก่ง");
    expect(st.step).toBe("summary");
    expect(st.data).toEqual({ prevSteps: [], asker: "เก่ง", currencyConfirmed: true, rateCurrency: "HKD", splitMode: "equal", partner: "โอ" });
  });

  it("recovers the owed amount in the expense currency for an unequal split", () => {
    const st = stateFromExpense(done({ amount: 500, amount_thb: 2250, splits: [split("โอ", 90)] }), M, "HKD");
    expect(st.data.splitMode).toBe("unequal");
    expect(st.data.owedAmount).toBe(20);
  });

  it("recognises no split, and locks splits shared by more than one person", () => {
    expect(stateFromExpense(done({}), M, "HKD").data.splitMode).toBe("none");
    expect(stateFromExpense(done({ splits: [split("โอ", 100), split("ต้น", 100)] }), M, "HKD").data.lockedSplits).toBe(true);
  });

  it("resumes an untouched pending draft at the first missing step", () => {
    const st = stateFromExpense(exp({ payer: "เก่ง" }), M, "HKD");
    expect(st.step).toBe("amount");
    expect(st.data.currencyConfirmed).toBeUndefined();
  });

  it("treats a parked draft's currency as chosen when the row shows it", () => {
    // HKD chosen in a HKD trip: the fetched rate gives it away.
    const fetched = stateFromExpense(exp({ payer: "เก่ง", amount: 120, fx_rate: 4.5, amount_thb: 540 }), M, "HKD");
    expect(fetched.step).toBe("split");
    expect(fetched.data).toMatchObject({ currencyConfirmed: true, rateCurrency: "HKD" });
    // THB chosen in a HKD trip: the currency differs from the trip default.
    expect(stateFromExpense(exp({ payer: "เก่ง", amount: 120, currency: "THB" }), M, "HKD").step).toBe("split");
    // Rate fetch failed (rate 1) but amount_thb was filled: confirmed, and the rate is fetched again.
    const failed = stateFromExpense(exp({ payer: "เก่ง", amount: 120, amount_thb: 120 }), M, "HKD");
    expect(failed.data.currencyConfirmed).toBe(true);
    expect(failed.data.rateCurrency).toBeUndefined();
  });

  it("still asks the currency when the draft only has the trip default", () => {
    expect(stateFromExpense(exp({ payer: "เก่ง", amount: 120 }), M, "HKD").step).toBe("currency");
  });
});

describe("rate and finalize", () => {
  const st = (e: Partial<Expense>, d: FlowData): FlowState => ({ expense: exp({ payer: "เก่ง", ...e }), step: "summary", data: d });

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
  const s: FlowState = { expense: exp({ payer: "เก่ง", amount: 120 }), step: "split", data: { prevSteps: ["currency"] } };

  it("remembers where to resume and what to start next", () => {
    const c = enterConflict(s, { text: "50 กาแฟ" });
    expect(c.step).toBe("conflict");
    expect(c.data.resumeStep).toBe("split");
    expect(c.data.pendingText).toBe("50 กาแฟ");
    expect(enterConflict(c, { photoId: "p2" }).data.resumeStep).toBe("split");
  });

  it("attaches a photo", () => {
    expect(attachPhoto(s, "p1").expense.slip_photo_ids).toEqual(["p1"]);
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
