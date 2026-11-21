import { CLAY, txt, compact, flexMessage, textMessage, quickReply, postbackAction, type FlexNode } from "@/lib/line-flex";
import type { Route } from "@/lib/line-router";

// Menu / how-to card plus the bot's shared one-line replies. Pure.

export const HINT_TEXT = "ไม่เข้าใจ ลองพิมพ์ เช่น 120 บาท ข้าว หรือพิมพ์ เมนู";
export const NO_TRIP_TEXT = 'ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ';
export const WIP_TEXT = "ฟีเจอร์นี้กำลังพัฒนา";

export const MENU_SHORTCUTS: { label: string; data: Record<string, string> }[] = [
  { label: "📅 แพลนวันนี้", data: { a: "menu_go", t: "plan" } },
  { label: "⏭ ต่อไป", data: { a: "menu_go", t: "plan", q: "ต่อไป" } },
  { label: "🎫 การจอง", data: { a: "menu_go", t: "booking" } },
  { label: "🍜 ร้าน", data: { a: "menu_go", t: "places", k: "r" } },
  { label: "📍 ที่เที่ยว", data: { a: "menu_go", t: "places", k: "w" } },
  { label: "ℹ️ ข้อมูลด่วน", data: { a: "menu_go", t: "info" } },
  { label: "📝 โน้ต", data: { a: "menu_go", t: "notes" } },
  { label: "🚌 การเดินทาง", data: { a: "menu_go", t: "transport" } },
];

function header(title: string): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: CLAY.coral,
    paddingAll: "14px",
    contents: compact([txt(title, { weight: "bold", size: "lg", color: "#FFFFFF" })]),
  };
}

function expenseBubble(): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    header: header("💸 บันทึกค่าใช้จ่าย"),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      paddingAll: "16px",
      contents: compact([
        txt("พิมพ์ยอด + รายละเอียด เช่น", { size: "sm", color: CLAY.muted }),
        txt("120 บาท ข้าว หาร", { size: "md", weight: "bold", color: CLAY.ink }),
        txt("500 บาท เซเว่น ฝาก 20", { size: "md", weight: "bold", color: CLAY.ink }),
        txt("📸 หรือส่งรูปสลิปมาได้เลย", { size: "sm", color: CLAY.ink, margin: "md" }),
        txt("คำสั่ง: ทำต่อ · แก้ล่าสุด · ยกเลิก", { size: "sm", color: CLAY.muted, margin: "md" }),
      ]),
    },
  };
}

function viewBubble(): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    header: header("🔎 ดูข้อมูล"),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      paddingAll: "12px",
      contents: MENU_SHORTCUTS.map((s) => ({
        type: "button",
        style: "secondary",
        height: "sm",
        color: CLAY.card,
        action: postbackAction(s.label, s.data, s.label),
      })),
    },
  };
}

export function buildMenuMessage(): FlexNode {
  return flexMessage("เมนู TravelAss", { type: "carousel", contents: [expenseBubble(), viewBubble()] });
}

// Postback `a=menu_go&t=<route kind>[&k=r|w][&q=<rest>]` -> Route.
export function menuGoRoute(data: Record<string, string>): Route | null {
  const q = data.q ?? "";
  switch (data.t) {
    case "plan": return { kind: "plan", rest: q };
    case "booking": return { kind: "booking", rest: q };
    case "places": return { kind: "places", placeKind: data.k === "w" ? "w" : "r", rest: q };
    case "info": return { kind: "info", rest: q };
    case "notes": return { kind: "notes", rest: q };
    case "transport": return { kind: "transport", rest: q, next: false };
    default: return null;
  }
}

const AMBIGUITY_QUESTION = { booking: "ค้นการจอง", places: "ค้นร้าน/ที่เที่ยว", transport: "ดูการเดินทาง" } as const;
const AMBIGUITY_BUTTON = { booking: "🎫 ค้นการจอง", places: "🍜 ค้นร้าน/ที่เที่ยว", transport: "🚌 ดูการเดินทาง" } as const;

export function buildAmbiguityMessage(target: "booking" | "places" | "transport", text: string): FlexNode {
  return textMessage(
    `บันทึกค่าใช้จ่าย หรือ ${AMBIGUITY_QUESTION[target]}?`,
    quickReply([
      { label: "💸 บันทึกค่าใช้จ่าย", data: { a: "amb_expense", q: text } },
      { label: AMBIGUITY_BUTTON[target], data: { a: "amb_go", t: target, q: text } },
    ]),
  );
}
