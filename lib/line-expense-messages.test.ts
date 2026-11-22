// lib/line-expense-messages.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import type { FlowData, FlowEnv, FlowState, FlowStep } from "./line-expense-flow";
import { amountLine, missingCard, questionMessage, savedCard, splitLine, stepMessages, MSG, reaskFor } from "./line-expense-messages";
import { actions, findNode, hasEmptyText, texts } from "./line-test-helpers";

const env: FlowEnv = { members: ["เก่ง", "โอ"], tripCurrency: "HKD", homeCurrency: "THB" };
const cc = { origin: "https://app.test", tripName: "HKG กวางโจว" };
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อาหาร", description: "ข้าว",
  amount: 120, currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [],
  splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }], pending: true,
  ...over,
});
const S = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}): FlowState => ({
  expense: exp(e), step, data: { rev: 2, asker: "เก่ง", currencyConfirmed: true, splitMode: "equal", ...d },
});
const card = (st: FlowState, e = env, notice?: string) => missingCard(st, e, cc, notice);

describe("missingCard", () => {
  const open = S("missing", { payer: "", splits: [] }, { splitMode: undefined });

  it("is one flex bubble: title, how many are left, hint, cancel, trip name", () => {
    const msgs = card(open);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("flex");
    const t = texts(msgs[0]);
    expect(t).toContain("💸 120 HKD · ข้าว");
    expect(t).toContain("เหลืออีก 2 อย่าง");
    expect(t).toContain('พิมพ์ตอบทีเดียวก็ได้ เช่น "HKD เก่ง หารเท่า"');
    expect(t).toContain("ทริป HKG กวางโจว");
    expect(t).toContain("@เก่ง");
    expect(actions(msgs[0]).map((a) => a.label)).toContain("🗑 ยกเลิก");
  });

  it("has buttons only for the missing fields, plus a tap-to-change row for each answered one", () => {
    const acts = actions(card(open)[0]).filter((a) => a.data.a !== "x_cancel");
    const sets = acts.filter((a) => a.data.a === "x_set").map((a) => [a.data.f, a.data.w]);
    expect(sets).toEqual([["payer", "เก่ง"], ["payer", "โอ"], ["split", "none"], ["split", "equal"], ["split", "unequal"]]);
    const clears = acts.filter((a) => a.data.a === "x_clear").map((a) => a.data.f);
    expect(clears).toEqual(["amount", "currency"]);
    expect(acts.every((a) => a.data.e === "e1" && a.data.v === "2")).toBe(true);
  });

  it("answered rows show ✓ label and value", () => {
    const t = texts(card(open)[0]);
    expect(t).toContain("✓ ยอด");
    expect(t).toContain("120");
    expect(t).toContain("✓ สกุลเงิน");
    expect(t).toContain("HKD");
  });

  it("asks the currency with the trip and home currency buttons", () => {
    const st = S("missing", {}, { currencyConfirmed: undefined, splitMode: "none" });
    const sets = actions(card(st)[0]).filter((a) => a.data.f === "currency").map((a) => a.data.w);
    expect(sets).toEqual(["HKD", "THB"]);
  });

  it("amount row: typing hint plus candidate buttons", () => {
    const st = S("missing", { amount: 0, description: "" }, { amountCandidates: [50, 30], currencyConfirmed: undefined, splitMode: undefined });
    const msg = card(st)[0];
    expect(texts(msg)).toContain("พิมพ์ตัวเลข เช่น 120");
    expect(actions(msg).filter((a) => a.data.f === "amount").map((a) => [a.label, a.data.w])).toEqual([["50", "50"], ["30", "30"]]);
  });

  it("title: photo-only and brand-new drafts", () => {
    const photo = S("missing", { amount: 0, description: "", slip_photo_ids: ["p1"] }, { currencyConfirmed: undefined });
    expect(texts(card(photo)[0])).toContain("💸 รับสลิปแล้ว 📸");
    expect(JSON.stringify(card(photo)[0])).toContain("https://app.test/api/img/p1");
    const blank = S("missing", { amount: 0, description: "" }, { currencyConfirmed: undefined });
    expect(texts(card(blank)[0])).toContain("💸 รายการใหม่");
  });

  it("the currency is not shown in the title until it was chosen", () => {
    const st = S("missing", {}, { currencyConfirmed: undefined });
    expect(texts(card(st)[0])).toContain("💸 120 · ข้าว");
  });

  it("owed row: wait for the total, typing hint, zero prompt, over-total warning, answered value", () => {
    const base: Partial<Expense> = { payer: "เก่ง" };
    const noTotal = card(S("missing", { ...base, amount: 0 }, { splitMode: "unequal" }))[0];
    expect(texts(noTotal)).toContain("ใส่ยอดรวมก่อน");
    const hint = card(S("missing", { ...base, amount: 500 }, { splitMode: "unequal" }))[0];
    expect(texts(hint)).toContain("ยอดที่ฝากจ่าย — พิมพ์ตัวเลข เช่น ฝาก 20");
    const zero = card(S("missing", base, { splitMode: "unequal", owedZero: true }))[0];
    expect(actions(zero).filter((a) => a.data.a === "x_owed_zero").map((a) => a.data.w)).toEqual(["none", "retry"]);
    const over = card(S("missing", { ...base, amount: 500 }, { splitMode: "unequal", owedAmount: 600 }))[0];
    expect(texts(over).join("\n")).toContain("เกินยอดรวม 500");
    const ok = card(S("missing", { ...base, amount: 500 }, { splitMode: "unequal", owedAmount: 20 }));
    expect(texts(ok[0])).toContain("20 HKD");
    expect(texts(ok[0])).toContain("เหลืออีก 0 อย่าง");
  });

  it("3 members: asks who to split with among the others", () => {
    const st = S("missing", {}, { splitMode: "equal" });
    const sets = actions(card(st, { ...env, members: ["เก่ง", "โอ", "ต้น"] })[0]).filter((a) => a.data.f === "partner").map((a) => a.data.w);
    expect(sets).toEqual(["โอ", "ต้น"]);
  });

  it("one member: only ไม่หาร is offered", () => {
    const st = S("missing", {}, { splitMode: undefined });
    const sets = actions(card(st, { ...env, members: ["เก่ง"] })[0]).filter((a) => a.data.f === "split").map((a) => a.data.w);
    expect(sets).toEqual(["none"]);
  });

  it("splits made in the app are described, not asked", () => {
    const st = S("missing", {}, { lockedSplits: true, splitMode: undefined });
    const msg = card(st)[0];
    expect(texts(msg)).toContain("⚖️ หารหลายคน (แก้ในแอป)");
    expect(actions(msg).filter((a) => a.data.f === "split")).toEqual([]);
  });

  it("puts a notice in a plain text message above the card", () => {
    const msgs = card(open, env, "ปุ่มนี้หมดอายุแล้ว");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ type: "text", text: "ปุ่มนี้หมดอายุแล้ว" });
  });

  it("never has an empty text node, long labels or oversized postback data", () => {
    const sts = [
      open,
      S("missing", { amount: 0, description: "", payer: "" }, { currencyConfirmed: undefined, splitMode: "unequal", owedZero: true, asker: undefined }),
      S("missing", { description: "" }, { lockedSplits: true }),
    ];
    for (const st of sts) {
      const msg = card(st, { ...env, members: ["เก่ง", "โอ", "ต้น"] })[0];
      expect(hasEmptyText(msg)).toBe(false);
      for (const a of actions(msg)) expect(a.label.length).toBeLessThanOrEqual(20);
    }
    for (const a of actions(card(open)[0])) expect(JSON.stringify(a).length).toBeLessThan(300);
  });
});

describe("questionMessage (editing a saved expense, and the two prompts)", () => {
  it("the picker offers the six fields", () => {
    const msg = questionMessage(S("edit", { pending: false }), env);
    expect(texts(msg)[0]).toBe("@เก่ง แก้ข้อไหน?");
    expect(actions(msg).map((a) => [a.data.a, a.data.w])).toEqual([
      ["x_editfield", "amount"], ["x_editfield", "currency"], ["x_editfield", "payer"],
      ["x_editfield", "split"], ["x_editfield", "category"], ["x_editfield", "note"],
    ]);
  });

  it("single-field questions use x_set with the rev", () => {
    const pay = questionMessage(S("payer", { pending: false }), env);
    expect(texts(pay)[0]).toBe("@เก่ง ใครจ่าย?");
    expect(actions(pay).map((a) => [a.data.a, a.data.f, a.data.w, a.data.e, a.data.v])).toEqual([
      ["x_set", "payer", "เก่ง", "e1", "2"], ["x_set", "payer", "โอ", "e1", "2"],
    ]);
    expect(actions(questionMessage(S("split", { pending: false }), env)).map((a) => a.data.w)).toEqual(["none", "equal", "unequal"]);
    expect(actions(questionMessage(S("split", { pending: false }), { ...env, members: ["เก่ง"] })).map((a) => a.data.w)).toEqual(["none"]);
    expect(actions(questionMessage(S("currency", { pending: false }), env)).map((a) => a.data.w)).toEqual(["HKD", "THB"]);
    expect(actions(questionMessage(S("category", { pending: false }), env))).toHaveLength(6);
  });

  it("note question offers a typed ไม่มีโน้ต", () => {
    const msg = questionMessage(S("note", { pending: false }), env);
    expect(JSON.stringify(msg)).toContain('"text":"-"');
  });

  it("owed question: zero prompt and over-total warning", () => {
    const zero = actions(questionMessage(S("owed", { pending: false }, { splitMode: "unequal", owedZero: true }), env));
    expect(zero.map((a) => [a.data.a, a.data.w])).toEqual([["x_owed_zero", "none"], ["x_owed_zero", "retry"]]);
    const over = texts(questionMessage(S("owed", { amount: 500, pending: false }, { splitMode: "unequal", owedAmount: 600 }), env))[0];
    expect(over).toContain("เกินยอดรวม 500");
    expect(over).toContain("โอ ฝากจ่ายเท่าไหร่?");
  });

  it("cancel prompt differs for a draft and a saved expense", () => {
    const draft = questionMessage(S("confirm_cancel"), env);
    expect(actions(draft).map((a) => [a.label, a.data.a])).toEqual([["ลบทิ้ง", "x_cancel_delete"], ["เก็บไว้กรอกทีหลัง", "x_cancel_keep"]]);
    const saved = questionMessage(S("confirm_cancel", { pending: false }), env);
    expect(texts(saved)[0]).toBe("@เก่ง รายการนี้บันทึกแล้ว ลบทิ้งจริงไหม?");
    expect(actions(saved).map((a) => [a.label, a.data.a])).toEqual([["ลบรายการนี้", "x_cancel_delete"], ["ไม่ลบ", "x_cancel_keep"]]);
  });

  it("conflict text shows the currency once chosen, and says แก้ for a saved expense", () => {
    expect(texts(questionMessage(S("conflict", {}, { currencyConfirmed: undefined }), env))[0]).toBe("@เก่ง มีรายการค้างอยู่ (120 ข้าว) จะทำยังไงดี?");
    expect(texts(questionMessage(S("conflict"), env))[0]).toBe("@เก่ง มีรายการค้างอยู่ (120 HKD ข้าว) จะทำยังไงดี?");
    expect(texts(questionMessage(S("conflict", { pending: false }), env))[0]).toBe("@เก่ง กำลังแก้รายการ (120 HKD ข้าว) อยู่ จะทำยังไงดี?");
    expect(actions(questionMessage(S("conflict"), env)).map((a) => a.data.a)).toEqual(["x_conflict_resume", "x_conflict_park", "x_conflict_drop"]);
  });

  it("puts a notice right after the @name and keeps labels within 20 characters", () => {
    expect(texts(questionMessage(S("amount", { amount: 0 }), env, "ยอดต้องมากกว่า 0 นะ"))[0])
      .toBe("@เก่ง ยอดต้องมากกว่า 0 นะ\nยอดเท่าไหร่? พิมพ์ตัวเลขมาได้เลย");
    const steps: FlowStep[] = ["payer", "amount", "currency", "split", "partner", "owed", "category", "note", "edit", "confirm_cancel", "conflict"];
    for (const step of steps) {
      for (const a of actions(questionMessage(S(step, {}, { owedZero: true }), env))) expect(a.label.length).toBeLessThanOrEqual(20);
    }
  });
});

describe("amountLine / splitLine", () => {
  it("shows THB plainly and other currencies with the THB estimate", () => {
    expect(amountLine(exp({ currency: "THB", amount: 500, amount_thb: 500 }))).toBe("500฿");
    expect(amountLine(exp())).toBe("120 HKD (~540฿)");
  });

  it("describes each split mode", () => {
    expect(splitLine(exp({ splits: [] }), { splitMode: "none" })).toBe("⚖️ ไม่หาร");
    expect(splitLine(exp(), { splitMode: "equal" })).toBe("⚖️ หารเท่า: โอคืน 270฿");
    expect(splitLine(
      exp({ currency: "THB", amount: 500, amount_thb: 500, splits: [{ name: "โอ", amount_thb: 20, paid: false, paid_slip_photo_ids: [] }] }),
      { splitMode: "unequal", owedAmount: 20 },
    )).toBe("⚖️ หารไม่เท่า: เก่ง 480 · โอ 20 → โอคืน 20฿");
    expect(splitLine(exp(), { lockedSplits: true })).toBe("⚖️ หารหลายคน (แก้ในแอป)");
  });
});

describe("savedCard", () => {
  const msg = savedCard(exp({ pending: false, slip_photo_ids: ["p1"] }), { splitMode: "equal" }, "https://app.test", "HKG กวางโจว");

  it("shows ✅ บันทึกแล้ว, the summary lines and the trip name", () => {
    expect(msg.altText).toBe("บันทึกแล้ว: 120 HKD (~540฿)");
    const t = texts(msg);
    expect(t).toContain("✅ บันทึกแล้ว");
    expect(t).toContain("120 HKD (~540฿)");
    expect(t).toContain("👤 เก่ง จ่าย");
    expect(t).toContain("ทริป HKG กวางโจว");
    expect(JSON.stringify(msg)).toContain("https://app.test/api/img/p1");
  });

  it("has ✏️ แก้ and 🗑 ลบ that carry only the expense id, plus the app link", () => {
    const acts = actions(msg);
    expect(acts.filter((a) => a.type === "postback").map((a) => [a.label, a.data])).toEqual([
      ["✏️ แก้", { a: "x_edit", e: "e1" }], ["🗑 ลบ", { a: "x_del", e: "e1" }],
    ]);
    expect(acts.find((a) => a.type === "uri" && a.uri.endsWith("/trips/t1/money"))).toBeDefined();
  });

  it("has no ✅ ยืนยัน button and warns when the rate could not be fetched", () => {
    expect(actions(msg).map((a) => a.data.a)).not.toContain("x_confirm");
    const warn = savedCard(exp({ pending: false }), { splitMode: "equal", fxFailed: true }, "https://app.test", "HK");
    expect(texts(warn).join("\n")).toContain("ดึงเรตไม่ได้");
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("omits the trip line when the name is empty", () => {
    const m = savedCard(exp({ pending: false }), {}, "https://app.test", "");
    expect(texts(m).some((t) => t.startsWith("ทริป"))).toBe(false);
  });
});

describe("stepMessages / reaskFor", () => {
  it("the missing step is the card; every other step is one question", () => {
    expect(stepMessages(S("missing"), env, cc)[0].type).toBe("flex");
    expect(findNode(stepMessages(S("missing"), env, cc, "x"), (n) => n.text === "x")).toBeDefined();
    const q = stepMessages(S("category", { pending: false }), env, cc, "x");
    expect(q).toHaveLength(1);
    expect(q[0].type).toBe("text");
  });

  it("the reask text depends on the step", () => {
    expect(reaskFor("missing")).toBe(MSG.reask);
    expect(MSG.reask).toBe("ไม่เข้าใจ ลองกดปุ่ม หรือพิมพ์ เช่น HKD เก่ง หารเท่า");
    expect(reaskFor("conflict")).toBe(MSG.reaskPrompt);
    expect(reaskFor("category")).toBe(MSG.reaskPrompt);
  });
});
