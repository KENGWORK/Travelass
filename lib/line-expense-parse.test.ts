// lib/line-expense-parse.test.ts
import { describe, it, expect } from "vitest";
import {
  parseExpenseText,
  parseNumber,
  resolveCurrency,
  parseSplitWord,
  guessCategory,
  removeNumberToken,
  expenseCommand,
} from "./line-expense-parse";

describe("parseExpenseText", () => {
  it("reads a lone number as the amount with an empty note", () => {
    expect(parseExpenseText("120")).toEqual({ amount: 120, amountCandidates: [], category: "อื่นๆ", note: "" });
  });

  it("keeps the leftover words as the note and guesses the category", () => {
    expect(parseExpenseText("120 ข้าวมันไก่")).toEqual({ amount: 120, amountCandidates: [], category: "อาหาร", note: "ข้าวมันไก่" });
  });

  it("accepts thousands commas and decimals", () => {
    expect(parseExpenseText("1,200 บาท โรงแรม")).toEqual({ amount: 1200, amountCandidates: [], currency: "THB", category: "ที่พัก", note: "โรงแรม" });
    expect(parseExpenseText("12.5 hkd กาแฟ")).toEqual({ amount: 12.5, amountCandidates: [], currency: "HKD", category: "อาหาร", note: "กาแฟ" });
  });

  it.each([
    ["120 HKD", "HKD"],
    ["120 hk", "HKD"],
    ["120 ดอลฮ่องกง", "HKD"],
    ["120 เหรียญฮ่องกง", "HKD"],
    ["120 บาท", "THB"],
    ["120฿", "THB"],
    ["120 THB", "THB"],
    ["120 thb", "THB"],
    ["120 jpy", "JPY"],
  ])("maps the currency alias in %s to %s", (text, code) => {
    const p = parseExpenseText(text);
    expect(p.currency).toBe(code);
    expect(p.amount).toBe(120);
    expect(p.note).toBe("");
  });

  it("does not read currency codes out of the middle of a word", () => {
    expect(parseExpenseText("taxi 80")).toEqual({ amount: 80, amountCandidates: [], category: "เดินทาง", note: "taxi" });
  });

  it("reads ฝาก N as an unequal split and does not count N as the amount", () => {
    expect(parseExpenseText("500 บาท เซเว่น ฝาก 20")).toEqual({
      amount: 500, amountCandidates: [], currency: "THB",
      split: { mode: "unequal", owedAmount: 20 }, category: "ช้อป", note: "เซเว่น",
    });
  });

  it("accepts ฝากให้ N as a deposit too", () => {
    expect(parseExpenseText("500 บาท ข้าว ฝากให้ 20")).toEqual({
      amount: 500, amountCandidates: [], currency: "THB",
      split: { mode: "unequal", owedAmount: 20 }, category: "อาหาร", note: "ข้าว",
    });
  });

  it("never reads dates or times as amounts, and keeps them in the note", () => {
    expect(parseExpenseText("ข้าว 21/11 120")).toEqual({ amount: 120, amountCandidates: [], category: "อาหาร", note: "ข้าว 21/11" });
    expect(parseExpenseText("กาแฟ 14:30 45")).toEqual({ amount: 45, amountCandidates: [], category: "อาหาร", note: "กาแฟ 14:30" });
  });

  it("does not treat ของฝาก (souvenir) as a deposit", () => {
    const p = parseExpenseText("ซื้อของฝาก 300");
    expect(p.split).toBeUndefined();
    expect(p.amount).toBe(300);
    expect(p.note).toBe("ซื้อของฝาก");
  });

  it("reads หาร / หารเท่า as equal and ไม่หาร as none", () => {
    expect(parseExpenseText("120 HKD ข้าว หาร").split).toEqual({ mode: "equal" });
    expect(parseExpenseText("120 HKD ข้าว หาร").note).toBe("ข้าว");
    expect(parseExpenseText("120 หารเท่า").split).toEqual({ mode: "equal" });
    expect(parseExpenseText("120 บาท ข้าวมันไก่ ไม่หาร")).toEqual({
      amount: 120, amountCandidates: [], currency: "THB", split: { mode: "none" }, category: "อาหาร", note: "ข้าวมันไก่",
    });
  });

  it("reads หารไม่เท่า without an amount as unequal with no owed amount yet", () => {
    expect(parseExpenseText("300 หารไม่เท่า").split).toEqual({ mode: "unequal" });
  });

  it("does not see หาร inside อาหาร", () => {
    const p = parseExpenseText("120 อาหารเช้า");
    expect(p.split).toBeUndefined();
    expect(p.category).toBe("อาหาร");
  });

  it("offers every distinct number as a candidate when there is more than one, keeping them in the note", () => {
    expect(parseExpenseText("50 ข้าว 30 น้ำ")).toEqual({ amountCandidates: [50, 30], category: "อาหาร", note: "50 ข้าว 30 น้ำ" });
  });

  it("does not read 7-11 as numbers", () => {
    expect(parseExpenseText("80 เซเว่น 7-11")).toEqual({ amount: 80, amountCandidates: [], category: "ช้อป", note: "เซเว่น 7-11" });
  });

  it("never uses 0 as the amount", () => {
    expect(parseExpenseText("0 ข้าว").amount).toBeUndefined();
  });
});

describe("parseNumber", () => {
  it("returns the first number, commas removed, zero included", () => {
    expect(parseNumber("1,200")).toBe(1200);
    expect(parseNumber("ฝากให้ 20.5 นะ")).toBe(20.5);
    expect(parseNumber("0")).toBe(0);
    expect(parseNumber("ไม่มี")).toBeNull();
  });
});

describe("resolveCurrency", () => {
  it("accepts a whole-answer alias or supported code", () => {
    expect(resolveCurrency("HKD")).toBe("HKD");
    expect(resolveCurrency(" hk ")).toBe("HKD");
    expect(resolveCurrency("บาท")).toBe("THB");
    expect(resolveCurrency("฿")).toBe("THB");
    expect(resolveCurrency("jpy")).toBe("JPY");
  });

  it("rejects anything that is not just a currency", () => {
    expect(resolveCurrency("hkd อะ")).toBeNull();
    expect(resolveCurrency("ข้าว")).toBeNull();
  });
});

describe("parseSplitWord", () => {
  it("maps exact split answers", () => {
    expect(parseSplitWord("ไม่หาร")).toBe("none");
    expect(parseSplitWord("หาร")).toBe("equal");
    expect(parseSplitWord("หารเท่า")).toBe("equal");
    expect(parseSplitWord("หารไม่เท่า")).toBe("unequal");
    expect(parseSplitWord("หารกัน")).toBeNull();
  });
});

describe("guessCategory", () => {
  it("picks the keyword that appears first, ignoring case", () => {
    expect(guessCategory("ตั๋วรถ")).toBe("ตั๋ว");
    expect(guessCategory("ค่ารถ")).toBe("เดินทาง");
    expect(guessCategory("Taxi")).toBe("เดินทาง");
    expect(guessCategory("dim sum")).toBe("อาหาร");
    expect(guessCategory("Airbnb")).toBe("ที่พัก");
    expect(guessCategory("ไม่รู้")).toBe("อื่นๆ");
  });
});

describe("removeNumberToken", () => {
  it("removes the first token with that value and tidies spaces", () => {
    expect(removeNumberToken("50 ข้าว 30 น้ำ", 30)).toBe("50 ข้าว น้ำ");
    expect(removeNumberToken("1,200 ค่าห้อง 300", 1200)).toBe("ค่าห้อง 300");
    expect(removeNumberToken("ข้าว", 5)).toBe("ข้าว");
  });
});

describe("expenseCommand", () => {
  it("recognises the flow commands exactly", () => {
    expect(expenseCommand("ยกเลิก")).toBe("cancel");
    expect(expenseCommand(" ทำต่อ ")).toBe("resume");
    expect(expenseCommand("แก้ล่าสุด")).toBe("edit_last");
    expect(expenseCommand("ย้อน")).toBe("back");
    expect(expenseCommand("↩ ย้อน")).toBe("back");
    expect(expenseCommand("ยกเลิกนัด")).toBeNull();
  });
});
