import { describe, it, expect } from "vitest";
import { stripPolitePrefix, matchKeyword, hasDigit } from "./line-text";

describe("stripPolitePrefix", () => {
  it("removes ขอดู and ขอ, even stacked", () => {
    expect(stripPolitePrefix("ขอดูแพลนพรุ่งนี้")).toBe("แพลนพรุ่งนี้");
    expect(stripPolitePrefix("ขอแพลน")).toBe("แพลน");
    expect(stripPolitePrefix("ขอดูขอแพลน")).toBe("แพลน");
    expect(stripPolitePrefix("ขอ ขอดู แพลน พรุ่งนี้")).toBe("แพลน พรุ่งนี้");
  });

  it("returns empty for a message that is only polite words", () => {
    expect(stripPolitePrefix("ขอดูขอ")).toBe("");
  });

  it("trims and collapses repeated whitespace", () => {
    expect(stripPolitePrefix("   แพลน    พรุ่งนี้  ")).toBe("แพลน พรุ่งนี้");
  });

  it("leaves text without a polite prefix alone", () => {
    expect(stripPolitePrefix("120 ข้าว")).toBe("120 ข้าว");
  });
});

describe("matchKeyword", () => {
  it("prefers the longer keyword (ข้อมูลด่วน over ข้อมูล)", () => {
    expect(matchKeyword("ข้อมูลด่วน wifi", ["ข้อมูล", "ข้อมูลด่วน"])).toEqual({ keyword: "ข้อมูลด่วน", rest: "wifi" });
  });

  it("prefers the longer keyword (ร้านอาหาร over ร้าน)", () => {
    expect(matchKeyword("ร้านอาหาร มงก๊ก", ["ร้าน", "ร้านอาหาร"])).toEqual({ keyword: "ร้านอาหาร", rest: "มงก๊ก" });
    expect(matchKeyword("ร้าน มงก๊ก", ["ร้าน", "ร้านอาหาร"])).toEqual({ keyword: "ร้าน", rest: "มงก๊ก" });
  });

  it("ignores case and returns the keyword as listed", () => {
    expect(matchKeyword("PLAN 20/11", ["plan"])).toEqual({ keyword: "plan", rest: "20/11" });
  });

  it("matches Thai keywords glued to the rest of the text", () => {
    expect(matchKeyword("แพลนพรุ่งนี้", ["แพลน"])).toEqual({ keyword: "แพลน", rest: "พรุ่งนี้" });
  });

  it("strips polite prefixes before matching", () => {
    expect(matchKeyword("ขอดูแพลนพรุ่งนี้", ["แพลน"])).toEqual({ keyword: "แพลน", rest: "พรุ่งนี้" });
  });

  it("requires a word boundary after an English keyword", () => {
    expect(matchKeyword("planet", ["plan"])).toBeNull();
    expect(matchKeyword("nowhere", ["now"])).toBeNull();
  });

  it("only matches at the start", () => {
    expect(matchKeyword("ดูเมนู", ["เมนู"])).toBeNull();
  });

  it("returns empty rest when the keyword is the whole message", () => {
    expect(matchKeyword("โน้ต", ["โน้ต"])).toEqual({ keyword: "โน้ต", rest: "" });
  });

  it("ignores empty keywords", () => {
    expect(matchKeyword("อะไรก็ได้", [""])).toBeNull();
  });
});

describe("hasDigit", () => {
  it("detects Arabic and Thai digits", () => {
    expect(hasDigit("ข้าว 120")).toBe(true);
    expect(hasDigit("ข้าว ๑๒๐")).toBe(true);
  });

  it("is false without digits", () => {
    expect(hasDigit("สวัสดี")).toBe(false);
    expect(hasDigit("")).toBe(false);
  });
});
