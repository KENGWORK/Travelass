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
  missingFields,
  otherMembers,
  partnerFor,
  round2,
  type EditField,
  type Field,
  type FlowData,
  type FlowEnv,
  type FlowState,
  type FlowStep,
  type SplitMode,
} from "@/lib/line-expense-flow";

// What the cards need besides the flow state: where images live and which trip this is.
export interface CardCtx {
  origin: string;
  tripName: string;
}

export const MSG = {
  noTrip: NO_TRIP_TEXT,
  goneExpense: "รายการนี้ถูกลบไปแล้ว",
  expiredButton: "ปุ่มนี้หมดอายุแล้ว พิมพ์ ทำต่อ เพื่อกรอกรายการที่ค้าง",
  staleButton: "ปุ่มนี้หมดอายุแล้ว",
  deleted: "ลบรายการแล้ว 🗑",
  kept: 'เก็บไว้ในคิว "รอกรอก" ในแอปแล้ว พิมพ์ ทำต่อ เพื่อกรอกต่อ',
  parked: 'เก็บอันเก่าไว้ในคิว "รอกรอก" แล้ว เริ่มอันใหม่เลย',
  dropped: "ทิ้งอันเก่าแล้ว เริ่มอันใหม่เลย",
  droppedEdit: "ยกเลิกการแก้ไขแล้ว รายการเดิมยังอยู่ เริ่มอันใหม่เลย",
  keptConfirmed: "ไม่ลบ รายการยังอยู่เหมือนเดิม",
  reask: "ไม่เข้าใจ ลองกดปุ่ม หรือพิมพ์ เช่น HKD เก่ง หารเท่า",
  reaskPrompt: "ยังรอคำตอบข้อนี้อยู่นะ",
  busy: "มีรายการอื่นค้างอยู่ ตอบหรือ ยกเลิก อันนั้นก่อนนะ",
  photoAttached: "แนบรูปเข้ารายการที่ค้างแล้ว 📎",
  nothingPending: "ไม่มีรายการค้าง",
  noLatest: "ยังไม่มีรายการที่บันทึกในชื่อเรา",
  unknownMember: "ชื่อ LINE ไม่ตรงกับสมาชิกในทริป ตั้งชื่อสมาชิกในแอปให้ตรงก่อนนะ",
} as const;

// The card is the question for a draft; every other step is a prompt.
export const reaskFor = (step: FlowStep): string => (step === "missing" ? MSG.reask : MSG.reaskPrompt);

export const CATEGORY_EMOJI: Record<Category, string> = {
  "อาหาร": "🍜", "เดินทาง": "🚕", "ที่พัก": "🏨", "ช้อป": "🛍️", "ตั๋ว": "🎫", "อื่นๆ": "📦",
};

type Data = Record<string, string | number | undefined>;
type Item = { label: string; data?: Data; text?: string };

const EDIT_BUTTONS: [string, EditField][] = [
  ["ยอด", "amount"], ["สกุลเงิน", "currency"], ["คนจ่าย", "payer"], ["หาร", "split"], ["หมวด", "category"], ["โน้ต", "note"],
];

const SPLIT_LABEL: Record<SplitMode, string> = { none: "ไม่หาร", equal: "หารเท่า", unequal: "หารไม่เท่า" };

// Every card button carries the expense id and the revision it was drawn for.
function pb(st: FlowState, a: string, extra: Data = {}): Data {
  return { a, e: st.expense.id, v: st.data.rev ?? 0, ...extra };
}
const setPb = (st: FlowState, f: Field | "category", w: string | number): Data => pb(st, "x_set", { f, w });

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

// ---------------------------------------------------------------------------
// One question at a time: only for editing a saved expense and the two prompts
// ---------------------------------------------------------------------------

function questionText(st: FlowState, env: FlowEnv): string {
  const e = st.expense;
  const d = st.data;
  switch (st.step) {
    case "missing": return "เหลือบางอย่างที่ต้องกรอก";
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
      return e.pending ? `มีรายการค้างอยู่ (${what}) จะทำยังไงดี?` : `กำลังแก้รายการ (${what}) อยู่ จะทำยังไงดี?`;
    }
  }
}

function questionItems(st: FlowState, env: FlowEnv): Item[] {
  const e = st.expense;
  const d = st.data;
  const others = otherMembers(e.payer, env.members);
  switch (st.step) {
    case "missing":
      return [];
    case "payer":
      return env.members.slice(0, 12).map((m) => ({ label: m, data: setPb(st, "payer", m) }));
    case "amount":
      return (d.amountCandidates ?? []).slice(0, 4).map((n) => ({ label: fmtNum(n), data: setPb(st, "amount", n) }));
    case "currency":
      return [...new Set([env.tripCurrency, env.homeCurrency].filter(Boolean))].map((c) => ({ label: c, data: setPb(st, "currency", c) }));
    case "split":
      return (others.length > 0 ? (["none", "equal", "unequal"] as SplitMode[]) : (["none"] as SplitMode[]))
        .map((m) => ({ label: SPLIT_LABEL[m], data: setPb(st, "split", m) }));
    case "partner":
      return others.slice(0, 12).map((m) => ({ label: m, data: setPb(st, "partner", m) }));
    case "owed":
      return d.owedZero
        ? [
            { label: "เปลี่ยนเป็นไม่หาร", data: pb(st, "x_owed_zero", { w: "none" }) },
            { label: "↩ ใส่ใหม่", data: pb(st, "x_owed_zero", { w: "retry" }) },
          ]
        : [];
    case "category":
      return CATS.map((c) => ({ label: c.name, data: setPb(st, "category", c.name) }));
    case "note":
      return [{ label: "ไม่มีโน้ต", text: "-" }];
    case "edit":
      return EDIT_BUTTONS.map(([label, field]) => ({ label, data: pb(st, "x_editfield", { w: field }) }));
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
  }
}

export function questionMessage(st: FlowState, env: FlowEnv, notice?: string): FlexNode {
  const prefix = st.data.asker ? `@${st.data.asker} ` : "";
  const text = `${prefix}${notice ? `${notice}\n` : ""}${questionText(st, env)}`;
  const items = questionItems(st, env).slice(0, 13);
  return textMessage(text, items.length > 0 ? quickReply(items) : undefined);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

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

// Same clay look as the old cards: cream frame, white inner card, optional slip hero.
function shell(e: Expense, origin: string, inner: FlexNode[], footer: FlexNode[]): FlexNode {
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
        { type: "box", layout: "vertical", backgroundColor: CLAY.card, cornerRadius: "18px", paddingAll: "16px", spacing: "sm", contents: inner },
      ],
    },
    footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", contents: footer },
  };
}

const tripLine = (tripName: string): FlexNode | null => (tripName ? txt(`ทริป ${tripName}`, { size: "xs", color: CLAY.muted, align: "center" }) : null);

export function savedCard(e: Expense, d: FlowData, origin: string, tripName: string): FlexNode {
  const footer = compact<FlexNode>([
    {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        { type: "button", style: "secondary", height: "sm", action: postbackAction("✏️ แก้", { a: "x_edit", e: e.id }) },
        { type: "button", style: "secondary", height: "sm", action: postbackAction("🗑 ลบ", { a: "x_del", e: e.id }) },
      ],
    },
    { type: "button", style: "link", height: "sm", action: uriAction("เปิดในแอป", `${origin}/trips/${e.trip_id}/money`) },
    tripLine(tripName),
  ]);
  const inner = compact<FlexNode>([txt("✅ บันทึกแล้ว", { weight: "bold", size: "md", color: CLAY.doneInk }), ...infoLines(e, d)]);
  return flexMessage(`บันทึกแล้ว: ${amountLine(e)}`.slice(0, 400), shell(e, origin, inner, footer));
}

const FIELD_LABEL: Record<Field, string> = {
  amount: "ยอด", currency: "สกุลเงิน", payer: "คนจ่าย", split: "หาร", partner: "หารกับ", owed: "ฝากจ่าย",
};

function visibleFields(st: FlowState, env: FlowEnv): Field[] {
  const d = st.data;
  const out: Field[] = ["amount", "currency"];
  if (env.members.length > 0) out.push("payer");
  if (d.lockedSplits) return out;
  out.push("split");
  if (d.splitMode && d.splitMode !== "none" && st.expense.payer && otherMembers(st.expense.payer, env.members).length > 1) out.push("partner");
  if (d.splitMode === "unequal") out.push("owed");
  return out;
}

function buttonRows(items: Item[]): FlexNode[] {
  const rows: FlexNode[] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: items.slice(i, i + 3).map((it) => ({
        type: "button", style: "secondary", height: "sm", flex: 1, action: postbackAction(it.label, it.data ?? {}),
      })),
    });
  }
  return rows;
}

function doneValue(field: Field, st: FlowState, env: FlowEnv): string {
  const e = st.expense;
  const d = st.data;
  switch (field) {
    case "amount": return fmtNum(e.amount);
    case "currency": return e.currency;
    case "payer": return e.payer;
    case "split": return SPLIT_LABEL[d.splitMode ?? "none"];
    case "partner": return partnerFor(e.payer, d, env.members) ?? "-";
    case "owed": return `${fmtNum(d.owedAmount ?? 0)} ${e.currency}`;
  }
}

// Answered: a tappable row; tapping clears the field and asks it again.
function doneRow(st: FlowState, env: FlowEnv, field: Field): FlexNode {
  const label = FIELD_LABEL[field];
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    action: postbackAction(`แก้${label}`, pb(st, "x_clear", { f: field })),
    contents: compact<FlexNode>([
      txt(`✓ ${label}`, { size: "sm", color: CLAY.doneInk, flex: 3 }),
      txt(doneValue(field, st, env), { size: "sm", weight: "bold", color: CLAY.ink, flex: 4, align: "end" }),
    ]),
  };
}

function todoBody(field: Field, st: FlowState, env: FlowEnv): FlexNode[] {
  const e = st.expense;
  const d = st.data;
  switch (field) {
    case "amount":
      return compact<FlexNode>([
        txt("พิมพ์ตัวเลข เช่น 120", { size: "sm", color: CLAY.ink }),
        ...buttonRows((d.amountCandidates ?? []).slice(0, 4).map((n) => ({ label: fmtNum(n), data: setPb(st, "amount", n) }))),
      ]);
    case "currency":
      return buttonRows([...new Set([env.tripCurrency, env.homeCurrency].filter(Boolean))].map((c) => ({ label: c, data: setPb(st, "currency", c) })));
    case "payer":
      return buttonRows(env.members.slice(0, 9).map((m) => ({ label: m, data: setPb(st, "payer", m) })));
    case "split": {
      const modes: SplitMode[] = env.members.length > 1 ? ["none", "equal", "unequal"] : ["none"];
      return buttonRows(modes.map((m) => ({ label: SPLIT_LABEL[m], data: setPb(st, "split", m) })));
    }
    case "partner":
      return buttonRows(otherMembers(e.payer, env.members).slice(0, 9).map((m) => ({ label: m, data: setPb(st, "partner", m) })));
    case "owed": {
      if (d.owedZero) {
        return compact<FlexNode>([
          txt("ฝากจ่าย 0 — เปลี่ยนเป็นไม่หารไหม?", { size: "sm", color: CLAY.coral }),
          ...buttonRows([
            { label: "เปลี่ยนเป็นไม่หาร", data: pb(st, "x_owed_zero", { w: "none" }) },
            { label: "ใส่ใหม่", data: pb(st, "x_owed_zero", { w: "retry" }) },
          ]),
        ]);
      }
      if (!(e.amount > 0)) return compact<FlexNode>([txt("ใส่ยอดรวมก่อน", { size: "sm", color: CLAY.ink })]);
      const owed = d.owedAmount;
      const over = owed != null && owed > e.amount;
      return compact<FlexNode>([
        over ? txt(`ฝากจ่าย ${fmtNum(owed)} เกินยอดรวม ${fmtNum(e.amount)} ใส่ใหม่นะ`, { size: "sm", color: CLAY.coral }) : null,
        txt("ยอดที่ฝากจ่าย — พิมพ์ตัวเลข เช่น ฝาก 20", { size: "sm", color: CLAY.ink }),
      ]);
    }
  }
}

function todoRow(field: Field, st: FlowState, env: FlowEnv): FlexNode {
  const label = field === "partner" ? "หารกับใคร" : FIELD_LABEL[field];
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: compact<FlexNode>([txt(label, { size: "sm", color: CLAY.muted }), ...todoBody(field, st, env)]),
  };
}

function cardTitle(st: FlowState): string {
  const e = st.expense;
  const parts: string[] = [];
  if (e.amount > 0) parts.push(`${fmtNum(e.amount)}${st.data.currencyConfirmed ? ` ${e.currency}` : ""}`);
  if (e.description) parts.push(e.description);
  if (parts.length > 0) return `💸 ${parts.join(" · ")}`;
  return e.slip_photo_ids.length > 0 ? "💸 รับสลิปแล้ว 📸" : "💸 รายการใหม่";
}

// The one card of a draft: everything known as ✓ rows, everything missing as
// buttons or a typing hint. A notice goes in a plain text message above it.
export function missingCard(st: FlowState, env: FlowEnv, cc: CardCtx, notice?: string): FlexNode[] {
  const e = st.expense;
  const d = st.data;
  const missing = missingFields(e, d, env.members);
  const rows = visibleFields(st, env).map((f) => (missing.includes(f) ? todoRow(f, st, env) : doneRow(st, env, f)));
  const title = cardTitle(st);
  const inner = compact<FlexNode>([
    d.asker ? txt(`@${d.asker}`, { size: "xs", color: CLAY.muted }) : null,
    txt(title, { weight: "bold", size: "md", color: CLAY.coral }),
    txt(`เหลืออีก ${missing.length} อย่าง`, { size: "xs", color: CLAY.muted }),
    ...rows,
    d.lockedSplits ? txt(splitLine(e, d), { size: "sm", color: CLAY.ink }) : null,
    txt('พิมพ์ตอบทีเดียวก็ได้ เช่น "HKD เก่ง หารเท่า"', { size: "xs", color: CLAY.muted }),
  ]);
  const footer = compact<FlexNode>([
    { type: "button", style: "secondary", height: "sm", action: postbackAction("🗑 ยกเลิก", pb(st, "x_cancel")) },
    tripLine(cc.tripName),
  ]);
  const card = flexMessage(`${title} · เหลืออีก ${missing.length} อย่าง`.slice(0, 400), shell(e, cc.origin, inner, footer));
  return notice ? [textMessage(notice), card] : [card];
}

export function stepMessages(st: FlowState, env: FlowEnv, cc: CardCtx, notice?: string): FlexNode[] {
  if (st.step === "missing") return missingCard(st, env, cc, notice);
  return [questionMessage(st, env, notice)];
}
