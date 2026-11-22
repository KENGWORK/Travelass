// lib/line-expense-flow-answers.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import { applyAnswer, type FlowData, type FlowEnv, type FlowState, type FlowStep, type Outcome } from "./line-expense-flow";

const env: FlowEnv = { members: ["เก่ง", "โอ"], tripCurrency: "HKD", homeCurrency: "THB" };
const env3: FlowEnv = { ...env, members: ["เก่ง", "โอ", "ต้น"] };

const full = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อื่นๆ", description: "",
  amount: 500, currency: "THB", fx_rate: 1, amount_thb: 500, payer: "เก่ง", slip_photo_ids: [], splits: [], pending: true,
  ...over,
});
const S = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}): FlowState => ({
  expense: full(e), step, data: { rev: 1, currencyConfirmed: true, splitMode: "none", ...d },
});
const asked = (o: Outcome): FlowState => {
  if (o.k !== "ask") throw new Error(`expected ask, got ${o.k}`);
  return o.state;
};
const savedState = (o: Outcome): FlowState => {
  if (o.k !== "saved") throw new Error(`expected saved, got ${o.k}`);
  return o.state;
};
const savedExpense = (o: Outcome): Expense => savedState(o).expense;

describe("applyAnswer: set on the missing card", () => {
  it("saves the moment the last field arrives (pending off)", () => {
    const o = applyAnswer(S("missing", { payer: "" }), { k: "set", bundle: { payer: "เก่ง" } }, env);
    expect(savedExpense(o)).toEqual({ ...full(), pending: false });
  });

  it("one bundle can fill several fields and save", () => {
    const base = S("missing", { amount: 0, payer: "" }, { currencyConfirmed: undefined, splitMode: undefined });
    const done = savedExpense(applyAnswer(base, { k: "set", bundle: { amount: 120, currency: "HKD", payer: "เก่ง", split: "equal" } }, env));
    expect(done).toMatchObject({ amount: 120, currency: "HKD", payer: "เก่ง", pending: false });
  });

  it("asks again with what is still missing and bumps the rev", () => {
    const st = asked(applyAnswer(S("missing", { payer: "" }, { splitMode: undefined }), { k: "set", bundle: { payer: "เก่ง" } }, env));
    expect(st.step).toBe("missing");
    expect(st.expense.payer).toBe("เก่ง");
    expect(st.data.rev).toBe(2);
  });

  it("leaves the rev alone when nothing changed", () => {
    const o = applyAnswer(S("missing", { amount: 0 }), { k: "set", bundle: { amount: 0 } }, env);
    expect(o).toMatchObject({ k: "ask", notice: "ยอดต้องมากกว่า 0 นะ" });
    expect(asked(o).data.rev).toBe(1);
  });

  it("picking an amount candidate removes it from the note and clears the picker", () => {
    const st = asked(applyAnswer(
      S("missing", { amount: 0, description: "50 ข้าว 30 น้ำ" }, { amountCandidates: [50, 30], currencyConfirmed: undefined }),
      { k: "set", bundle: { amount: 30 } }, env,
    ));
    expect(st.expense.amount).toBe(30);
    expect(st.expense.description).toBe("50 ข้าว น้ำ");
    expect(st.data.amountCandidates).toBeUndefined();
  });

  it("words typed with a first amount seed an empty note and re-guess the category; an existing note is kept", () => {
    const seeded = asked(applyAnswer(S("missing", { amount: 0 }, { currencyConfirmed: undefined }), { k: "set", bundle: { amount: 50, seedNote: "กาแฟ" } }, env));
    expect(seeded.expense).toMatchObject({ amount: 50, description: "กาแฟ", category: "อาหาร" });
    const kept = asked(applyAnswer(S("missing", { amount: 0, description: "แท็กซี่", category: "เดินทาง" }, { currencyConfirmed: undefined }), { k: "set", bundle: { amount: 50, seedNote: "กาแฟ" } }, env));
    expect(kept.expense).toMatchObject({ description: "แท็กซี่", category: "เดินทาง" });
  });

  it("refuses to split when nobody else is on the trip", () => {
    const o = applyAnswer(S("missing", {}, { splitMode: undefined }), { k: "set", bundle: { split: "equal" } }, { ...env, members: ["เก่ง"] });
    expect(o).toMatchObject({ k: "ask", notice: "ทริปนี้ไม่มีสมาชิกคนอื่นให้หาร" });
  });

  it("หารไม่เท่า asks the owed amount; 0 prompts; over-total re-asks; equal-to-total saves", () => {
    const base = S("missing", { amount: 500 }, { splitMode: undefined });
    const unequal = asked(applyAnswer(base, { k: "set", bundle: { split: "unequal" } }, env));
    expect(unequal.data.splitMode).toBe("unequal");
    const zero = asked(applyAnswer(unequal, { k: "set", bundle: { owed: 0 } }, env));
    expect(zero.data.owedZero).toBe(true);
    expect(applyAnswer(unequal, { k: "set", bundle: { owed: 600 } }, env)).toMatchObject({ k: "ask", notice: "เกินยอดรวม 500 ใส่ใหม่นะ" });
    expect(applyAnswer(unequal, { k: "set", bundle: { owed: 500 } }, env).k).toBe("saved");
  });

  it("an owed amount typed before the total is kept and re-checked when the total arrives", () => {
    const base = S("missing", { amount: 0 }, { splitMode: "unequal", owedAmount: 20 });
    expect(applyAnswer(base, { k: "set", bundle: { amount: 500 } }, env).k).toBe("saved");
    expect(applyAnswer(base, { k: "set", bundle: { amount: 10 } }, env)).toMatchObject({ k: "ask", state: { step: "missing" } });
  });

  it("owed zero prompt: switch to ไม่หาร (saves) or type again", () => {
    const base = S("missing", {}, { splitMode: "unequal", owedZero: true });
    expect(applyAnswer(base, { k: "owed_none" }, env)).toMatchObject({ k: "saved", state: { expense: { pending: false }, data: { splitMode: "none" } } });
    const retry = asked(applyAnswer(base, { k: "owed_retry" }, env));
    expect(retry.data.owedZero).toBeUndefined();
    expect(retry.step).toBe("missing");
  });

  it("a 3-person trip also needs the partner, and only a non-payer is accepted", () => {
    const base = S("missing", {}, { splitMode: undefined });
    const st = asked(applyAnswer(base, { k: "set", bundle: { split: "equal" } }, env3));
    expect(st.step).toBe("missing");
    expect(asked(applyAnswer(st, { k: "set", bundle: { partner: "เก่ง" } }, env3)).data.partner).toBeUndefined();
    const done = applyAnswer(st, { k: "set", bundle: { partner: "ต้น" } }, env3);
    expect(done.k).toBe("saved");
  });

  it("choosing the current partner as payer clears the partner", () => {
    const st = asked(applyAnswer(S("missing", { payer: "" }, { splitMode: "equal", partner: "โอ" }), { k: "set", bundle: { payer: "โอ" } }, env3));
    expect(st.data.partner).toBeUndefined();
  });

  it("ignores a payer that is not a member", () => {
    const st = asked(applyAnswer(S("missing", { payer: "" }), { k: "set", bundle: { payer: "ใครก็ไม่รู้" } }, env));
    expect(st.expense.payer).toBe("");
  });
});

describe("applyAnswer: the saved state carries the post-answer data", () => {
  it("the last button (split = equal) saves with splitMode set, so the splits can be built", () => {
    const base = S("missing", {}, { splitMode: undefined });
    const st = savedState(applyAnswer(base, { k: "set", bundle: { split: "equal" } }, env));
    expect(st.data.splitMode).toBe("equal");
    expect(st.expense.pending).toBe(false);
  });

  it("a typed bundle saves with currencyConfirmed and the split", () => {
    const base = S("missing", { amount: 120, currency: "HKD" }, { currencyConfirmed: undefined, splitMode: undefined });
    const st = savedState(applyAnswer(base, { k: "set", bundle: { currency: "HKD", split: "equal" } }, env));
    expect(st.data).toMatchObject({ currencyConfirmed: true, splitMode: "equal" });
  });

  it("หารไม่เท่า + owed saves with owedAmount", () => {
    const base = S("missing", { amount: 500 }, { splitMode: "unequal" });
    expect(savedState(applyAnswer(base, { k: "set", bundle: { owed: 20 } }, env)).data.owedAmount).toBe(20);
  });
});

describe("applyAnswer: resumeStep written by the old flow", () => {
  it("leaving a prompt maps an invalid resumeStep onto a real step", () => {
    const old = { resumeStep: "summary" } as unknown as FlowData;
    const draft = asked(applyAnswer(S("conflict", {}, old), { k: "conflict_resume" }, env));
    expect(draft.step).toBe("missing");
    const saved = asked(applyAnswer(S("conflict", { pending: false }, old), { k: "conflict_resume" }, env));
    expect(saved.step).toBe("edit");
  });
});

describe("applyAnswer: clear", () => {
  it("tapping an answered row clears that field and asks it again", () => {
    const cur = asked(applyAnswer(S("missing", {}, { rateCurrency: "THB" }), { k: "clear", field: "currency" }, env));
    expect(cur.data.currencyConfirmed).toBeUndefined();
    expect(cur.data.rateCurrency).toBeUndefined();
    const amt = asked(applyAnswer(S("missing"), { k: "clear", field: "amount" }, env));
    expect(amt.expense.amount).toBe(0);
    const pay = asked(applyAnswer(S("missing"), { k: "clear", field: "payer" }, env));
    expect(pay.expense.payer).toBe("");
    const spl = asked(applyAnswer(S("missing", {}, { splitMode: "unequal", owedAmount: 20 }), { k: "clear", field: "split" }, env));
    expect(spl.data.splitMode).toBeUndefined();
    expect(spl.data.owedAmount).toBeUndefined();
  });

  it("does nothing outside the missing card", () => {
    const st = S("category", { pending: false });
    expect(asked(applyAnswer(st, { k: "clear", field: "currency" }, env))).toEqual(st);
  });
});

describe("applyAnswer: cancel", () => {
  it("ยกเลิก on a draft asks delete-or-keep and remembers where it was", () => {
    const st = asked(applyAnswer(S("missing", {}, { splitMode: undefined }), { k: "cancel" }, env));
    expect(st.step).toBe("confirm_cancel");
    expect(st.data.resumeStep).toBe("missing");
  });

  it("ทำต่อ from the prompt returns to the card; keep and delete are outcomes", () => {
    const prompt = S("confirm_cancel", {}, { resumeStep: "missing", splitMode: undefined });
    const back = asked(applyAnswer(prompt, { k: "resume" }, env));
    expect(back.step).toBe("missing");
    expect(back.data.resumeStep).toBeUndefined();
    expect(applyAnswer(prompt, { k: "cancel_keep" }, env)).toEqual({ k: "keep" });
    expect(applyAnswer(prompt, { k: "cancel_delete" }, env)).toEqual({ k: "delete" });
  });

  it("delete / keep only count inside the prompt", () => {
    expect(applyAnswer(S("missing"), { k: "cancel_delete" }, env).k).toBe("ask");
  });

  it("ทำต่อ on the card re-shows it", () => {
    expect(asked(applyAnswer(S("missing", {}, { splitMode: undefined }), { k: "resume" }, env)).step).toBe("missing");
  });

  it("from a saved expense's delete prompt, ทำต่อ re-asks the prompt", () => {
    const st = asked(applyAnswer(S("edit", { pending: false }), { k: "ask_delete" }, env));
    expect(st.step).toBe("confirm_cancel");
    expect(asked(applyAnswer(st, { k: "resume" }, env)).step).toBe("confirm_cancel");
  });
});

describe("applyAnswer: editing a saved expense", () => {
  it("edit opens the picker; editfield asks that one field; the answer saves at once", () => {
    const picker = asked(applyAnswer(S("missing", { pending: false }), { k: "edit" }, env));
    expect(picker.step).toBe("edit");
    const cat = asked(applyAnswer(picker, { k: "editfield", field: "category" }, env));
    expect(cat.step).toBe("category");
    const out = applyAnswer(cat, { k: "set", bundle: { category: "ตั๋ว" } }, env);
    expect(out).toMatchObject({ k: "saved", state: { expense: { category: "ตั๋ว", pending: false } } });
  });

  it("edit does nothing on a pending draft; editfield only works from the picker", () => {
    expect(asked(applyAnswer(S("missing"), { k: "edit" }, env)).step).toBe("missing");
    expect(asked(applyAnswer(S("category", { pending: false }), { k: "editfield", field: "note" }, env)).step).toBe("category");
  });

  it("an invalid amount keeps the amount question open", () => {
    const o = applyAnswer(S("amount", { pending: false }), { k: "set", bundle: { amount: 0 } }, env);
    expect(o).toMatchObject({ k: "ask", notice: "ยอดต้องมากกว่า 0 นะ", state: { step: "amount" } });
  });

  it("changing the split to unequal asks the owed amount before saving", () => {
    const st = asked(applyAnswer(S("split", { pending: false }, { splitMode: "equal" }), { k: "set", bundle: { split: "unequal" } }, env));
    expect(st.step).toBe("owed");
    expect(applyAnswer(st, { k: "set", bundle: { owed: 20 } }, env).k).toBe("saved");
  });

  it("editing the note replaces it, including with an empty one", () => {
    const out = applyAnswer(S("note", { pending: false, description: "เก่า" }), { k: "set", bundle: { note: "" } }, env);
    expect(savedExpense(out).description).toBe("");
  });
});

describe("applyAnswer: conflict", () => {
  it("resume goes back to where the flow was; park / drop carry the pending input", () => {
    const c = S("conflict", {}, { resumeStep: "missing", splitMode: undefined, pendingText: "50 ข้าว" });
    const resumed = asked(applyAnswer(c, { k: "conflict_resume" }, env));
    expect(resumed.step).toBe("missing");
    expect(resumed.data.pendingText).toBeUndefined();
    expect(applyAnswer(c, { k: "conflict_park" }, env)).toEqual({ k: "park", pendingText: "50 ข้าว", pendingPhotoId: undefined });
    const p = S("conflict", {}, { resumeStep: "missing", pendingPhotoId: "p9" });
    expect(applyAnswer(p, { k: "conflict_drop" }, env)).toEqual({ k: "drop", pendingText: undefined, pendingPhotoId: "p9" });
  });

  it("conflict choices only count inside the conflict prompt", () => {
    expect(applyAnswer(S("missing"), { k: "conflict_drop" }, env).k).toBe("ask");
  });
});
