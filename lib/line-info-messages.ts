// Pure Flex builders for LINE quick info (ข้อมูลด่วน) and quick notes (โน้ต).
import type { QuickInfo, QuickNote, Trip } from "@/lib/models/types";
import { CLAY, compact, txt, postbackAction, uriAction, clipboardAction, flexMessage, textMessage, quickReply, type FlexNode } from "@/lib/line-flex";
import { mapButtons } from "@/lib/line-maps";
import { bigTextSize, classifyValue, noteTitle, nonEmptyLines, searchNotes, searchQuickInfo, sortNotes, sortQuickInfo, telUri } from "@/lib/line-info";
import { appUrl, btn, emptyStateMessage, exceedsLines, longTextMessages, pageSlice, truncate, zoomHero } from "@/lib/line-view-kit";

const clip = (v: string) => truncate(v, 1000);

function listBubble(title: string, rows: FlexNode[], more: FlexNode | null): FlexNode {
  return {
    type: "bubble",
    size: "mega",
    header: { type: "box", layout: "vertical", backgroundColor: CLAY.cream, paddingAll: "14px", contents: compact([txt(title, { weight: "bold", size: "md", wrap: true, color: CLAY.ink })]) },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "10px", contents: compact([...rows, more]) },
  };
}

// ---------- quick info ----------

function rowButton(r: QuickInfo): FlexNode | null {
  const v = r.value.trim();
  if (!v) return null;
  const kind = classifyValue(r.label, v);
  const action = kind === "phone" ? uriAction("📞", telUri(v)) : kind === "url" ? uriAction("🔗", v) : clipboardAction("📋", clip(v));
  return { type: "button", style: "link", height: "sm", flex: 0, action };
}

function qiLabel(r: QuickInfo, withPhotoIcon: boolean): string {
  return `${r.pinned ? "📌 " : ""}${r.label || "ข้อมูล"}${withPhotoIcon && r.photo_ids.length ? " 📷" : ""}`;
}

function qiRow(r: QuickInfo): FlexNode {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    paddingAll: "8px",
    cornerRadius: "12px",
    backgroundColor: CLAY.card,
    action: postbackAction("ดูรายละเอียด", { a: "qi_detail", id: r.id }),
    contents: compact([
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact([
          txt(qiLabel(r, true), { size: "xxs", wrap: true, color: CLAY.muted }),
          txt(r.value || null, { size: "sm", wrap: true, maxLines: 2, color: CLAY.ink }),
        ]),
      },
      rowButton(r),
    ]),
  };
}

export function buildQuickInfoList(p: { rows: QuickInfo[]; query: string; page: number }): FlexNode {
  const { items, hasMore } = pageSlice(p.rows, p.page);
  const page = Math.max(1, Math.floor(p.page) || 1);
  const title = `ℹ️ ข้อมูลด่วน · ${p.rows.length}${p.query ? ` · กรอง "${p.query}"` : ""}`;
  const more = hasMore ? btn(postbackAction("ดูต่อ", { a: "qi_list", q: p.query || undefined, n: page + 1 }), "link") : null;
  return flexMessage(truncate(title, 400), listBubble(title, items.map(qiRow), more));
}

function typeButtons(r: QuickInfo): FlexNode[] {
  const v = r.value.trim();
  if (!v) return [];
  switch (classifyValue(r.label, v)) {
    case "phone": return [btn(uriAction("📞 โทร", telUri(v)))];
    case "url": return [btn(uriAction("🔗 เปิดลิงก์", v))];
    case "address": return mapButtons({ query: v });
    default: return [];
  }
}

export function buildQuickInfoDetail(p: { origin: string; row: QuickInfo }): FlexNode[] {
  const r = p.row;
  const photo = r.photo_ids[0];
  const buttons = compact([
    r.value ? btn(clipboardAction("📋 คัดลอก", clip(r.value)), "primary") : null,
    ...typeButtons(r),
    r.photo_ids.length > 1 ? btn(postbackAction(`📷 รูป (${r.photo_ids.length})`, { a: "qi_photos", id: r.id })) : null,
    r.value ? btn(postbackAction("🔍 โชว์ตัวใหญ่", { a: "qi_big", id: r.id })) : null,
  ]);
  const card = flexMessage(truncate(`${r.label}: ${r.value}`, 400), {
    type: "bubble",
    size: "mega",
    ...(photo ? { hero: zoomHero({ origin: p.origin, photoId: photo }) } : {}),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: compact([
        txt(qiLabel(r, false), { size: "xs", wrap: true, color: CLAY.muted }),
        txt(r.value || "(ว่าง)", { size: "xl", weight: "bold", wrap: true, color: CLAY.ink }),
      ]),
    },
    ...(buttons.length ? { footer: { type: "box", layout: "vertical", spacing: "xs", contents: buttons } } : {}),
  });
  return compact([card, r.value ? textMessage(truncate(r.value, 5000)) : null]);
}

export function buildBigText(value: string): FlexNode {
  return flexMessage(truncate(value, 400), {
    type: "bubble",
    size: "giga",
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      paddingAll: "24px",
      contents: compact([txt(value, { size: bigTextSize(value), weight: "bold", wrap: true, align: "center", color: "#000000" })]),
    },
  });
}

export function buildQuickInfoReply(p: { trip: Trip; origin: string; rows: QuickInfo[]; query: string; page: number; autoDetail: boolean }): FlexNode[] {
  if (p.rows.length === 0) return [emptyStateMessage("ยังไม่มีข้อมูลด่วนในทริปนี้", appUrl(p.origin, p.trip.id, "info?tab=quickinfo"))];
  const sorted = sortQuickInfo(p.rows);
  const matched = searchQuickInfo(sorted, p.query);
  if (matched.length === 0) {
    return [textMessage(`ไม่เจอ '${p.query}'`, quickReply(sorted.slice(0, 13).map((r) => ({ label: r.label || r.value || "ข้อมูล", data: { a: "qi_detail", id: r.id } }))))];
  }
  if (p.autoDetail && matched.length === 1) return buildQuickInfoDetail({ origin: p.origin, row: matched[0] });
  return [buildQuickInfoList({ rows: matched, query: p.query, page: p.page })];
}

// ---------- quick notes ----------

function noteRow(n: QuickNote, query: string): FlexNode {
  const lines = nonEmptyLines(n.content);
  const preview = n.title.trim() ? lines[0] : lines[1];
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    paddingAll: "8px",
    cornerRadius: "12px",
    backgroundColor: CLAY.card,
    action: postbackAction("อ่านโน้ต", { a: "qn_detail", id: n.id, q: query || undefined }),
    contents: compact([
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact([
          txt(noteTitle(n), { weight: "bold", size: "sm", maxLines: 1, color: CLAY.ink }),
          txt(preview || null, { size: "xs", maxLines: 1, color: CLAY.muted }),
        ]),
      },
      txt(n.photo_ids.length ? "📷" : "›", { flex: 0, gravity: "center", color: CLAY.muted }),
    ]),
  };
}

export function buildNoteList(p: { rows: QuickNote[]; query: string; page: number }): FlexNode {
  const { items, hasMore } = pageSlice(p.rows, p.page);
  const page = Math.max(1, Math.floor(p.page) || 1);
  const title = `📒 โน้ต · ${p.rows.length}${p.query ? ` · กรอง "${p.query}"` : ""}`;
  const more = hasMore ? btn(postbackAction("ดูต่อ", { a: "qn_list", q: p.query || undefined, n: page + 1 }), "link") : null;
  return flexMessage(truncate(title, 400), listBubble(title, items.map((n) => noteRow(n, p.query)), more));
}

export function buildNoteDetail(p: { origin: string; note: QuickNote; query?: string }): FlexNode {
  const n = p.note;
  const photo = n.photo_ids[0];
  const title = noteTitle(n);
  // Title empty → the first line already became the title; don't repeat it in the body.
  const body = n.title.trim() ? n.content : n.content.replace(/^\s*[^\n]*\n?/, "");
  return flexMessage(truncate(`📒 ${title}`, 400), {
    type: "bubble",
    size: "mega",
    ...(photo ? { hero: zoomHero({ origin: p.origin, photoId: photo }) } : {}),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: compact([
        txt(title, { weight: "bold", size: "lg", wrap: true, color: CLAY.ink }),
        txt(body.trim() ? body : null, { size: "sm", wrap: true, maxLines: 12, color: CLAY.ink }),
      ]),
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: compact([
        exceedsLines(body, 12) ? btn(postbackAction("📄 อ่านเต็ม", { a: "qn_full", id: n.id }), "primary") : null,
        n.photo_ids.length ? btn(postbackAction(`📷 รูป (${n.photo_ids.length})`, { a: "qn_photos", id: n.id })) : null,
        btn(postbackAction("กลับรายการ", { a: "qn_list", q: p.query || undefined }), "link"),
      ]),
    },
  });
}

export function buildNoteFullText(note: QuickNote, appLink: string): FlexNode[] {
  return longTextMessages(note.content, appLink, "โน้ตนี้ไม่มีเนื้อหา");
}

export function buildNotesReply(p: { trip: Trip; origin: string; rows: QuickNote[]; query: string; page: number; autoDetail: boolean }): FlexNode[] {
  if (p.rows.length === 0) return [emptyStateMessage("ยังไม่มีโน้ตในทริปนี้", appUrl(p.origin, p.trip.id, "info?tab=quicknotes"))];
  const sorted = sortNotes(p.rows);
  const matched = searchNotes(sorted, p.query);
  if (matched.length === 0) {
    return [textMessage(`ไม่เจอ '${p.query}'`, quickReply(sorted.slice(0, 13).map((n) => ({ label: noteTitle(n), data: { a: "qn_detail", id: n.id } }))))];
  }
  if (p.autoDetail && matched.length === 1) return [buildNoteDetail({ origin: p.origin, note: matched[0], query: p.query })];
  return [buildNoteList({ rows: matched, query: p.query, page: p.page })];
}
