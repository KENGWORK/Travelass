// lib/line-expense-messages.test.ts
import { describe, it, expect } from "vitest";
import type { Expense } from "./models/types";
import { decodePostback } from "./line-flex";
import type { FlowData, FlowEnv, FlowState, FlowStep } from "./line-expense-flow";
import { amountLine, questionMessage, savedCard, splitLine, stepMessages, summaryCard } from "./line-expense-messages";

const env: FlowEnv = { members: ["เก่ง", "โอ"], tripCurrency: "HKD", homeCurrency: "THB" };
const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1", trip_id: "t1", datetime: "2026-11-21T03:00:00.000Z", category: "อาหาร", description: "ข้าว",
  amount: 120, currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [],
  splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }], pending: true,
  ...over,
});
const S = (step: FlowStep, e: Partial<Expense> = {}, d: FlowData = {}): FlowState => ({
  expense: exp(e), step, data: { prevSteps: [], asker: "เก่ง", currencyConfirmed: true, splitMode: "equal", ...d },
});

type Obj = Record<string, unknown>;
function walk(node: unknown, visit: (o: Obj) => void): void {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") {
    visit(node as Obj);
    Object.values(node).forEach((v) => walk(v, visit));
  }
}
const postbacks = (n: unknown) => {
  const out: Record<string, string>[] = [];
  walk(n, (o) => {
    if (o.type === "postback" && typeof o.data === "string") out.push({ label: String(o.label), ...decodePostback(o.data) });
  });
  return out;
};
const texts = (n: unknown) => {
  const out: string[] = [];
  walk(n, (o) => {
    if (o.type === "text") out.push(o.text as string);
  });
  return out;
};
const uris = (n: unknown) => {
  const out: string[] = [];
  walk(n, (o) => {
    if (o.type === "uri") out.push(o.uri as string);
  });
  return out;
};

describe("questionMessage", () => {
  it("asks who paid with one button per member and no back on the first question", () => {
    const msg = questionMessage(S("payer", { payer: "" }), env);
    expect(texts(msg)[0]).toBe("@เก่ง ใครจ่าย?");
    expect(postbacks(msg)).toEqual([
      { label: "เก่ง", a: "x_payer", e: "e1", s: "payer", v: "เก่ง" },
      { label: "โอ", a: "x_payer", e: "e1", s: "payer", v: "โอ" },
    ]);
  });

  it("offers trip and home currency, then ↩ ย้อน when there is a previous step", () => {
    const pbs = postbacks(questionMessage(S("currency", {}, { prevSteps: ["payer"], currencyConfirmed: undefined }), env));
    expect(pbs.map((p) => [p.a, p.v ?? ""])).toEqual([["x_currency", "HKD"], ["x_currency", "THB"], ["x_back", ""]]);
    expect(pbs.every((p) => p.s === "currency" && p.e === "e1")).toBe(true);
  });

  it("never shows ↩ ย้อน on the conflict or cancel prompts", () => {
    expect(postbacks(questionMessage(S("conflict", {}, { prevSteps: ["payer"] }), env)).map((p) => p.a))
      .toEqual(["x_conflict_resume", "x_conflict_park", "x_conflict_drop"]);
    expect(postbacks(questionMessage(S("confirm_cancel", {}, { prevSteps: ["payer"] }), env)).map((p) => p.a))
      .toEqual(["x_cancel_delete", "x_cancel_keep"]);
  });

  it("asks before deleting a confirmed expense, with [ลบรายการนี้][ไม่ลบ]", () => {
    const msg = questionMessage(S("confirm_cancel", { pending: false }), env);
    expect(texts(msg)[0]).toBe("@เก่ง รายการนี้บันทึกแล้ว ลบทิ้งจริงไหม?");
    expect(postbacks(msg).map((p) => [p.label, p.a])).toEqual([["ลบรายการนี้", "x_cancel_delete"], ["ไม่ลบ", "x_cancel_keep"]]);
  });

  it("conflict text shows the currency only once it was chosen", () => {
    expect(texts(questionMessage(S("conflict", {}, { currencyConfirmed: undefined }), env))[0]).toBe("@เก่ง มีรายการค้างอยู่ (120 ข้าว) จะทำยังไงดี?");
    expect(texts(questionMessage(S("conflict"), env))[0]).toBe("@เก่ง มีรายการค้างอยู่ (120 HKD ข้าว) จะทำยังไงดี?");
  });

  it("lists amount candidates", () => {
    const msg = questionMessage(S("amount", { amount: 0 }, { amountCandidates: [50, 30] }), env);
    expect(texts(msg)[0]).toBe("@เก่ง ยอดคือ?");
    expect(postbacks(msg).map((p) => [p.label, p.v])).toEqual([["50", "50"], ["30", "30"]]);
  });

  it("offers only ไม่หาร when nobody else is on the trip", () => {
    const pbs = postbacks(questionMessage(S("split", {}, { splitMode: undefined }), { ...env, members: ["เก่ง"] }));
    expect(pbs.map((p) => p.v)).toEqual(["none"]);
  });

  it("offers the three split modes in a 2-person trip", () => {
    const pbs = postbacks(questionMessage(S("split", {}, { splitMode: undefined }), env));
    expect(pbs.map((p) => [p.label, p.v])).toEqual([["ไม่หาร", "none"], ["หารเท่า", "equal"], ["หารไม่เท่า", "unequal"]]);
  });

  it("owed: zero prompt buttons, and the over-total warning", () => {
    const zero = postbacks(questionMessage(S("owed", {}, { splitMode: "unequal", owedZero: true }), env));
    expect(zero.map((p) => [p.a, p.v])).toEqual([["x_owed_zero", "none"], ["x_owed_zero", "retry"]]);
    const over = texts(questionMessage(S("owed", { amount: 500 }, { splitMode: "unequal", owedAmount: 600 }), env))[0];
    expect(over).toContain("เกินยอดรวม 500");
    expect(over).toContain("โอ ฝากจ่ายเท่าไหร่?");
  });

  it("puts a notice right after the @name", () => {
    expect(texts(questionMessage(S("amount", { amount: 0 }), env, "ยอดต้องมากกว่า 0 นะ"))[0])
      .toBe("@เก่ง ยอดต้องมากกว่า 0 นะ\nยอดเท่าไหร่? พิมพ์ตัวเลขมาได้เลย");
  });

  it("offers the six edit fields", () => {
    expect(postbacks(questionMessage(S("edit"), env)).map((p) => p.v)).toEqual(["amount", "currency", "payer", "split", "category", "note"]);
  });

  it("keeps every quick reply label within 20 characters", () => {
    const steps: FlowStep[] = ["payer", "amount", "currency", "split", "partner", "owed", "category", "note", "edit", "confirm_cancel", "conflict"];
    for (const step of steps) {
      for (const p of postbacks(questionMessage(S(step, {}, { prevSteps: ["payer"], owedZero: true }), env))) {
        expect(p.label.length).toBeLessThanOrEqual(20);
      }
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

describe("summaryCard", () => {
  it("shows the expense with confirm / edit / cancel buttons for this step", () => {
    const msg = summaryCard(S("summary", { slip_photo_ids: ["p1"] }), "https://app.test");
    expect(postbacks(msg).map((p) => [p.a, p.e, p.s])).toEqual([
      ["x_confirm", "e1", "summary"], ["x_edit", "e1", "summary"], ["x_cancel", "e1", "summary"],
    ]);
    const t = texts(msg);
    expect(t).toContain("120 HKD (~540฿)");
    expect(t).toContain("🍜 อาหาร · 📝 ข้าว");
    expect(t).toContain("👤 เก่ง จ่าย");
    expect(t).toContain("⚖️ หารเท่า: โอคืน 270฿");
    expect(JSON.stringify(msg)).toContain("https://app.test/api/img/p1");
  });

  it("never emits an empty text node, even with no note", () => {
    const t = texts(summaryCard(S("summary", { description: "" }), "https://app.test"));
    expect(t.every((x) => typeof x === "string" && x.length > 0)).toBe(true);
    expect(t).toContain("🍜 อาหาร");
  });

  it("warns when the FX rate could not be fetched", () => {
    expect(texts(summaryCard(S("summary", {}, { fxFailed: true }), "https://app.test")).join("\n")).toContain("ดึงเรตไม่ได้");
  });
});

describe("savedCard / stepMessages", () => {
  it("the saved card has no postbacks, just an open-app link", () => {
    const msg = savedCard(exp({ pending: false }), { splitMode: "equal" }, "https://app.test");
    expect(postbacks(msg)).toEqual([]);
    expect(uris(msg)).toContain("https://app.test/trips/t1/money");
    expect(texts(msg)).toContain("✅ บันทึกแล้ว");
  });

  it("summary step with a notice sends the notice first, then the card", () => {
    const msgs = stepMessages(S("summary"), env, "https://app.test", "ยังรอคำตอบข้อนี้อยู่นะ");
    expect(msgs).toHaveLength(2);
    expect(texts(msgs[0])).toEqual(["ยังรอคำตอบข้อนี้อยู่นะ"]);
    expect(postbacks(msgs[1]).map((p) => p.a)).toContain("x_confirm");
  });

  it("other steps send one question", () => {
    expect(stepMessages(S("payer", { payer: "" }), env, "https://app.test")).toHaveLength(1);
  });
});
