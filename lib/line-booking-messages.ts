// Pure Flex builders for the LINE booking view.
import type { Booking, ItineraryItem, Trip } from "@/lib/models/types";
import { CLAY, compact, txt, postbackAction, clipboardAction, imageUrl, flexMessage, textMessage, quickReply, type FlexNode } from "@/lib/line-flex";
import { thaiDateLabel } from "@/lib/line-date";
import {
  BOOKING_TYPES, typeMeta, bookingTitle, filterBookings, sortBookings, isPast, coversDate, isStaying, nights,
  countdown, linkedPlanItems, type BookingFilter,
} from "@/lib/line-booking";
import { appUrl, btn, emptyStateMessage, exceedsLines, joinParts, pageSlice, truncate, zoomHero } from "@/lib/line-view-kit";

// "พฤ 20 พ.ย." → "20 พ.ย."
const dm = (date: string) => thaiDateLabel(date).replace(/^\S+\s+/, "");

const fmtNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function describeBookingFilter(f: BookingFilter): string {
  return joinParts([f.type ? typeMeta(f.type).label : null, f.date ? thaiDateLabel(f.date) : null, f.query || null]);
}

export function filterPostback(f: BookingFilter): Record<string, string | undefined> {
  return { t: f.type, d: f.date, q: f.query || undefined };
}

function typeQuickReply(): FlexNode {
  return quickReply(BOOKING_TYPES.map((t) => ({ label: `${typeMeta(t).icon} ${typeMeta(t).label}`, data: { a: "bk_list", t } })));
}

function typeFooter(): FlexNode {
  const b = BOOKING_TYPES.map((t) => ({ ...btn(postbackAction(`${typeMeta(t).icon} ${typeMeta(t).label}`, { a: "bk_list", t })), flex: 1 }));
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      { type: "box", layout: "horizontal", spacing: "xs", contents: [b[0], b[1]] },
      { type: "box", layout: "horizontal", spacing: "xs", contents: [b[2], b[3]] },
    ],
  };
}

function rowLine2(b: Booking, today: string): string {
  if (b.type === "hotel" && b.date_from) {
    const n = nights(b);
    return joinParts([
      b.date_to && b.date_to !== b.date_from ? `${dm(b.date_from)}–${dm(b.date_to)}` : dm(b.date_from),
      n > 0 ? `${n} คืน` : null,
      isStaying(b, today) ? "กำลังพัก" : null,
    ]);
  }
  const title = bookingTitle(b);
  return joinParts([b.time_from, b.vendor !== title ? b.vendor : null, b.ref_no]);
}

function groupHeader(group: string, today: string): FlexNode | null {
  const label = group === "past" ? "ผ่านไปแล้ว" : group === "nodate" ? "ไม่ระบุวัน" : `${thaiDateLabel(group)}${group === today ? " · วันนี้" : ""}`;
  return txt(label, { size: "xs", weight: "bold", color: group === "past" ? CLAY.grayInk : CLAY.coral, margin: "md" });
}

function bookingRow(b: Booking, origin: string, today: string, filter: BookingFilter): FlexNode {
  const past = isPast(b, today);
  const thumb = b.slip_photo_ids[0];
  return {
    type: "box",
    layout: "horizontal",
    spacing: "md",
    paddingAll: "8px",
    cornerRadius: "12px",
    ...(coversDate(b, today) ? { backgroundColor: CLAY.nextBg } : {}),
    action: postbackAction("ดูรายละเอียด", { a: "bk_detail", b: b.id, ...filterPostback(filter) }),
    contents: compact([
      txt(typeMeta(b.type).icon, { flex: 0, size: "lg", gravity: "center" }),
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: compact([
          txt(bookingTitle(b), { weight: "bold", size: "sm", wrap: true, maxLines: 2, color: past ? CLAY.grayInk : CLAY.ink }),
          txt(rowLine2(b, today) || null, { size: "xs", wrap: true, maxLines: 2, color: past ? CLAY.grayInk : CLAY.muted }),
        ]),
      },
      thumb ? { type: "image", url: imageUrl(origin, thumb), size: "40px", aspectRatio: "1:1", aspectMode: "cover", flex: 0 } : null,
    ]),
  };
}

export function buildBookingList(p: { origin: string; bookings: Booking[]; filter: BookingFilter; page: number; today: string }): FlexNode {
  const { upcoming, past } = sortBookings(p.bookings, p.today);
  const { items, hasMore } = pageSlice([...upcoming, ...past], p.page);
  const rows: (FlexNode | null)[] = [];
  let lastGroup = "";
  for (const b of items) {
    // In-progress items (started before today, not over) join today's group,
    // so a hotel stay shows under "… · วันนี้" instead of its check-in date.
    const group = isPast(b, p.today) ? "past" : !b.date_from ? "nodate" : b.date_from < p.today ? p.today : b.date_from;
    if (group !== lastGroup) {
      rows.push(groupHeader(group, p.today));
      lastGroup = group;
    }
    rows.push(bookingRow(b, p.origin, p.today, p.filter));
  }
  const page = Math.max(1, Math.floor(p.page) || 1);
  const title = `🎫 ${describeBookingFilter(p.filter) || "การจองทั้งหมด"} · ${p.bookings.length}`;
  return flexMessage(truncate(title, 400), {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: CLAY.cream,
      paddingAll: "14px",
      contents: compact([
        txt(title, { weight: "bold", size: "md", wrap: true, color: CLAY.ink }),
        txt("เรียงตามวัน · ที่ผ่านไปแล้วอยู่ท้าย", { size: "xxs", color: CLAY.muted }),
      ]),
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "10px",
      contents: compact([
        ...rows,
        hasMore ? btn(postbackAction("ดูต่อ", { a: "bk_list", ...filterPostback(p.filter), n: page + 1 }), "link") : null,
      ]),
    },
    footer: typeFooter(),
  });
}

function whenLines(b: Booking, today: string, nowHHMM: string): string[] {
  if (!b.date_from) return [];
  const cd = countdown(b, today, nowHHMM);
  if (b.type === "hotel") {
    const checkIn = `เช็คอิน ${thaiDateLabel(b.date_from)}${b.time_from ? ` ${b.time_from}` : ""}`;
    const checkOut = b.date_to && b.date_to !== b.date_from ? ` → เช็คเอาท์ ${thaiDateLabel(b.date_to)} · ${nights(b)} คืน` : "";
    return [checkIn + checkOut, cd];
  }
  const head = joinParts([thaiDateLabel(b.date_from), b.time_from]);
  const until = b.date_to && b.date_to !== b.date_from ? ` ถึง ${thaiDateLabel(b.date_to)}` : "";
  return [head + until, cd];
}

function amountLine(b: Booking): string {
  const cur = b.currency || "THB";
  const thb = cur !== "THB" && b.amount_thb ? ` (~${fmtNum(Math.round(b.amount_thb))}฿)` : "";
  return `💰 ${fmtNum(b.amount)} ${cur}${thb}${b.payer ? ` · ${b.payer}จ่าย` : ""}`;
}

function refBox(ref: string): FlexNode {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: CLAY.cream,
    cornerRadius: "12px",
    paddingAll: "12px",
    margin: "md",
    contents: compact([
      txt("เลขจอง", { size: "xxs", color: CLAY.muted, align: "center" }),
      txt(ref, { size: "xl", weight: "bold", color: CLAY.ink, align: "center", wrap: true }),
    ]),
  };
}

function planButton(b: Booking, linked: ItineraryItem[]): FlexNode | null {
  if (linked.length === 0) return null;
  if (linked.length === 1) return btn(postbackAction("📅 ดูในแพลน", { a: "plan_detail", i: linked[0].id, d: linked[0].day_date }));
  return btn(postbackAction("📅 ดูในแพลน", { a: "bk_plan", b: b.id }));
}

export function buildBookingDetail(p: { origin: string; booking: Booking; filter: BookingFilter; linked: ItineraryItem[]; today: string; nowHHMM: string }): FlexNode {
  const b = p.booking;
  const meta = typeMeta(b.type);
  const title = bookingTitle(b);
  const photo = b.slip_photo_ids[0];
  const [when, cd] = whenLines(b, p.today, p.nowHHMM);
  const body = compact([
    txt(`${meta.icon} ${meta.label}`, { size: "xs", color: CLAY.muted }),
    txt(title, { weight: "bold", size: "lg", wrap: true, color: CLAY.ink }),
    b.vendor && b.vendor !== title ? txt(b.vendor, { size: "sm", wrap: true, color: CLAY.muted }) : null,
    b.ref_no ? refBox(b.ref_no) : null,
    txt(when || null, { size: "sm", wrap: true, color: CLAY.ink, margin: "md" }),
    txt(cd || null, { size: "xs", weight: "bold", color: CLAY.nextInk }),
    b.detail.trim() && b.detail.trim() !== title ? txt(b.detail, { size: "sm", wrap: true, color: CLAY.ink, margin: "md" }) : null,
    b.amount ? txt(amountLine(b), { size: "sm", wrap: true, color: CLAY.ink, margin: "md" }) : null,
    b.notes ? txt(`📝 ${b.notes}`, { size: "sm", wrap: true, maxLines: 3, color: CLAY.muted, margin: "md" }) : null,
  ]);
  const footer = compact([
    b.ref_no ? btn(clipboardAction("📋 คัดลอกเลขจอง", truncate(b.ref_no, 1000)), "primary") : null,
    b.slip_photo_ids.length ? btn(postbackAction(`📷 ดูรูปทั้งหมด (${b.slip_photo_ids.length})`, { a: "bk_photos", b: b.id })) : null,
    b.notes && exceedsLines(b.notes, 3) ? btn(postbackAction("📝 อ่านโน้ตต่อ", { a: "bk_note", b: b.id })) : null,
    planButton(b, p.linked),
    btn(postbackAction("กลับรายการ", { a: "bk_list", ...filterPostback(p.filter) }), "link"),
  ]);
  return flexMessage(truncate(`${meta.icon} ${title}${b.ref_no ? ` · ${b.ref_no}` : ""}`, 400), {
    type: "bubble",
    size: "mega",
    ...(photo ? { hero: zoomHero({ origin: p.origin, photoId: photo }) } : {}),
    body: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "16px", contents: body },
    footer: { type: "box", layout: "vertical", spacing: "xs", contents: footer },
  });
}

export function buildPlanPicker(linked: ItineraryItem[]): FlexNode {
  return textMessage(
    "การจองนี้อยู่ในแพลนหลายรายการ เลือกได้เลย",
    quickReply(linked.slice(0, 13).map((it) => ({ label: `${dm(it.day_date)} ${it.title}`, data: { a: "plan_detail", i: it.id, d: it.day_date } }))),
  );
}

export function buildBookingReply(p: {
  trip: Trip; origin: string; bookings: Booking[]; itinerary: ItineraryItem[]; filter: BookingFilter;
  page: number; autoDetail: boolean; today: string; nowHHMM: string;
}): FlexNode[] {
  if (p.bookings.length === 0) return [emptyStateMessage("ทริปนี้ยังไม่มีการจอง", appUrl(p.origin, p.trip.id, "bookings"))];
  const matched = filterBookings(p.bookings, p.filter);
  if (matched.length === 0) return [textMessage(`ไม่เจอ '${describeBookingFilter(p.filter)}'`, typeQuickReply())];
  if (p.autoDetail && matched.length === 1) {
    const booking = matched[0];
    return [buildBookingDetail({ origin: p.origin, booking, filter: { query: "" }, linked: linkedPlanItems(p.itinerary, booking.id), today: p.today, nowHHMM: p.nowHHMM })];
  }
  return [buildBookingList({ origin: p.origin, bookings: matched, filter: p.filter, page: p.page, today: p.today })];
}
