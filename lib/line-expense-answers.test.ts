// lib/line-expense-answers.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import type { FlowData, FlowStep } from "./line-expense-flow";
import { extractAtMember, interpretAnswer, interpretBundle, postbackToAnswer } from "./line-expense-answers";

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

const st = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}) => ({ step, expense: exp({ amount: 120, payer: "เก่ง", ...e }), data: d });

describe("interpretAnswer", () => {
  it("accepts ยกเลิก / ทำต่อ at any step, and no longer a typed ย้อน", () => {
    expect(interpretAnswer(st("missing"), "ยกเลิก", M)).toEqual({ k: "cancel" });
    expect(interpretAnswer(st("category"), "ทำต่อ", M)).toEqual({ k: "resume" });
    expect(interpretAnswer(st("missing"), "↩ ย้อน", M)).toBeNull();
  });

  it("missing card: typed text becomes a bundle", () => {
    expect(interpretAnswer(st("missing", { payer: "" }), "HKD โอ หารเท่า", M))
      .toEqual({ k: "set", bundle: { currency: "HKD", payer: "โอ", split: "equal" } });
    expect(interpretAnswer(st("missing"), "สวัสดี", M)).toBeNull();
  });

  it("missing card: the zero-owed prompt answers", () => {
    const d: FlowData = { owedZero: true, splitMode: "unequal" };
    expect(interpretAnswer(st("missing", {}, d), "เปลี่ยนเป็นไม่หาร", M)).toEqual({ k: "owed_none" });
    expect(interpretAnswer(st("missing", {}, d), "ใส่ใหม่", M)).toEqual({ k: "owed_retry" });
  });

  it("view commands are never answers, whatever the step (so แพลน leaves the draft alone)", () => {
    for (const step of ["missing", "note", "payer", "owed"] as FlowStep[]) {
      expect(interpretAnswer(st(step), "แพลน", M)).toBeNull();
      expect(interpretAnswer(st(step), "ขอดูข้อมูล wifi", M)).toBeNull();
    }
  });

  it("edit steps read one field", () => {
    expect(interpretAnswer(st("amount"), "1,200", M)).toEqual({ k: "set", bundle: { amount: 1200 } });
    expect(interpretAnswer(st("amount"), "ข้าว", M)).toBeNull();
    expect(interpretAnswer(st("currency"), "hk", M)).toEqual({ k: "set", bundle: { currency: "HKD" } });
    expect(interpretAnswer(st("payer"), "โอ", M)).toEqual({ k: "set", bundle: { payer: "โอ" } });
    expect(interpretAnswer(st("payer"), "สวัสดี", M)).toBeNull();
    expect(interpretAnswer(st("payer"), "แม่", [])).toEqual({ k: "set", bundle: { payer: "แม่" } });
    expect(interpretAnswer(st("split"), "ไม่หาร", M)).toEqual({ k: "set", bundle: { split: "none" } });
    expect(interpretAnswer(st("split"), "หารกัน", M)).toBeNull();
    expect(interpretAnswer(st("partner"), "ต้น", M3)).toEqual({ k: "set", bundle: { partner: "ต้น" } });
    expect(interpretAnswer(st("owed"), "20", M)).toEqual({ k: "set", bundle: { owed: 20 } });
    expect(interpretAnswer(st("owed", {}, { owedZero: true }), "ใส่ใหม่", M)).toEqual({ k: "owed_retry" });
    expect(interpretAnswer(st("category"), "ตั๋ว", M)).toEqual({ k: "set", bundle: { category: "ตั๋ว" } });
    expect(interpretAnswer(st("category"), "ข้าว", M)).toBeNull();
    expect(interpretAnswer(st("note"), "ข้าวมันไก่ร้านดัง", M)).toEqual({ k: "set", bundle: { note: "ข้าวมันไก่ร้านดัง" } });
    expect(interpretAnswer(st("note"), "-", M)).toEqual({ k: "set", bundle: { note: "" } });
    expect(interpretAnswer(st("edit"), "หมวด", M)).toEqual({ k: "editfield", field: "category" });
    expect(interpretAnswer(st("edit"), "ยอดเท่าไหร่", M)).toBeNull();
  });

  it("prompt steps", () => {
    expect(interpretAnswer(st("confirm_cancel"), "ลบทิ้ง", M)).toEqual({ k: "cancel_delete" });
    expect(interpretAnswer(st("confirm_cancel"), "ลบรายการนี้", M)).toEqual({ k: "cancel_delete" });
    expect(interpretAnswer(st("confirm_cancel"), "เก็บไว้กรอกทีหลัง", M)).toEqual({ k: "cancel_keep" });
    expect(interpretAnswer(st("confirm_cancel"), "ไม่ลบ", M)).toEqual({ k: "cancel_keep" });
    expect(interpretAnswer(st("conflict"), "ทิ้งอันเก่า", M)).toEqual({ k: "conflict_drop" });
    expect(interpretAnswer(st("conflict"), "เก็บไว้ เริ่มใหม่", M)).toEqual({ k: "conflict_park" });
    expect(interpretAnswer(st("conflict"), "ทำต่ออันเก่า", M)).toEqual({ k: "conflict_resume" });
    expect(interpretAnswer(st("confirm_cancel"), "โอเค", M)).toBeNull();
  });
});

describe("postbackToAnswer", () => {
  it("x_set reads one field", () => {
    expect(postbackToAnswer({ a: "x_set", f: "payer", w: "โอ" })).toEqual({ k: "set", bundle: { payer: "โอ" } });
    expect(postbackToAnswer({ a: "x_set", f: "amount", w: "30" })).toEqual({ k: "set", bundle: { amount: 30 } });
    expect(postbackToAnswer({ a: "x_set", f: "currency", w: "HKD" })).toEqual({ k: "set", bundle: { currency: "HKD" } });
    expect(postbackToAnswer({ a: "x_set", f: "split", w: "equal" })).toEqual({ k: "set", bundle: { split: "equal" } });
    expect(postbackToAnswer({ a: "x_set", f: "partner", w: "ต้น" })).toEqual({ k: "set", bundle: { partner: "ต้น" } });
    expect(postbackToAnswer({ a: "x_set", f: "category", w: "ตั๋ว" })).toEqual({ k: "set", bundle: { category: "ตั๋ว" } });
  });

  it("rejects bad values and unknown fields", () => {
    expect(postbackToAnswer({ a: "x_set", f: "split", w: "bogus" })).toBeNull();
    expect(postbackToAnswer({ a: "x_set", f: "amount", w: "abc" })).toBeNull();
    expect(postbackToAnswer({ a: "x_set", f: "category", w: "ไม่มี" })).toBeNull();
    expect(postbackToAnswer({ a: "x_set", f: "nope", w: "x" })).toBeNull();
    expect(postbackToAnswer({ a: "x_set", f: "payer", w: "" })).toBeNull();
  });

  it("maps the other actions", () => {
    expect(postbackToAnswer({ a: "x_clear", f: "currency" })).toEqual({ k: "clear", field: "currency" });
    expect(postbackToAnswer({ a: "x_clear", f: "category" })).toBeNull();
    expect(postbackToAnswer({ a: "x_owed_zero", w: "retry" })).toEqual({ k: "owed_retry" });
    expect(postbackToAnswer({ a: "x_owed_zero", w: "none" })).toEqual({ k: "owed_none" });
    expect(postbackToAnswer({ a: "x_editfield", w: "note" })).toEqual({ k: "editfield", field: "note" });
    expect(postbackToAnswer({ a: "x_editfield", w: "bogus" })).toBeNull();
    expect(postbackToAnswer({ a: "x_edit" })).toEqual({ k: "edit" });
    expect(postbackToAnswer({ a: "x_del" })).toEqual({ k: "ask_delete" });
    expect(postbackToAnswer({ a: "x_cancel" })).toEqual({ k: "cancel" });
    expect(postbackToAnswer({ a: "x_cancel_delete" })).toEqual({ k: "cancel_delete" });
    expect(postbackToAnswer({ a: "x_cancel_keep" })).toEqual({ k: "cancel_keep" });
    expect(postbackToAnswer({ a: "x_conflict_resume" })).toEqual({ k: "conflict_resume" });
    expect(postbackToAnswer({ a: "x_conflict_park" })).toEqual({ k: "conflict_park" });
    expect(postbackToAnswer({ a: "x_conflict_drop" })).toEqual({ k: "conflict_drop" });
  });

  it("the buttons of the removed flow are not answers", () => {
    for (const a of ["x_confirm", "x_back", "x_payer", "x_currency", "x_split", "x_amount", "plan_day"]) {
      expect(postbackToAnswer({ a, v: "1" })).toBeNull();
    }
  });
});
