import { describe, it, expect } from "vitest";
import { classifyValue, telUri, sortQuickInfo, searchQuickInfo, sortNotes, searchNotes, noteTitle, nonEmptyLines, bigTextSize } from "./line-info";
import { mkQuickInfo, mkNote } from "./line-view.test-helpers";

describe("classifyValue", () => {
  it.each([
    ["เบอร์โรงแรม", "+852 2345 6789", "phone"],
    ["ฉุกเฉิน", "999", "phone"],
    ["เบอร์", "081-234-5678", "phone"],
    ["เว็บ", "https://example.com/x", "url"],
    ["ที่อยู่โรงแรม", "17 Science Museum Rd", "address"],
    ["ที่พัก", "彌敦道 123號", "address"],
    ["ร้าน", "88 Queen's Road Central", "address"],
    ["Hotel", "ICON", "address"],
    ["กรมธรรม์", "POL-2291-TH", "text"],
    ["wifi", "pass: abc12345", "text"],
    ["x", "12", "text"],
  ])("%s / %s → %s", (label, value, expected) => {
    expect(classifyValue(label, value)).toBe(expected);
  });
});

describe("telUri", () => {
  it("keeps digits and +", () => expect(telUri("+852 2345-6789")).toBe("tel:+85223456789"));
});

describe("quick info sort/search", () => {
  const rows = [
    mkQuickInfo({ id: "a", label: "wifi", value: "HK-5G", sort_order: 1 }),
    mkQuickInfo({ id: "b", label: "ที่อยู่", value: "Nathan Rd", sort_order: 0 }),
    mkQuickInfo({ id: "c", label: "ฉุกเฉิน", value: "999", pinned: true, sort_order: 5 }),
  ];
  it("pinned first, then sort_order", () => expect(sortQuickInfo(rows).map((r) => r.id)).toEqual(["c", "b", "a"]));
  it("search label and value", () => {
    expect(searchQuickInfo(rows, "WIFI").map((r) => r.id)).toEqual(["a"]);
    expect(searchQuickInfo(rows, "nathan").map((r) => r.id)).toEqual(["b"]);
    expect(searchQuickInfo(rows, "")).toHaveLength(3);
  });
});

describe("notes sort/search/title", () => {
  const rows = [
    mkNote({ id: "a", title: "วีซ่า", content: "ไม่ต้องใช้", sort_order: 2 }),
    mkNote({ id: "b", title: "", content: "\n  ของฝาก\nขนม", sort_order: 1 }),
  ];
  it("sorts by sort_order", () => expect(sortNotes(rows).map((r) => r.id)).toEqual(["b", "a"]));
  it("searches title and content", () => {
    expect(searchNotes(rows, "วีซ่า").map((r) => r.id)).toEqual(["a"]);
    expect(searchNotes(rows, "ขนม").map((r) => r.id)).toEqual(["b"]);
  });
  it("noteTitle falls back to the first content line", () => {
    expect(noteTitle(rows[0])).toBe("วีซ่า");
    expect(noteTitle(rows[1])).toBe("ของฝาก");
    expect(noteTitle(mkNote())).toBe("(ไม่มีหัวข้อ)");
  });
  it("nonEmptyLines", () => expect(nonEmptyLines("\n a \n\n b")).toEqual(["a", "b"]));
});

describe("bigTextSize", () => {
  it("picks a size by length", () => {
    expect(bigTextSize("x".repeat(20))).toBe("5xl");
    expect(bigTextSize("x".repeat(21))).toBe("4xl");
    expect(bigTextSize("x".repeat(60))).toBe("4xl");
    expect(bigTextSize("x".repeat(61))).toBe("3xl");
  });
});
