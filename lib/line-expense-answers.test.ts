// lib/line-expense-answers.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import type { FlowData } from "./line-expense-flow";
import { extractAtMember, interpretBundle } from "./line-expense-answers";

const M = ["เก่ง", "โอ"];
const M3 = ["เก่ง", "โอ", "ต้น"];
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อื่นๆ", description: "",
  amount: 0, currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: [], splits: [], pending: true,
  ...over,
});
const ctx = (e: Partial<Expense> = {}, d: FlowData = {}, members = M) => ({ expense: exp(e), data: d, members });

describe("interpretBundle", () => {
  it("reads currency, payer and split from one message", () => {
    expect(interpretBundle("HKD เก่ง หารเท่า", ctx({ amount: 120 }))).toEqual({ currency: "HKD", payer: "เก่ง", split: "equal" });
  });

  it("is order independent and accepts @name", () => {
    expect(interpretBundle("หารเท่า @โอ hk", ctx({ amount: 120 }))).toEqual({ currency: "HKD", payer: "โอ", split: "equal" });
  });

  it("a bare number fills a missing amount", () => {
    expect(interpretBundle("120", ctx())).toEqual({ amount: 120 });
    expect(interpretBundle("1,200 บาท", ctx())).toEqual({ amount: 1200, currency: "THB" });
  });

  it("ฝาก N means หารไม่เท่า with that owed amount", () => {
    expect(interpretBundle("ฝาก 20", ctx({ amount: 500, payer: "เก่ง" }))).toEqual({ split: "unequal", owed: 20 });
    expect(interpretBundle("120 ฝาก 20", ctx())).toEqual({ amount: 120, split: "unequal", owed: 20 });
  });

  it("a bare number is the owed amount only while the amount is known and the split is unequal", () => {
    expect(interpretBundle("20", ctx({ amount: 500 }, { splitMode: "unequal" }))).toEqual({ owed: 20 });
    expect(interpretBundle("20", ctx({ amount: 500 }, { splitMode: "none" }))).toBeNull();
    expect(interpretBundle("20", ctx({ amount: 500 }))).toBeNull();
  });

  it("a number that fits no field makes the whole text a non-answer (a new entry)", () => {
    expect(interpretBundle("120 บาท ข้าว", ctx({ amount: 120, payer: "เก่ง" }))).toBeNull();
    expect(interpretBundle("50 30", ctx({ amount: 120 }))).toBeNull();
  });

  it("two numbers fill amount then owed", () => {
    expect(interpretBundle("120 20", ctx({}, { splitMode: "unequal" }))).toEqual({ amount: 120, owed: 20 });
  });

  it("skips unknown tokens when at least one field was understood", () => {
    expect(interpretBundle("HKD อร่อยมาก", ctx({ amount: 120 }))).toEqual({ currency: "HKD" });
  });

  it("returns null when no field is understood", () => {
    expect(interpretBundle("สวัสดี", ctx({ amount: 120 }))).toBeNull();
    expect(interpretBundle("   ", ctx())).toBeNull();
  });

  it("conflicting values: the first one wins", () => {
    expect(interpretBundle("HKD THB", ctx({ amount: 120 }))).toEqual({ currency: "HKD" });
    expect(interpretBundle("ไม่หาร หารเท่า", ctx({ amount: 120 }))).toEqual({ split: "none" });
  });

  it("seeds the note from leftover words typed with a first amount", () => {
    expect(interpretBundle("50 กาแฟ", ctx())).toEqual({ amount: 50, seedNote: "กาแฟ" });
    expect(interpretBundle("50 กาแฟ", ctx({ description: "แท็กซี่" }))).toEqual({ amount: 50 });
  });

  it("a name is the payer while the payer is missing, otherwise the partner when one is needed", () => {
    expect(interpretBundle("โอ", ctx({ amount: 120 }))).toEqual({ payer: "โอ" });
    expect(interpretBundle("ต้น", ctx({ amount: 120, payer: "เก่ง" }, { splitMode: "equal" }, M3))).toEqual({ partner: "ต้น" });
    expect(interpretBundle("ต้น", ctx({ amount: 120, payer: "เก่ง" }, { splitMode: "none" }, M3))).toBeNull();
    expect(interpretBundle("โอ", ctx({ amount: 120, payer: "เก่ง" }))).toBeNull();
  });

  it("matches member names with spaces", () => {
    expect(interpretBundle("HKD พี่ เก่ง", ctx({ amount: 120 }, {}, ["พี่ เก่ง", "โอ"]))).toEqual({ currency: "HKD", payer: "พี่ เก่ง" });
  });
});

describe("extractAtMember", () => {
  it("finds @member, returns the member and the text without it", () => {
    expect(extractAtMember("120 HKD ข้าว @เก่ง หาร", M)).toEqual({ payer: "เก่ง", text: "120 HKD ข้าว หาร" });
    expect(extractAtMember("@โอ 50 กาแฟ", M)).toEqual({ payer: "โอ", text: "50 กาแฟ" });
    expect(extractAtMember("120 ข้าว @โอ", M)).toEqual({ payer: "โอ", text: "120 ข้าว" });
  });

  it("needs the whole name and a member of the trip", () => {
    expect(extractAtMember("120 ข้าว @เก่งมาก", M)).toBeNull();
    expect(extractAtMember("120 ข้าว @ใครก็ไม่รู้", M)).toBeNull();
    expect(extractAtMember("120 ข้าว เก่ง", M)).toBeNull();
  });
});
