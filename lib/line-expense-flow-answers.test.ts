// lib/line-expense-flow-answers.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import {
  applyAnswer,
  interpretAnswer,
  postbackToAnswer,
  type FlowData,
  type FlowEnv,
  type FlowState,
  type FlowStep,
  type Outcome,
} from "./line-expense-flow";

const env: FlowEnv = { members: ["เก่ง", "โอ"], tripCurrency: "HKD", homeCurrency: "THB" };
const env3: FlowEnv = { ...env, members: ["เก่ง", "โอ", "ต้น"] };

const full = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อื่นๆ", description: "",
  amount: 500, currency: "THB", fx_rate: 1, amount_thb: 500, payer: "เก่ง", slip_photo_ids: [], splits: [], pending: true,
  ...over,
});
const S = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}): FlowState => ({
  expense: full(e), step, data: { prevSteps: [], currencyConfirmed: true, splitMode: "none", ...d },
});
const asked = (o: Outcome): FlowState => {
  if (o.k !== "ask") throw new Error(`expected ask, got ${o.k}`);
  return o.state;
};

describe("interpretAnswer", () => {
  const d: FlowData = {};

  it("accepts the global commands at any step", () => {
    expect(interpretAnswer("amount", d, "ยกเลิก", env.members)).toEqual({ k: "cancel" });
    expect(interpretAnswer("split", d, "↩ ย้อน", env.members)).toEqual({ k: "back" });
    expect(interpretAnswer("currency", d, "ทำต่อ", env.members)).toEqual({ k: "resume" });
  });

  it("payer: member names only, or any name when the trip has no members", () => {
    expect(interpretAnswer("payer", d, "โอ", env.members)).toEqual({ k: "payer", name: "โอ" });
    expect(interpretAnswer("payer", d, "สวัสดี", env.members)).toBeNull();
    expect(interpretAnswer("payer", d, "แม่", [])).toEqual({ k: "payer", name: "แม่" });
  });

  it("amount: any number (0 included so it is answered, not treated as a new entry)", () => {
    expect(interpretAnswer("amount", d, "1,200", env.members)).toEqual({ k: "amount", amount: 1200 });
    expect(interpretAnswer("amount", d, "0", env.members)).toEqual({ k: "amount", amount: 0 });
    expect(interpretAnswer("amount", d, "ข้าว", env.members)).toBeNull();
  });

  it("currency / split / category use their exact words", () => {
    expect(interpretAnswer("currency", d, "hk", env.members)).toEqual({ k: "currency", code: "HKD" });
    expect(interpretAnswer("currency", d, "ข้าว", env.members)).toBeNull();
    expect(interpretAnswer("split", d, "ไม่หาร", env.members)).toEqual({ k: "split", mode: "none" });
    expect(interpretAnswer("split", d, "หารกัน", env.members)).toBeNull();
    expect(interpretAnswer("category", d, "ตั๋ว", env.members)).toEqual({ k: "category", category: "ตั๋ว" });
  });

  it("owed: numbers, plus the two zero-prompt choices", () => {
    expect(interpretAnswer("owed", d, "20", env.members)).toEqual({ k: "owed", amount: 20 });
    expect(interpretAnswer("owed", { owedZero: true }, "เปลี่ยนเป็นไม่หาร", env.members)).toEqual({ k: "owed_none" });
    expect(interpretAnswer("owed", { owedZero: true }, "ใส่ใหม่", env.members)).toEqual({ k: "owed_retry" });
  });

  it("note: any text; '-' clears it", () => {
    expect(interpretAnswer("note", d, "ข้าวมันไก่", env.members)).toEqual({ k: "note", text: "ข้าวมันไก่" });
    expect(interpretAnswer("note", d, "-", env.members)).toEqual({ k: "note", text: "" });
  });

  it("payer: a bare number fills a missing amount, but is not an answer once the amount is known", () => {
    expect(interpretAnswer("payer", d, "120", env.members)).toEqual({ k: "amount", amount: 120 });
    expect(interpretAnswer("payer", d, "50 กาแฟ", env.members)).toEqual({ k: "amount", amount: 50, note: "กาแฟ" });
    expect(interpretAnswer("payer", d, "120", env.members, true)).toBeNull();
    expect(interpretAnswer("payer", d, "120", [])).toEqual({ k: "amount", amount: 120 });
  });

  it("note: refuses the router's view commands so they still route", () => {
    expect(interpretAnswer("note", d, "แพลน", env.members)).toBeNull();
    expect(interpretAnswer("note", d, "#2", env.members)).toBeNull();
    expect(interpretAnswer("note", d, "ขอดูข้อมูล wifi", env.members)).toBeNull();
    expect(interpretAnswer("note", d, "plan", env.members)).toBeNull();
    expect(interpretAnswer("note", d, "ข้าวมันไก่ร้านดัง", env.members)).toEqual({ k: "note", text: "ข้าวมันไก่ร้านดัง" });
  });

  it("button steps accept their labels typed out", () => {
    expect(interpretAnswer("summary", d, "ยืนยัน", env.members)).toEqual({ k: "confirm" });
    expect(interpretAnswer("summary", d, "แก้", env.members)).toEqual({ k: "edit" });
    expect(interpretAnswer("edit", d, "หมวด", env.members)).toEqual({ k: "editfield", field: "category" });
    expect(interpretAnswer("confirm_cancel", d, "ลบทิ้ง", env.members)).toEqual({ k: "cancel_delete" });
    expect(interpretAnswer("confirm_cancel", d, "เก็บไว้กรอกทีหลัง", env.members)).toEqual({ k: "cancel_keep" });
    expect(interpretAnswer("confirm_cancel", d, "ลบรายการนี้", env.members)).toEqual({ k: "cancel_delete" });
    expect(interpretAnswer("confirm_cancel", d, "ไม่ลบ", env.members)).toEqual({ k: "cancel_keep" });
    expect(interpretAnswer("conflict", d, "ทิ้งอันเก่า", env.members)).toEqual({ k: "conflict_drop" });
    expect(interpretAnswer("conflict", d, "เก็บไว้ เริ่มใหม่", env.members)).toEqual({ k: "conflict_park" });
    expect(interpretAnswer("summary", d, "โอเค", env.members)).toBeNull();
  });
});

describe("postbackToAnswer", () => {
  it("maps x_ actions and validates values", () => {
    expect(postbackToAnswer({ a: "x_payer", v: "โอ" })).toEqual({ k: "payer", name: "โอ" });
    expect(postbackToAnswer({ a: "x_amount", v: "30" })).toEqual({ k: "amount", amount: 30 });
    expect(postbackToAnswer({ a: "x_split", v: "bogus" })).toBeNull();
    expect(postbackToAnswer({ a: "x_back" })).toEqual({ k: "back" });
    expect(postbackToAnswer({ a: "x_editfield", v: "note" })).toEqual({ k: "editfield", field: "note" });
    expect(postbackToAnswer({ a: "x_owed_zero", v: "retry" })).toEqual({ k: "owed_retry" });
    expect(postbackToAnswer({ a: "plan_day" })).toBeNull();
  });
});

describe("applyAnswer: cancel / back / resume", () => {
  it("🗑 on a draft's summary deletes right away", () => {
    expect(applyAnswer(S("summary"), { k: "cancel" }, env)).toEqual({ k: "delete" });
  });

  it("🗑 on a confirmed expense's summary asks first and returns to the summary on back", () => {
    const st = asked(applyAnswer(S("summary", { pending: false }), { k: "cancel" }, env));
    expect(st.step).toBe("confirm_cancel");
    expect(st.data.resumeStep).toBe("summary");
    expect(asked(applyAnswer(st, { k: "back" }, env)).step).toBe("summary");
    expect(applyAnswer(st, { k: "cancel_keep" }, env)).toEqual({ k: "keep" });
  });

  it("ยกเลิก mid-flow asks delete-or-keep and remembers where it was", () => {
    const st = asked(applyAnswer(S("split", {}, { splitMode: undefined }), { k: "cancel" }, env));
    expect(st.step).toBe("confirm_cancel");
    expect(st.data.resumeStep).toBe("split");
    expect(st.data.prevSteps).toEqual([]);
  });

  it("back from the cancel prompt returns to the remembered step", () => {
    const st = asked(applyAnswer(S("confirm_cancel", {}, { resumeStep: "split", splitMode: undefined }), { k: "back" }, env));
    expect(st.step).toBe("split");
    expect(st.data.resumeStep).toBeUndefined();
  });

  it("back pops the previous step; with nothing to pop it re-asks", () => {
    const st = asked(applyAnswer(S("currency", {}, { prevSteps: ["payer", "amount"], currencyConfirmed: undefined }), { k: "back" }, env));
    expect(st.step).toBe("amount");
    expect(st.data.prevSteps).toEqual(["payer"]);
    expect(asked(applyAnswer(S("payer", { payer: "" }), { k: "back" }, env)).step).toBe("payer");
  });

  it("ทำต่อ re-asks the current step", () => {
    expect(asked(applyAnswer(S("split", {}, { splitMode: undefined }), { k: "resume" }, env)).step).toBe("split");
  });
});

describe("applyAnswer: fields", () => {
  it("payer moves on to the first missing step and records the back step", () => {
    const st = asked(applyAnswer(S("payer", { payer: "" }), { k: "payer", name: "เก่ง" }, env));
    expect(st.expense.payer).toBe("เก่ง");
    expect(st.step).toBe("summary");
    expect(st.data.prevSteps).toEqual(["payer"]);
  });

  it("payer rejects non-members and clears a partner who is now the payer", () => {
    expect(asked(applyAnswer(S("payer", { payer: "" }), { k: "payer", name: "ใครก็ไม่รู้" }, env)).step).toBe("payer");
    const st = asked(applyAnswer(S("payer", { payer: "" }, { splitMode: "equal", partner: "โอ" }), { k: "payer", name: "โอ" }, env3));
    expect(st.data.partner).toBeUndefined();
    expect(st.step).toBe("partner");
  });

  it("a number typed at the payer step fills the amount and asks the payer again", () => {
    const st = asked(applyAnswer(S("payer", { payer: "", amount: 0 }, { currencyConfirmed: undefined }), { k: "amount", amount: 120 }, env));
    expect(st.expense.amount).toBe(120);
    expect(st.step).toBe("payer");
    expect(st.data.prevSteps).toEqual([]);
  });

  it("words typed with the amount at the payer step seed an empty note and re-guess the category", () => {
    const st = asked(applyAnswer(S("payer", { payer: "", amount: 0, description: "", category: "อื่นๆ" }), { k: "amount", amount: 50, note: "กาแฟ" }, env));
    expect(st.expense).toMatchObject({ amount: 50, description: "กาแฟ", category: "อาหาร" });
    expect(st.step).toBe("payer");
    const kept = asked(applyAnswer(S("payer", { payer: "", amount: 0, description: "แท็กซี่", category: "เดินทาง" }), { k: "amount", amount: 50, note: "กาแฟ" }, env));
    expect(kept.expense).toMatchObject({ description: "แท็กซี่", category: "เดินทาง" });
  });

  it("amount must be positive", () => {
    const o = applyAnswer(S("amount", { amount: 0 }), { k: "amount", amount: 0 }, env);
    expect(o).toMatchObject({ k: "ask", notice: "ยอดต้องมากกว่า 0 นะ" });
    expect(asked(o).step).toBe("amount");
  });

  it("picking a candidate removes it from the note and clears the picker", () => {
    const st = asked(applyAnswer(
      S("amount", { amount: 0, description: "50 ข้าว 30 น้ำ" }, { amountCandidates: [50, 30], currencyConfirmed: undefined }),
      { k: "amount", amount: 30 }, env,
    ));
    expect(st.expense.amount).toBe(30);
    expect(st.expense.description).toBe("50 ข้าว น้ำ");
    expect(st.data.amountCandidates).toBeUndefined();
    expect(st.step).toBe("currency");
  });

  it("currency accepts supported codes only", () => {
    const base = S("currency", {}, { currencyConfirmed: undefined, splitMode: undefined });
    expect(asked(applyAnswer(base, { k: "currency", code: "XXX" }, env)).step).toBe("currency");
    const st = asked(applyAnswer(base, { k: "currency", code: "HKD" }, env));
    expect(st.expense.currency).toBe("HKD");
    expect(st.data.currencyConfirmed).toBe(true);
    expect(st.step).toBe("split");
  });

  it("split: equal is complete in a 2-person trip, unequal asks the owed amount", () => {
    const base = S("split", {}, { splitMode: undefined });
    expect(asked(applyAnswer(base, { k: "split", mode: "equal" }, env)).step).toBe("summary");
    expect(asked(applyAnswer(base, { k: "split", mode: "unequal" }, env)).step).toBe("owed");
  });

  it("split refuses to split when nobody else is on the trip", () => {
    const o = applyAnswer(S("split", {}, { splitMode: undefined }), { k: "split", mode: "equal" }, { ...env, members: ["เก่ง"] });
    expect(o).toMatchObject({ k: "ask", notice: "ทริปนี้ไม่มีสมาชิกคนอื่นให้หาร" });
  });

  it("split in a 3-person trip asks who, and only accepts a non-payer", () => {
    const st = asked(applyAnswer(S("split", {}, { splitMode: undefined }), { k: "split", mode: "equal" }, env3));
    expect(st.step).toBe("partner");
    expect(asked(applyAnswer(st, { k: "partner", name: "เก่ง" }, env3)).step).toBe("partner");
    const done = asked(applyAnswer(st, { k: "partner", name: "ต้น" }, env3));
    expect(done.data.partner).toBe("ต้น");
    expect(done.step).toBe("summary");
  });

  it("owed: 0 prompts, over-total re-asks, equal-to-total is accepted", () => {
    const base = S("owed", { amount: 500 }, { splitMode: "unequal" });
    const zero = asked(applyAnswer(base, { k: "owed", amount: 0 }, env));
    expect(zero.step).toBe("owed");
    expect(zero.data.owedZero).toBe(true);
    expect(applyAnswer(base, { k: "owed", amount: 600 }, env)).toMatchObject({ k: "ask", notice: "เกินยอดรวม 500 ใส่ใหม่นะ" });
    const ok = asked(applyAnswer(base, { k: "owed", amount: 500 }, env));
    expect(ok.data.owedAmount).toBe(500);
    expect(ok.step).toBe("summary");
  });

  it("owed zero prompt: switch to ไม่หาร or type again", () => {
    const base = S("owed", {}, { splitMode: "unequal", owedZero: true });
    const none = asked(applyAnswer(base, { k: "owed_none" }, env));
    expect(none.data.splitMode).toBe("none");
    expect(none.step).toBe("summary");
    const retry = asked(applyAnswer(base, { k: "owed_retry" }, env));
    expect(retry.data.owedZero).toBeUndefined();
    expect(retry.step).toBe("owed");
  });
});

describe("applyAnswer: summary, edit, confirm, conflict", () => {
  it("confirm finishes a complete draft", () => {
    expect(applyAnswer(S("summary"), { k: "confirm" }, env)).toEqual({ k: "confirm", expense: { ...full(), pending: false } });
  });

  it("confirm on an incomplete expense jumps to what is missing", () => {
    expect(asked(applyAnswer(S("summary", { amount: 0 }), { k: "confirm" }, env)).step).toBe("amount");
  });

  it("edit → pick field → answer → back to the summary", () => {
    const edit = asked(applyAnswer(S("summary"), { k: "edit" }, env));
    expect(edit.step).toBe("edit");
    expect(edit.data.editing).toBe(true);
    expect(edit.data.prevSteps).toEqual(["summary"]);
    const cat = asked(applyAnswer(edit, { k: "editfield", field: "category" }, env));
    expect(cat.step).toBe("category");
    expect(cat.data.prevSteps).toEqual(["summary", "edit"]);
    const back = asked(applyAnswer(cat, { k: "category", category: "ตั๋ว" }, env));
    expect(back.expense.category).toBe("ตั๋ว");
    expect(back.step).toBe("summary");
  });

  it("cancel prompt choices", () => {
    expect(applyAnswer(S("confirm_cancel"), { k: "cancel_delete" }, env)).toEqual({ k: "delete" });
    expect(applyAnswer(S("confirm_cancel"), { k: "cancel_keep" }, env)).toEqual({ k: "keep" });
  });

  it("conflict choices", () => {
    const c = S("conflict", {}, { resumeStep: "split", splitMode: undefined, pendingText: "50 ข้าว" });
    const resumed = asked(applyAnswer(c, { k: "conflict_resume" }, env));
    expect(resumed.step).toBe("split");
    expect(resumed.data.pendingText).toBeUndefined();
    expect(applyAnswer(c, { k: "conflict_park" }, env)).toEqual({ k: "park", pendingText: "50 ข้าว", pendingPhotoId: undefined });
    const p = S("conflict", {}, { resumeStep: "split", pendingPhotoId: "p9" });
    expect(applyAnswer(p, { k: "conflict_drop" }, env)).toEqual({ k: "drop", pendingText: undefined, pendingPhotoId: "p9" });
  });
});
