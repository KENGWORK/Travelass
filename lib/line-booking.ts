// Pure booking-view logic: parse the router's `rest`, filter, sort, countdown.
import type { Booking, BookingType, ItineraryItem } from "@/lib/models/types";
import { extractDate, type TripDateCtx } from "@/lib/line-date";
import { includesCI, norm, truncate, firstLine } from "@/lib/line-view-kit";

export interface BookingFilter { type?: BookingType; date?: string; query: string }

export const BOOKING_TYPES: readonly BookingType[] = ["flight", "hotel", "car", "activity"];

const TYPE_META: Record<BookingType, { icon: string; label: string }> = {
  flight: { icon: "✈️", label: "เครื่องบิน" },
  hotel: { icon: "🏨", label: "โรงแรม" },
  car: { icon: "🚗", label: "รถ" },
  activity: { icon: "🎡", label: "กิจกรรม" },
};

export function typeMeta(t: string): { icon: string; label: string } {
  return TYPE_META[t as BookingType] ?? { icon: "🎫", label: "การจอง" };
}

// Type words match only as an EXACT token (after peeling leading fillers), never
// as a substring: "รถไฟ" and "การบินไทย" stay search text.
const TYPE_WORDS: Record<string, BookingType> = {
  "เครื่องบิน": "flight", "เครื่อง": "flight", "บิน": "flight", "ไฟลต์": "flight",
  "โรงแรม": "hotel", "ที่พัก": "hotel",
  "รถ": "car",
  "กิจกรรม": "activity", "ทัวร์": "activity", "สวนสนุก": "activity",
};

// Connector/keyword words that may survive in `rest` (e.g. "เอกสารการจองโรงแรม" → rest "การจองโรงแรม").
const FILLERS = ["การ", "ของ", "จอง", "ตั๋ว", "เอกสาร"];

// A token is "structural" when it is entirely fillers followed by at most one
// exact type word: "การจองโรงแรม" = การ+จอง+โรงแรม, "ตั๋วรถ" = ตั๋ว+รถ, "ของ" = ของ.
// "การบินไทย" = การ + "บินไทย" (not a type word) → not structural → stays in the query.
function decomposeToken(tok: string): { ok: boolean; type?: BookingType } {
  if (tok === "") return { ok: true };
  const exact = TYPE_WORDS[tok];
  if (exact) return { ok: true, type: exact };
  for (const f of FILLERS) {
    if (tok.startsWith(f)) {
      const r = decomposeToken(tok.slice(f.length));
      if (r.ok) return r;
    }
  }
  return { ok: false };
}

export function parseBookingRest(rest: string, dateCtx: TripDateCtx): { filter: BookingFilter; outOfRange: boolean } {
  const d = extractDate(norm(rest), dateCtx);
  let type: BookingType | undefined;
  const query: string[] = [];
  for (const tok of norm(d.rest).split(" ")) {
    if (!tok) continue;
    const r = decomposeToken(tok);
    // A second, different type word is treated as search text.
    if (r.ok && (!r.type || !type || r.type === type)) type = type ?? r.type;
    else query.push(tok);
  }
  return { filter: { type, date: d.date ?? undefined, query: query.join(" ") }, outOfRange: d.outOfRange };
}

export function filterFromPostback(data: Record<string, string>): BookingFilter {
  const t = data.t as BookingType;
  return { type: BOOKING_TYPES.includes(t) ? t : undefined, date: data.d || undefined, query: data.q ?? "" };
}

export function bookingEnd(b: Booking): string {
  return b.date_to || b.date_from;
}

export function coversDate(b: Booking, date: string): boolean {
  return b.date_from !== "" && b.date_from <= date && date <= bookingEnd(b);
}

export function isPast(b: Booking, today: string): boolean {
  const end = bookingEnd(b);
  return end !== "" && end < today;
}

export function isStaying(b: Booking, today: string): boolean {
  return b.type === "hotel" && coversDate(b, today);
}

export function filterBookings(bookings: Booking[], f: BookingFilter): Booking[] {
  return bookings.filter(
    (b) =>
      (!f.type || b.type === f.type) &&
      (!f.date || coversDate(b, f.date)) &&
      includesCI([b.vendor, b.ref_no, b.detail, b.notes], f.query),
  );
}

const sortKey = (b: Booking) => `${b.date_from || "9999-99-99"} ${b.time_from || "99:99"}`;

export function sortBookings(bookings: Booking[], today: string): { upcoming: Booking[]; past: Booking[] } {
  const upcoming = bookings.filter((b) => !isPast(b, today)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const past = bookings.filter((b) => isPast(b, today)).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return { upcoming, past };
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function nights(b: Booking): number {
  return b.date_from && b.date_to && b.date_to > b.date_from ? daysBetween(b.date_from, b.date_to) : 0;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// today/nowHHMM are already in the trip timezone (see tripDateCtx / tripNowHHMM).
export function countdown(b: Booking, today: string, nowHHMM: string): string {
  if (!b.date_from) return "";
  if (isPast(b, today)) return "ผ่านไปแล้ว";
  if (b.date_from > today) return `อีก ${daysBetween(today, b.date_from)} วัน`;
  if (b.date_from === today && b.time_from) {
    const diff = toMin(b.time_from) - toMin(nowHHMM);
    if (diff >= 60) return `อีก ${Math.floor(diff / 60)} ชม.`;
    if (diff > 0) return `อีก ${diff} นาที`;
  }
  return isStaying(b, today) ? "กำลังพัก" : "วันนี้";
}

export function bookingTitle(b: Booking): string {
  const first = firstLine(b.detail);
  return (first && truncate(first, 30)) || b.vendor || typeMeta(b.type).label;
}

export function linkedPlanItems(itinerary: ItineraryItem[], bookingId: string): ItineraryItem[] {
  return itinerary
    .filter((it) => it.linked_booking_id === bookingId && it.status !== "moved")
    .sort((a, b) => a.day_date.localeCompare(b.day_date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.sort_order - b.sort_order);
}
