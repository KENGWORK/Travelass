import { describe, it, expect } from "vitest";
import { classifyText, commandRoute, isViewCommand, type RouteCtx } from "./line-router";

const DATE_CTX = { start: "2026-11-19", end: "2026-11-24", today: "2026-11-20" };
const never = () => false;
const always = () => true;

function ctx(over: Partial<RouteCtx> = {}): RouteCtx {
  return { flowStep: null, isFlowAnswer: never, isGroup: true, dateCtx: DATE_CTX, ...over };
}

describe("step 1: pending flow answer", () => {
  it("routes to flow_answer when the flow accepts the text", () => {
    expect(classifyText("เก่ง", ctx({ flowStep: "awaiting_name", isFlowAnswer: always }))).toEqual({ kind: "flow_answer" });
  });

  it("flow_answer beats commands when the flow claims the text", () => {
    expect(classifyText("แพลน", ctx({ flowStep: "awaiting_note", isFlowAnswer: always }))).toEqual({ kind: "flow_answer" });
  });

  it("ignores isFlowAnswer when there is no flow", () => {
    expect(classifyText("เก่ง", ctx({ flowStep: null, isFlowAnswer: always }))).toEqual({ kind: "ignore" });
  });
});

describe("step 2: view commands", () => {
  it.each([
    ["เมนู", { kind: "menu" }],
    ["?", { kind: "menu" }],
    ["แพลน", { kind: "plan", rest: "" }],
    ["PLAN", { kind: "plan", rest: "" }],
    ["แพลน 20/11", { kind: "plan", rest: "20/11" }],
    ["แพลน พรุ่งนี้ 2", { kind: "plan", rest: "พรุ่งนี้ 2" }],
    ["ขอดูแพลนพรุ่งนี้", { kind: "plan", rest: "พรุ่งนี้" }],
    ["ต่อไป", { kind: "plan", rest: "ต่อไป" }],
    ["next", { kind: "plan", rest: "next" }],
    ["ตอนนี้", { kind: "plan", rest: "ตอนนี้" }],
    ["ขอดู now", { kind: "plan", rest: "now" }],
    ["#2", { kind: "plan", rest: "#2" }],
    ["ข้อมูล wifi 5G", { kind: "info", rest: "wifi 5G" }],
    ["ข้อมูลด่วน", { kind: "info", rest: "" }],
    ["โน้ต วีซ่า", { kind: "notes", rest: "วีซ่า" }],
    ["โน๊ต", { kind: "notes", rest: "" }],
    ["คู่มือการใช้งาน", { kind: "guide", topic: null }],
    ["คู่มือ", { kind: "guide", topic: null }],
    ["ขอดูคู่มือ", { kind: "guide", topic: null }],
    ["คู่มือ แพลน", { kind: "guide", topic: "plan" }],
    ["คู่มือ ตั๋ว", { kind: "guide", topic: "booking" }],
    ["คู่มือ ค่าใช้จ่าย", { kind: "guide", topic: "expense" }],
    ["คู่มือ 2", { kind: "guide", topic: null }],
  ])("%s", (text, route) => {
    expect(classifyText(text, ctx())).toEqual(route);
  });

  it("a pending flow does not block view commands, including the guide", () => {
    expect(classifyText("แพลน", ctx({ flowStep: "amount", isFlowAnswer: never }))).toEqual({ kind: "plan", rest: "" });
    expect(classifyText("คู่มือ", ctx({ flowStep: "missing", isFlowAnswer: never }))).toEqual({ kind: "guide", topic: null });
    expect(classifyText("คู่มือ จอง", ctx({ flowStep: "missing", isFlowAnswer: never }))).toEqual({ kind: "guide", topic: "booking" });
  });

  it("the guide works in a group and in 1:1 alike", () => {
    expect(classifyText("คู่มือ", ctx({ isGroup: true }))).toEqual({ kind: "guide", topic: null });
    expect(classifyText("คู่มือ", ctx({ isGroup: false }))).toEqual({ kind: "guide", topic: null });
  });

  it("'planet' is not the plan command", () => {
    expect(classifyText("planet", ctx({ isGroup: false }))).toEqual({ kind: "hint" });
  });

  it("'?' only opens the menu as the whole message", () => {
    expect(classifyText("  ?  ", ctx())).toEqual({ kind: "menu" });
    expect(classifyText("?ราคา", ctx())).toEqual({ kind: "ignore" });
    expect(classifyText("? 120", ctx())).toEqual({ kind: "expense_new", text: "? 120" });
  });
});

describe("isViewCommand", () => {
  it.each(["แพลน", "plan 20/11", "ต่อไป", "next", "ตอนนี้", "now", "#2", "เมนู", "?", "ข้อมูล wifi", "ข้อมูลด่วน", "โน้ต", "โน๊ต", "ขอดูแพลน", "คู่มือ", "คู่มือการใช้งาน", "คู่มือ แพลน", "ขอดูคู่มือ"])(
    "%s is a view command",
    (text) => expect(isViewCommand(text)).toBe(true),
  );

  it.each(["เก่ง", "ค่าแท็กซี่", "ข้าม", "120 ข้าว", "?ราคา", "ร้านนี้อร่อย", "กินข้าว", "จอง", "ตั๋วรถ 50", "เอกสาร", "ที่เที่ยว", "อยากไป", "สถานที่", "เดินทาง", "รอบต่อไป", "ทำคู่มือ"])(
    "%s is not a view command",
    (text) => expect(isViewCommand(text)).toBe(false),
  );
});

describe("step 3: collision commands", () => {
  it.each([
    ["ตั๋วรถ 50", { kind: "ambiguous", target: "booking", text: "ตั๋วรถ 50" }],
    ["กินข้าว 120", { kind: "ambiguous", target: "places", text: "กินข้าว 120" }],
    ["เดินทาง 2 ทุ่ม", { kind: "ambiguous", target: "transport", text: "เดินทาง 2 ทุ่ม" }],
  ])("%s -> ambiguous", (text, route) => {
    expect(classifyText(text, ctx())).toEqual(route);
  });

  it.each([
    ["จอง 21/11", { kind: "booking", rest: "21/11" }],
    ["จอง วันที่ 3", { kind: "booking", rest: "วันที่ 3" }],
    ["จอง", { kind: "booking", rest: "" }],
    ["ตั๋วเครื่อง", { kind: "booking", rest: "เครื่อง" }],
    ["การจองโรงแรม", { kind: "booking", rest: "โรงแรม" }],
    ["เอกสารการจองโรงแรม", { kind: "booking", rest: "การจองโรงแรม" }],
    ["ตั๋ว ดิสนีย์", { kind: "booking", rest: "ดิสนีย์" }],
    ["ร้าน", { kind: "places", placeKind: "r", rest: "" }],
    ["ร้านอาหาร มงก๊ก", { kind: "places", placeKind: "r", rest: "มงก๊ก" }],
    ["กิน", { kind: "places", placeKind: "r", rest: "" }],
    ["ที่เที่ยว ดาว", { kind: "places", placeKind: "w", rest: "ดาว" }],
    ["อยากไป", { kind: "places", placeKind: "w", rest: "" }],
    ["สถานที่", { kind: "places", placeKind: "w", rest: "" }],
    ["เดินทาง", { kind: "transport", rest: "", next: false }],
    ["การเดินทาง", { kind: "transport", rest: "", next: false }],
    ["เดินทาง พรุ่งนี้", { kind: "transport", rest: "พรุ่งนี้", next: false }],
    ["เดินทาง 21/11", { kind: "transport", rest: "21/11", next: false }],
    ["รอบต่อไป", { kind: "transport", rest: "", next: true }],
    ["รถรอบถัดไป", { kind: "transport", rest: "", next: true }],
  ])("%s", (text, route) => {
    expect(classifyText(text, ctx())).toEqual(route);
  });

  it("an amount after a date is not eaten as the year", () => {
    expect(classifyText("ตั๋ว 20 พ.ย. 1500", ctx())).toEqual({ kind: "ambiguous", target: "booking", text: "ตั๋ว 20 พ.ย. 1500" });
  });

  it("an impossible date still counts as a number", () => {
    expect(classifyText("จอง 31/2", ctx())).toEqual({ kind: "ambiguous", target: "booking", text: "จอง 31/2" });
  });

  it("still strips dates when there is no active trip (dateCtx null)", () => {
    expect(classifyText("จอง 21/11", ctx({ dateCtx: null }))).toEqual({ kind: "booking", rest: "21/11" });
    expect(classifyText("ตั๋วรถ 50", ctx({ dateCtx: null }))).toEqual({ kind: "ambiguous", target: "booking", text: "ตั๋วรถ 50" });
  });
});

describe("step 3.5: expense commands", () => {
  it.each(["ทำต่อ", "แก้ล่าสุด", "ยกเลิก"])("%s -> expense_new", (text) => {
    expect(classifyText(text, ctx())).toEqual({ kind: "expense_new", text });
  });

  it("needs an exact match", () => {
    expect(classifyText("ยกเลิกแล้วนะ", ctx())).toEqual({ kind: "ignore" });
  });
});

describe("steps 4-6: numbers, pending flow, fallback", () => {
  it("120 ข้าว -> expense_new", () => {
    expect(classifyText("120 ข้าว", ctx())).toEqual({ kind: "expense_new", text: "120 ข้าว" });
  });

  it("pending flow + a non-answer with a number -> flow_conflict", () => {
    expect(classifyText("50 ข้าว", ctx({ flowStep: "split", isFlowAnswer: never }))).toEqual({ kind: "flow_conflict", text: "50 ข้าว" });
  });

  it("pending flow + unrelated text -> flow_reask", () => {
    expect(classifyText("สวัสดี", ctx({ flowStep: "split", isFlowAnswer: never }))).toEqual({ kind: "flow_reask" });
  });

  it("group + small talk -> ignore", () => {
    expect(classifyText("สวัสดี", ctx({ isGroup: true }))).toEqual({ kind: "ignore" });
  });

  it("1:1 + small talk -> hint", () => {
    expect(classifyText("สวัสดี", ctx({ isGroup: false }))).toEqual({ kind: "hint" });
  });

  it("empty text -> ignore in a group", () => {
    expect(classifyText("", ctx())).toEqual({ kind: "ignore" });
  });
});

describe("commandRoute (amb_go)", () => {
  it("rebuilds the feature route from the original text", () => {
    expect(commandRoute("booking", "ตั๋วรถ 50")).toEqual({ kind: "booking", rest: "รถ 50" });
    expect(commandRoute("places", "กินข้าว 120")).toEqual({ kind: "places", placeKind: "r", rest: "ข้าว 120" });
    expect(commandRoute("places", "ที่เที่ยว 3 ที่")).toEqual({ kind: "places", placeKind: "w", rest: "3 ที่" });
    expect(commandRoute("transport", "รอบต่อไป 5")).toEqual({ kind: "transport", rest: "5", next: true });
  });

  it("falls back to the whole text when the keyword doesn't match the target", () => {
    expect(commandRoute("booking", "ขอดู 50 อะไร")).toEqual({ kind: "booking", rest: "50 อะไร" });
    expect(commandRoute("places", "xyz")).toEqual({ kind: "places", placeKind: "r", rest: "xyz" });
    expect(commandRoute("transport", "xyz")).toEqual({ kind: "transport", rest: "xyz", next: false });
  });
});
