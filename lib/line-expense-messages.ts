// lib/line-expense-messages.ts
import type { Category, Expense } from "@/lib/models/types";
import { CATS } from "@/lib/categories";
import { NO_TRIP_TEXT } from "@/lib/line-menu";
import {
  CLAY,
  compact,
  flexMessage,
  imageUrl,
  postbackAction,
  quickReply,
  textMessage,
  txt,
  uriAction,
  type FlexNode,
} from "@/lib/line-flex";
import {
  fmtNum,
  otherMembers,
  partnerFor,
  round2,
  type EditField,
  type FlowData,
  type FlowEnv,
  type FlowState,
} from "@/lib/line-expense-flow";

export const MSG = {
  noTrip: NO_TRIP_TEXT,
  goneExpense: "รายการนี้ถูกลบไปแล้ว",
  expiredButton: "ปุ่มนี้หมดอายุแล้ว พิมพ์ ทำต่อ เพื่อกรอกรายการที่ค้าง",
  deleted: "ลบรายการแล้ว 🗑",
  kept: 'เก็บไว้ในคิว "รอกรอก" ในแอปแล้ว พิมพ์ ทำต่อ เพื่อกรอกต่อ',
  parked: 'เก็บอันเก่าไว้ในคิว "รอกรอก" แล้ว เริ่มอันใหม่เลย',
  dropped: "ทิ้งอันเก่าแล้ว เริ่มอันใหม่เลย",
  keptConfirmed: "ไม่ลบ รายการยังอยู่เหมือนเดิม",
  reask: "ยังรอคำตอบข้อนี้อยู่นะ",
  photoAttached: "แนบรูปเข้ารายการที่ค้างแล้ว 📎",
  nothingPending: "ไม่มีรายการค้าง",
  noLatest: "ยังไม่มีรายการที่บันทึกในชื่อเรา",
  unknownMember: "ชื่อ LINE ไม่ตรงกับสมาชิกในทริป ตั้งชื่อสมาชิกในแอปให้ตรงก่อนนะ",
} as const;

export const CATEGORY_EMOJI: Record<Category, string> = {
  "อาหาร": "🍜", "เดินทาง": "🚕", "ที่พัก": "🏨", "ช้อป": "🛍️", "ตั๋ว": "🎫", "อื่นๆ": "📦",
};

type Item = { label: string; data?: Record<string, string | number | undefined>; text?: string };

const EDIT_BUTTONS: [string, EditField][] = [
  ["ยอด", "amount"], ["สกุลเงิน", "currency"], ["คนจ่าย", "payer"], ["หาร", "split"], ["หมวด", "category"], ["โน้ต", "note"],
];

function pb(st: FlowState, a: string, v?: string | number): Record<string, string | number | undefined> {
  return { a, e: st.expense.id, s: st.step, v };
}

function backItem(st: FlowState): Item[] {
  if (st.step === "conflict" || st.step === "confirm_cancel") return [];
  return (st.data.prevSteps ?? []).length > 0 ? [{ label: "↩ ย้อน", data: pb(st, "x_back") }] : [];
}

export function amountLine(e: Expense): string {
  if (e.currency === "THB") return `${fmtNum(e.amount)}฿`;
  return `${fmtNum(e.amount)} ${e.currency} (~${fmtNum(e.amount_thb)}฿)`;
}

export function splitLine(e: Expense, d: FlowData): string {
  if (d.lockedSplits) return "⚖️ หารหลายคน (แก้ในแอป)";
  if (!d.splitMode || d.splitMode === "none") return "⚖️ ไม่หาร";
  const partner = e.splits[0]?.name ?? "อีกคน";
  const owedThb = e.splits[0]?.amount_thb ?? 0;
  if (d.splitMode === "equal") return `⚖️ หารเท่า: ${partner}คืน ${fmtNum(owedThb)}฿`;
  const owed = d.owedAmount ?? 0;
  return `⚖️ หารไม่เท่า: ${e.payer} ${fmtNum(round2(e.amount - owed))} · ${partner} ${fmtNum(owed)} → ${partner}คืน ${fmtNum(owedThb)}฿`;
}

function questionText(st: FlowState, env: FlowEnv): string {
  const e = st.expense;
  const d = st.data;
  switch (st.step) {
    case "payer": return "ใครจ่าย?";
    case "amount": return d.amountCandidates?.length ? "ยอดคือ?" : "ยอดเท่าไหร่? พิมพ์ตัวเลขมาได้เลย";
    case "currency": return `${fmtNum(e.amount)} สกุลเงินอะไร?`;
    case "split": return otherMembers(e.payer, env.members).length > 0 ? "หารไหม?" : "หารไหม? (ทริปนี้มีสมาชิกคนเดียว)";
    case "partner": return "หารกับใคร?";
    case "owed": {
      if (d.owedZero) return "ฝากจ่าย 0 — เปลี่ยนเป็นไม่หารไหม?";
      const who = partnerFor(e.payer, d, env.members) ?? "อีกคน";
      const q = `${who} ฝากจ่ายเท่าไหร่? (เป็น ${e.currency} จากยอด ${fmtNum(e.amount)})`;
      return d.owedAmount != null && d.owedAmount > e.amount
        ? `ฝากจ่าย ${fmtNum(d.owedAmount)} เกินยอดรวม ${fmtNum(e.amount)} ใส่ใหม่นะ\n${q}`
        : q;
    }
    case "category": return `หมวดอะไร? (ตอนนี้: ${e.category})`;
    case "note": return `โน้ตใหม่? พิมพ์มาได้เลย (ตอนนี้: ${e.description || "-"})`;
    case "edit": return "แก้ข้อไหน?";
    case "confirm_cancel":
      return e.pending ? "ลบรายการนี้ทิ้ง หรือเก็บไว้กรอกทีหลัง?" : "รายการนี้บันทึกแล้ว ลบทิ้งจริงไหม?";
    case "conflict": {
      // The currency is only shown once chosen. A draft's currency is just the trip default until then.
      const cur = d.currencyConfirmed ? ` ${e.currency}` : "";
      const what = e.amount > 0
        ? `${fmtNum(e.amount)}${cur}${e.description ? ` ${e.description}` : ""}`
        : e.description || "ยังไม่มียอด";
      return `มีรายการค้างอยู่ (${what}) จะทำยังไงดี?`;
    }
    case "summary": return "สรุปรายการ";
  }
}

function questionItems(st: FlowState, env: FlowEnv): Item[] {
  const e = st.expense;
  const d = st.data;
  const others = otherMembers(e.payer, env.members);
  switch (st.step) {
    case "payer":
      return env.members.slice(0, 12).map((m) => ({ label: m, data: pb(st, "x_payer", m) }));
    case "amount":
      return (d.amountCandidates ?? []).slice(0, 4).map((n) => ({ label: fmtNum(n), data: pb(st, "x_amount", n) }));
    case "currency":
      return [...new Set([env.tripCurrency, env.homeCurrency].filter(Boolean))].map((c) => ({ label: c, data: pb(st, "x_currency", c) }));
    case "split":
      return others.length > 0
        ? [
            { label: "ไม่หาร", data: pb(st, "x_split", "none") },
            { label: "หารเท่า", data: pb(st, "x_split", "equal") },
            { label: "หารไม่เท่า", data: pb(st, "x_split", "unequal") },
          ]
        : [{ label: "ไม่หาร", data: pb(st, "x_split", "none") }];
    case "partner":
      return others.slice(0, 12).map((m) => ({ label: m, data: pb(st, "x_partner", m) }));
    case "owed":
      return d.owedZero
        ? [
            { label: "เปลี่ยนเป็นไม่หาร", data: pb(st, "x_owed_zero", "none") },
            { label: "↩ ใส่ใหม่", data: pb(st, "x_owed_zero", "retry") },
          ]
        : [];
    case "category":
      return CATS.map((c) => ({ label: c.name, data: pb(st, "x_category", c.name) }));
    case "note":
      return [{ label: "ไม่มีโน้ต", text: "-" }];
    case "edit":
      return EDIT_BUTTONS.map(([label, field]) => ({ label, data: pb(st, "x_editfield", field) }));
    case "confirm_cancel":
      return e.pending
        ? [
            { label: "ลบทิ้ง", data: pb(st, "x_cancel_delete") },
            { label: "เก็บไว้กรอกทีหลัง", data: pb(st, "x_cancel_keep") },
          ]
        : [
            { label: "ลบรายการนี้", data: pb(st, "x_cancel_delete") },
            { label: "ไม่ลบ", data: pb(st, "x_cancel_keep") },
          ];
    case "conflict":
      return [
        { label: "ทำต่ออันเก่า", data: pb(st, "x_conflict_resume") },
        { label: "เก็บไว้ เริ่มใหม่", data: pb(st, "x_conflict_park") },
        { label: "ทิ้งอันเก่า", data: pb(st, "x_conflict_drop") },
      ];
    case "summary":
      return [];
  }
}

export function questionMessage(st: FlowState, env: FlowEnv, notice?: string): FlexNode {
  const prefix = st.data.asker ? `@${st.data.asker} ` : "";
  const text = `${prefix}${notice ? `${notice}\n` : ""}${questionText(st, env)}`;
  const items = [...questionItems(st, env), ...backItem(st)].slice(0, 13);
  return textMessage(text, items.length > 0 ? quickReply(items) : undefined);
}

function infoLines(e: Expense, d: FlowData): FlexNode[] {
  const catLine = `${CATEGORY_EMOJI[e.category] ?? "📦"} ${e.category}${e.description ? ` · 📝 ${e.description}` : ""}`;
  return compact([
    txt(amountLine(e), { weight: "bold", size: "xl", color: CLAY.ink, wrap: true }),
    txt(catLine, { size: "sm", color: CLAY.muted, wrap: true }),
    txt(`👤 ${e.payer} จ่าย`, { size: "sm", color: CLAY.ink, wrap: true }),
    txt(splitLine(e, d), { size: "sm", color: CLAY.ink, wrap: true }),
    d.fxFailed ? txt("⚠️ ดึงเรตไม่ได้ (ใช้เรต 1 ไปก่อน) แก้ในแอป", { size: "xs", color: CLAY.coral, wrap: true }) : null,
  ]);
}

// Same clay look as the old buildConfirmationFlex: cream frame, white inner card.
function card(e: Expense, origin: string, title: string, titleColor: string, lines: FlexNode[], footer: FlexNode[]): FlexNode {
  const photo = e.slip_photo_ids[0];
  return {
    type: "bubble",
    size: "kilo",
    ...(photo
      ? { hero: { type: "image", url: imageUrl(origin, photo), size: "full", aspectRatio: "20:13", aspectMode: "cover", action: uriAction("ดูรูป", imageUrl(origin, photo)) } }
      : {}),
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: CLAY.cream,
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: CLAY.card,
          cornerRadius: "18px",
          paddingAll: "16px",
          spacing: "sm",
          contents: compact([txt(title, { weight: "bold", size: "md", color: titleColor }), ...lines]),
        },
      ],
    },
    footer: { type: "box", layout: "horizontal", spacing: "sm", paddingAll: "12px", contents: footer },
  };
}

export function summaryCard(st: FlowState, origin: string): FlexNode {
  const e = st.expense;
  const footer: FlexNode[] = [
    { type: "button", style: "primary", color: CLAY.coral, height: "sm", action: postbackAction("✅ ยืนยัน", pb(st, "x_confirm")) },
    { type: "button", style: "secondary", height: "sm", action: postbackAction("✏️ แก้", pb(st, "x_edit")) },
    { type: "button", style: "secondary", height: "sm", action: postbackAction("🗑 ยกเลิก", pb(st, "x_cancel")) },
  ];
  const back = backItem(st);
  return flexMessage(
    `สรุป: ${amountLine(e)}`.slice(0, 400),
    card(e, origin, "สรุปรายการ", CLAY.coral, infoLines(e, st.data), footer),
    back.length > 0 ? quickReply(back) : undefined,
  );
}

export function savedCard(e: Expense, d: FlowData, origin: string): FlexNode {
  const footer: FlexNode[] = [
    { type: "button", style: "primary", color: CLAY.peach, height: "sm", action: uriAction("เปิดในแอป", `${origin}/trips/${e.trip_id}/money`) },
  ];
  return flexMessage(`บันทึกแล้ว: ${amountLine(e)}`.slice(0, 400), card(e, origin, "✅ บันทึกแล้ว", CLAY.doneInk, infoLines(e, d), footer));
}

export function stepMessages(st: FlowState, env: FlowEnv, origin: string, notice?: string): FlexNode[] {
  if (st.step === "summary") return notice ? [textMessage(notice), summaryCard(st, origin)] : [summaryCard(st, origin)];
  return [questionMessage(st, env, notice)];
}
