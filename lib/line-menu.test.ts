import { describe, it, expect } from "vitest";
import {
  HINT_TEXT,
  NO_TRIP_TEXT,
  WIP_TEXT,
  MENU_SHORTCUTS,
  buildMenuMessage,
  menuGoRoute,
  buildAmbiguityMessage,
} from "./line-menu";
import { decodePostback, type FlexNode } from "./line-flex";

describe("copy", () => {
  it("uses the exact spec wording", () => {
    expect(HINT_TEXT).toBe("ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ คู่มือการใช้งาน");
    expect(NO_TRIP_TEXT).toBe('ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ');
    expect(WIP_TEXT).toBe("ฟีเจอร์นี้กำลังพัฒนา");
  });
});

describe("buildMenuMessage", () => {
  const msg = buildMenuMessage();
  const json = JSON.stringify(msg);
  const carousel = msg.contents as FlexNode;

  it("is a flex carousel with 2 bubbles", () => {
    expect(msg.type).toBe("flex");
    expect(carousel.type).toBe("carousel");
    expect((carousel.contents as FlexNode[]).length).toBe(2);
  });

  it("bubble 1 teaches expense capture", () => {
    for (const s of ["บันทึกค่าใช้จ่าย", "120 บาท ข้าว หาร", "500 บาท เซเว่น ฝาก 20", "สลิป", "ทำต่อ", "แก้ล่าสุด", "ยกเลิก"]) {
      expect(json).toContain(s);
    }
  });

  it("bubble 1 has the คู่มือการใช้งาน button (menu_go → guide)", () => {
    const bubble1 = (carousel.contents as FlexNode[])[0];
    const footerButtons = ((bubble1.footer as FlexNode).contents as FlexNode[]).filter((n) => n.type === "button");
    expect(footerButtons).toHaveLength(1);
    const action = footerButtons[0].action as FlexNode;
    expect(action.label).toBe("📖 คู่มือการใช้งาน");
    expect(decodePostback(action.data as string)).toEqual({ a: "menu_go", t: "guide" });
  });

  it("bubble 2 has one menu_go postback button per shortcut", () => {
    const bubble2 = (carousel.contents as FlexNode[])[1];
    const buttons = ((bubble2.body as FlexNode).contents as FlexNode[]).filter((n) => n.type === "button");
    expect(buttons).toHaveLength(8);
    const datas = buttons.map((b) => decodePostback((b.action as FlexNode).data as string));
    expect(datas.every((d) => d.a === "menu_go")).toBe(true);
    expect(datas.map((d) => d.t)).toEqual(["plan", "plan", "booking", "places", "places", "info", "notes", "transport"]);
  });

  it("has no empty text nodes", () => {
    expect(json).not.toContain('"text":""');
  });
});

describe("menuGoRoute", () => {
  it("maps the guide, with or without a topic", () => {
    expect(menuGoRoute({ a: "menu_go", t: "guide" })).toEqual({ kind: "guide", topic: null });
    expect(menuGoRoute({ a: "menu_go", t: "guide", q: "plan" })).toEqual({ kind: "guide", topic: "plan" });
    expect(menuGoRoute({ a: "menu_go", t: "guide", q: "bogus" })).toEqual({ kind: "guide", topic: null });
  });

  it("maps every shortcut to a route", () => {
    expect(MENU_SHORTCUTS.map((s) => menuGoRoute(s.data))).toEqual([
      { kind: "plan", rest: "" },
      { kind: "plan", rest: "ต่อไป" },
      { kind: "booking", rest: "" },
      { kind: "places", placeKind: "r", rest: "" },
      { kind: "places", placeKind: "w", rest: "" },
      { kind: "info", rest: "" },
      { kind: "notes", rest: "" },
      { kind: "transport", rest: "", next: false },
    ]);
  });

  it("returns null for an unknown target", () => {
    expect(menuGoRoute({ a: "menu_go", t: "nope" })).toBeNull();
    expect(menuGoRoute({ a: "menu_go" })).toBeNull();
  });
});

describe("buildAmbiguityMessage", () => {
  it("asks expense-or-command with two postback quick replies", () => {
    const msg = buildAmbiguityMessage("booking", "ตั๋วรถ 50");
    expect(msg.type).toBe("text");
    expect(msg.text).toBe("บันทึกค่าใช้จ่าย หรือ ค้นการจอง?");
    const items = (msg.quickReply as FlexNode).items as FlexNode[];
    expect(items).toHaveLength(2);
    const [expense, go] = items.map((i) => decodePostback((i.action as FlexNode).data as string));
    expect(expense).toEqual({ a: "amb_expense", q: "ตั๋วรถ 50" });
    expect(go).toEqual({ a: "amb_go", t: "booking", q: "ตั๋วรถ 50" });
    expect((items[0].action as FlexNode).label).toBe("💸 บันทึกค่าใช้จ่าย");
  });

  it("words the question per target", () => {
    expect(buildAmbiguityMessage("places", "กินข้าว 120").text).toBe("บันทึกค่าใช้จ่าย หรือ ค้นร้าน/ที่เที่ยว?");
    expect(buildAmbiguityMessage("transport", "เดินทาง 2 ทุ่ม").text).toBe("บันทึกค่าใช้จ่าย หรือ ดูการเดินทาง?");
  });

  it("keeps postback data within 300 chars for long messages", () => {
    const msg = buildAmbiguityMessage("booking", "ตั๋วรถไฟความเร็วสูง 50 ".repeat(20));
    const items = (msg.quickReply as FlexNode).items as FlexNode[];
    for (const i of items) expect(((i.action as FlexNode).data as string).length).toBeLessThanOrEqual(300);
  });
});
