// lib/line-plan-messages.ts
import type { DayPlan, ItineraryItem } from "@/lib/models/types";
import {
  CLAY,
  txt,
  compact,
  postbackAction,
  uriAction,
  flexMessage,
  textMessage,
  quickReply,
  buildPhotoAlbum,
  type FlexNode,
} from "@/lib/line-flex";
import { thaiDateLabel, tripDayIndex, addDays } from "@/lib/line-date";

export const PAGE_SIZE = 15;
export const MAIN_PLAN_NAME = "แผนหลัก";

// "2026-11-21" -> "21/11"
export function dm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function btn(action: FlexNode, style: "primary" | "secondary" | "link" = "secondary"): FlexNode {
  return { type: "button", style, height: "sm", action, ...(style === "primary" ? { color: CLAY.coral } : {}) };
}

export function btnRow(buttons: FlexNode[]): FlexNode | null {
  if (buttons.length === 0) return null;
  return { type: "box", layout: "horizontal", spacing: "sm", contents: buttons.map((b) => ({ ...b, flex: 1 })) };
}

// A cream sub-card inside a bubble body; optionally tappable as a whole.
export function section(contents: FlexNode[], action?: FlexNode): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    margin: "md",
    paddingAll: "10px",
    cornerRadius: "12px",
    backgroundColor: CLAY.cream,
    contents,
    ...(action ? { action } : {}),
  };
}

// Notes are shown with maxLines 3; offer "อ่านต่อ" when that likely cut them.
export function needsReadMore(notes: string): boolean {
  return notes.length > 120 || notes.split("\n").length > 3;
}

export function tripRangeText(start: string, end: string): string {
  return `ทริปอยู่ระหว่าง ${thaiDateLabel(start)}–${thaiDateLabel(end)}`;
}

// Foundation buildPhotoAlbum returns the bare carousel; wrap it into a
// sendable flex message (left tolerant of an already-wrapped message).
export function albumMessage(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode {
  const album = buildPhotoAlbum(p);
  return album.type === "flex" ? album : flexMessage(trunc(`รูป · ${p.title}`, 400), album);
}

export function buildDayPicker(
  text: string,
  dates: string[],
  start: string,
  action: string,
  lead: { label: string; date: string }[] = [],
): FlexNode {
  const items = [
    ...lead.map((l) => ({ label: l.label, data: { a: action, d: l.date } })),
    ...dates.map((d) => ({ label: `วันที่ ${tripDayIndex(d, start)} · ${dm(d)}`, data: { a: action, d } })),
  ].slice(0, 13);
  return items.length > 0 ? textMessage(text, quickReply(items)) : textMessage(text);
}

export function buildAltPicker(date: string, plans: DayPlan[]): FlexNode {
  if (plans.length === 0) return textMessage("วันนี้มีแพลนเดียว");
  return textMessage(
    `เลือกแพลน ${thaiDateLabel(date)}`,
    quickReply(
      plans.slice(0, 13).map((p) => ({
        label: p.is_active ? `${p.name || MAIN_PLAN_NAME} (หลัก)` : p.name || "แพลน",
        data: { a: "plan_overview", d: date, p: p.is_active ? undefined : p.id },
      })),
    ),
  );
}

export interface OverviewInput {
  appUrl: string;                              // app itinerary page for this day
  date: string;
  start: string;
  end: string;
  planId: string | null;                       // alt plan being viewed; null = the day's active/only plan
  planName: string;
  isAlt: boolean;
  otherPlans: { id: string; name: string }[];  // the day's other plans (not the one shown)
  items: ItineraryItem[];                      // already sorted (itemsForDay)
  nextIndex: number | null;                    // 0-based "ถัดไป" row, only when viewing today
  finished: boolean;                           // viewing today and every item is behind us
  page: number;                                // 1-based
}

function rowIcon(it: ItineraryItem): string {
  if (it.status === "done") return "✓";
  if (it.status === "skipped") return "⏭";
  if (it.status === "moved") return "➡️";
  if (it.linked_booking_id) return "🎫";
  if (it.linked_transport_id) return "🚇";
  if (it.photo_ids.length > 0) return "📷";
  return "";
}

function rowSuffix(it: ItineraryItem, isNext: boolean): string {
  if (isNext) return "ต่อไป";
  if (it.status === "skipped") return "ข้าม";
  if (it.status === "moved") return it.moved_to_date ? `ย้ายไป ${dm(it.moved_to_date)}` : "ย้ายแล้ว";
  return "";
}

function overviewRow(it: ItineraryItem, n: number, isNext: boolean, date: string): FlexNode {
  const gray = it.status === "skipped" || it.status === "moved";
  const ink = gray ? CLAY.grayInk : isNext ? CLAY.nextInk : CLAY.ink;
  const weight = isNext ? "bold" : "regular";
  const bg = it.status === "done" ? CLAY.doneBg : isNext ? CLAY.nextBg : undefined;
  const sub = [it.place, rowSuffix(it, isNext)].filter(Boolean).join(" · ");
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    paddingAll: "8px",
    cornerRadius: "10px",
    ...(bg ? { backgroundColor: bg } : {}),
    action: postbackAction("เปิด", { a: "plan_detail", i: it.id, d: date }),
    contents: compact<FlexNode>([
      txt(String(n), { size: "sm", color: CLAY.muted, flex: 0 }),
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        width: "52px",
        contents: compact<FlexNode>([
          txt(it.time || "—", { size: "sm", color: ink, weight }),
          txt(it.time && it.end_time ? `–${it.end_time}` : null, { size: "xs", color: CLAY.muted }),
        ]),
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact<FlexNode>([
          txt(it.title || "(ไม่มีชื่อ)", {
            size: "sm",
            color: ink,
            weight,
            wrap: true,
            ...(it.status === "skipped" ? { decoration: "line-through" } : {}),
          }),
          txt(sub, { size: "xs", color: gray ? CLAY.grayInk : CLAY.muted, wrap: true }),
        ]),
      },
      txt(rowIcon(it), { size: "sm", flex: 0, color: it.status === "done" ? CLAY.doneInk : CLAY.muted }),
    ]),
  };
}

// A stale "ดูต่อ" (rows deleted since the card was drawn) lands on the last page.
export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / PAGE_SIZE)));
}

export function buildPlanOverview(input: OverviewInput): FlexNode {
  const p = { ...input, page: clampPage(input.page, input.items.length) };
  const pageStart = (p.page - 1) * PAGE_SIZE;
  const shown = p.items.slice(pageStart, pageStart + PAGE_SIZE);
  const remaining = p.items.length - pageStart - shown.length;
  const pid = p.planId ?? undefined;
  const tomorrow = addDays(p.date, 1);

  const subtitle = p.isAlt
    ? `${p.planName} (สำรอง — ดูอย่างเดียว) · ${p.items.length} รายการ`
    : `${p.planName} · ${p.items.length} รายการ${p.otherPlans.length > 0 ? ` · มีแพลนสำรอง ${p.otherPlans.length}` : ""}`;

  const rows = shown.map((it, i) => overviewRow(it, pageStart + i + 1, p.nextIndex === pageStart + i, p.date));

  const body = compact<FlexNode>([
    txt(`📅 วันที่ ${tripDayIndex(p.date, p.start)} · ${thaiDateLabel(p.date)}`, {
      weight: "bold",
      size: "md",
      color: CLAY.coral,
      wrap: true,
    }),
    txt(subtitle, { size: "xs", color: CLAY.muted, wrap: true }),
    { type: "separator", margin: "md", color: CLAY.line },
    ...(rows.length > 0
      ? rows
      : [txt(`${thaiDateLabel(p.date)} ยังไม่มีแพลน`, { size: "sm", color: CLAY.muted, margin: "md", wrap: true })]),
    remaining > 0 ? txt(`อีก ${remaining} รายการ`, { size: "xs", color: CLAY.muted, margin: "md" }) : null,
    p.finished ? txt("จบแพลนวันนี้แล้ว 🎉", { size: "sm", weight: "bold", color: CLAY.doneInk, margin: "md" }) : null,
  ]);

  const altButtons: FlexNode[] = p.isAlt
    ? [btn(postbackAction("กลับแพลนหลัก", { a: "plan_overview", d: p.date }))]
    : p.otherPlans.length > 2
      ? [btn(postbackAction("แพลนอื่น", { a: "plan_alt", d: p.date }))]
      : p.otherPlans.map((o) => btn(postbackAction(trunc(o.name || "แพลน", 16), { a: "plan_overview", d: p.date, p: o.id })));

  const nav = compact<FlexNode>([
    p.date > p.start ? btn(postbackAction("◀ วันก่อน", { a: "plan_overview", d: addDays(p.date, -1) })) : null,
    p.date < p.end ? btn(postbackAction("วันถัดไป ▶", { a: "plan_overview", d: tomorrow })) : null,
  ]);

  const footer = compact<FlexNode>([
    remaining > 0 ? btn(postbackAction("ดูต่อ", { a: "plan_overview", d: p.date, p: pid, n: p.page + 1 }), "primary") : null,
    p.finished && tomorrow <= p.end ? btn(postbackAction("แพลนพรุ่งนี้", { a: "plan_overview", d: tomorrow }), "primary") : null,
    p.items.length === 0 ? btn(uriAction("เปิดแอป", p.appUrl), "primary") : null,
    btnRow(altButtons),
    btnRow(nav),
  ]);

  const bubble: FlexNode = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: CLAY.card, contents: body },
    ...(footer.length > 0
      ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", backgroundColor: CLAY.cream, contents: footer } }
      : {}),
  };
  return flexMessage(trunc(`แพลน ${thaiDateLabel(p.date)}`, 400), bubble);
}
