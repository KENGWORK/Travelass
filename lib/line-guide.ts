// lib/line-guide.ts
// คู่มือการใช้งาน: static help cards. Pure. Imports only the flex / text
// helpers (the router and the menu import THIS file).
import { CLAY, clipboardAction, compact, flexMessage, messageAction, postbackAction, txt, type FlexNode } from "@/lib/line-flex";
import { matchKeyword } from "@/lib/line-text";

export type GuideTopic = "expense" | "plan" | "booking" | "places" | "info" | "transport" | "other";

// Longest first is handled by matchKeyword; listed here for the router-consistency test.
export const GUIDE_KEYWORDS = ["คู่มือการใช้งาน", "คู่มือ"] as const;

export interface GuideTopicData {
  id: GuideTopic;
  title: string;
  aliases: readonly string[];                       // what can follow "คู่มือ "
  commands: { cmd: string; does: string }[];        // 4-6 rows: type → get
  examples: string[];                               // 2-3
  tries: { label: string; text: string }[];         // [ลองเลย]: ONLY side-effect-free view commands
  copy?: string;                                    // [คัดลอกตัวอย่าง] (the expense topic: a tap must not save)
}

export const GUIDE_TOPICS: GuideTopicData[] = [
  {
    id: "expense",
    title: "💸 บันทึกค่าใช้จ่าย",
    aliases: ["ค่าใช้จ่าย", "บันทึกค่าใช้จ่าย", "จ่าย", "เงิน", "สลิป"],
    commands: [
      { cmd: "120 บาท ข้าว", does: "บันทึก บอทถามเฉพาะที่ขาดในการ์ดใบเดียว" },
      { cmd: "120 HKD ข้าว หาร", does: "หารเท่า ครบแล้วบันทึกเลย" },
      { cmd: "500 บาท เซเว่น ฝาก 20", does: "หารไม่เท่า อีกคนฝากจ่าย 20" },
      { cmd: "ส่งรูปสลิป", does: "บอทรับรูป แล้วถามยอด" },
      { cmd: "ทำต่อ · ยกเลิก", does: "กรอกรายการที่ค้างต่อ · ลบหรือเก็บไว้" },
      { cmd: "แก้ล่าสุด", does: "เปิดการ์ดรายการล่าสุด กด แก้ / ลบ" },
    ],
    examples: ["120 บาท ข้าวมันไก่ ไม่หาร", "120 HKD ข้าว หาร", "500 บาท เซเว่น ฝาก 20"],
    tries: [],
    copy: "120 HKD ข้าว หาร",
  },
  {
    id: "plan",
    title: "📅 แพลน",
    aliases: ["แพลน", "plan", "ต่อไป"],
    commands: [
      { cmd: "แพลน · plan", does: "แพลนวันนี้" },
      { cmd: "แพลน พรุ่งนี้ · แพลน 20/11", does: "แพลนของวันนั้น" },
      { cmd: "แพลน 2 · #2", does: "รายละเอียดรายการที่ 2" },
      { cmd: "ต่อไป · next", does: "รายการถัดไปจากเวลาตอนนี้" },
      { cmd: "ตอนนี้ · now", does: "รายการที่อยู่ในช่วงเวลานี้" },
    ],
    examples: ["แพลน พรุ่งนี้", "แพลน วันที่ 3"],
    tries: [{ label: "ลอง แพลน", text: "แพลน" }, { label: "ลอง ต่อไป", text: "ต่อไป" }],
  },
  {
    id: "booking",
    title: "🎫 ตั๋วและการจอง",
    aliases: ["จอง", "ตั๋ว", "เอกสาร", "การจอง"],
    commands: [
      { cmd: "จอง · ตั๋ว · เอกสาร", does: "การจองทั้งหมด" },
      { cmd: "ตั๋วเครื่อง", does: "เฉพาะเครื่องบิน" },
      { cmd: "การจองโรงแรม", does: "เฉพาะโรงแรม" },
      { cmd: "ตั๋ว ดิสนีย์", does: "ค้นชื่อ / เลขจอง" },
      { cmd: "จอง พรุ่งนี้ · จอง 21/11", does: "การจองของวันนั้น" },
    ],
    examples: ["จอง", "ตั๋วเครื่อง", "จอง 21/11"],
    tries: [{ label: "ลองเลย", text: "จอง" }],
  },
  {
    id: "places",
    title: "🍜 ร้านและที่เที่ยว",
    aliases: ["ร้าน", "ร้านอาหาร", "ที่เที่ยว", "กิน", "อยากไป", "สถานที่"],
    commands: [
      { cmd: "ร้าน · ร้านอาหาร · กิน", does: "ร้านอาหารที่บันทึกไว้" },
      { cmd: "ที่เที่ยว · อยากไป · สถานที่", does: "ที่ที่อยากไป" },
      { cmd: "ร้าน มงก๊ก", does: "กรองย่าน / ค้นชื่อ" },
      { cmd: "ร้าน ต้องลอง", does: "เฉพาะที่ติดดาว" },
      { cmd: "ร้าน ยังไม่ไป", does: "เฉพาะที่ยังไม่ได้ไป" },
    ],
    examples: ["ร้าน", "ที่เที่ยว ดาว"],
    tries: [{ label: "ลอง ร้าน", text: "ร้าน" }, { label: "ลอง ที่เที่ยว", text: "ที่เที่ยว" }],
  },
  {
    id: "info",
    title: "ℹ️ ข้อมูลด่วนและโน้ต",
    aliases: ["ข้อมูล", "ข้อมูลด่วน", "โน้ต", "โน๊ต"],
    commands: [
      { cmd: "ข้อมูล · ข้อมูลด่วน", does: "ข้อมูลด่วนทั้งหมด (wifi เบอร์ ฯลฯ)" },
      { cmd: "ข้อมูล wifi", does: "ค้นหัวข้อ / ค่า" },
      { cmd: "โน้ต · โน๊ต", does: "รายการโน้ต" },
      { cmd: "โน้ต วีซ่า", does: "ค้นหัวข้อ / เนื้อหา" },
    ],
    examples: ["ข้อมูล wifi", "โน้ต วีซ่า"],
    tries: [{ label: "ลอง ข้อมูล", text: "ข้อมูล" }, { label: "ลอง โน้ต", text: "โน้ต" }],
  },
  {
    id: "transport",
    title: "🚌 การเดินทาง",
    aliases: ["เดินทาง", "การเดินทาง"],
    commands: [
      { cmd: "เดินทาง · การเดินทาง", does: "การเดินทางวันนี้" },
      { cmd: "เดินทาง พรุ่งนี้", does: "การเดินทางของวันนั้น" },
      { cmd: "เดินทาง ดิสนีย์", does: "ค้นต้นทาง / ปลายทาง" },
      { cmd: "รอบต่อไป · รถรอบถัดไป", does: "เที่ยวถัดไปของวันนี้" },
    ],
    examples: ["เดินทาง", "รอบต่อไป"],
    tries: [{ label: "ลองเลย", text: "เดินทาง" }],
  },
  {
    id: "other",
    title: "⚙️ อื่นๆ",
    aliases: ["อื่นๆ", "เมนู"],
    commands: [
      { cmd: "เมนู · ?", does: "การ์ดเมนูและปุ่มลัด" },
      { cmd: "คู่มือการใช้งาน · คู่มือ", does: "คู่มือนี้ (คู่มือ แพลน = เฉพาะหัวข้อ)" },
      { cmd: "ขอดู / ขอ นำหน้า", does: "ใช้กับคำสั่งดูข้อมูลได้ เช่น ขอดูแพลน" },
      { cmd: "ทริปที่ใช้", does: 'บอทใช้ทริปที่สถานะ "กำลังเที่ยว"' },
      { cmd: "แก้ไขข้อมูล", does: "ทำในแอป (LINE ทำได้แค่บันทึกค่าใช้จ่าย ติ๊กแพลน ติ๊กร้านว่าไปแล้ว)" },
    ],
    examples: ["เมนู", "คู่มือ แพลน"],
    tries: [],
  },
];

export function topicFromId(id: string | undefined): GuideTopic | null {
  return GUIDE_TOPICS.find((t) => t.id === id)?.id ?? null;
}

// "คู่มือ" / "คู่มือการใช้งาน" (+ optional "ขอดู" prefix) → the whole guide;
// "คู่มือ <หัวข้อ>" → that topic; an unknown word after it → the whole guide.
export function matchGuide(text: string): { topic: GuideTopic | null } | null {
  const m = matchKeyword(text, GUIDE_KEYWORDS);
  if (!m) return null;
  const word = m.rest.trim().toLowerCase();
  if (!word) return { topic: null };
  const topic = GUIDE_TOPICS.find((t) => t.aliases.some((a) => a.toLowerCase() === word));
  return { topic: topic?.id ?? null };
}

function header(title: string): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: CLAY.coral,
    paddingAll: "14px",
    contents: compact<FlexNode>([txt(title, { weight: "bold", size: "lg", color: "#FFFFFF" })]),
  };
}

const button = (action: FlexNode, style: "secondary" | "link" = "secondary"): FlexNode => ({
  type: "button", style, height: "sm", ...(style === "secondary" ? { color: CLAY.card } : {}), action,
});

function commandRow(cmd: string, does: string): FlexNode {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: compact<FlexNode>([
      txt(cmd, { size: "sm", weight: "bold", color: CLAY.ink, flex: 5 }),
      txt(does, { size: "sm", color: CLAY.muted, flex: 5 }),
    ]),
  };
}

function topicBubble(t: GuideTopicData, withContentsButton: boolean): FlexNode {
  const buttons = compact<FlexNode>([
    ...t.tries.map((x) => button(messageAction(x.label, x.text))),
    t.copy ? button(clipboardAction("คัดลอกตัวอย่าง", t.copy)) : null,
    withContentsButton ? button(postbackAction("📖 สารบัญคู่มือ", { a: "menu_go", t: "guide" }), "link") : null,
  ]);
  return {
    type: "bubble",
    size: "kilo",
    header: header(t.title),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      paddingAll: "14px",
      contents: compact<FlexNode>([
        txt("พิมพ์ → ได้อะไร", { size: "xs", color: CLAY.muted }),
        ...t.commands.map((c) => commandRow(c.cmd, c.does)),
        txt("ตัวอย่าง", { size: "xs", color: CLAY.muted, margin: "md" }),
        ...t.examples.map((x) => txt(x, { size: "sm", color: CLAY.ink })),
      ]),
    },
    ...(buttons.length > 0 ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "10px", contents: buttons } } : {}),
  };
}

function contentsBubble(): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    header: header("📖 คู่มือการใช้งาน"),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      paddingAll: "12px",
      contents: compact<FlexNode>([
        txt("เลือกหัวข้อ หรือเลื่อนดูทีละใบ →", { size: "sm", color: CLAY.muted }),
        ...GUIDE_TOPICS.map((t) => button(postbackAction(t.title, { a: "menu_go", t: "guide", q: t.id }))),
      ]),
    },
  };
}

export function buildGuideMessage(topic: GuideTopic | null): FlexNode {
  const found = GUIDE_TOPICS.find((t) => t.id === topic);
  if (found) return flexMessage(`คู่มือ: ${found.title}`, topicBubble(found, true));
  return flexMessage("คู่มือการใช้งาน", {
    type: "carousel",
    contents: [contentsBubble(), ...GUIDE_TOPICS.map((t) => topicBubble(t, false))],
  });
}
