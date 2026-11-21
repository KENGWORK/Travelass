// lib/line-transport.ts
import type { Transport } from "@/lib/models/types";
import { extractDate, type TripDateCtx } from "@/lib/line-date";
import { normalizeTime } from "@/lib/time";

export type TransportQuery =
  | { kind: "next" }
  | { kind: "day"; date: string }
  | { kind: "search"; query: string; date: string | null; dateQuery: string }
  | { kind: "out_of_range" };

// The router already matched เดินทาง (next=false) or รอบต่อไป / รถรอบถัดไป
// (next=true) and handled the expense ambiguity; `rest` is what follows.
// A date token only means "that day" when it is ALL there is. With more text
// the token may be part of a name ("Sun Yat Sen" reads "sun" as Sunday,
// "อาทิตย์…"), so the full text is the query; the date + remainder are kept
// as a fallback search ("พรุ่งนี้ ดิสนีย์" = ดิสนีย์ on tomorrow).
export function parseTransportQuery(rest: string, next: boolean, ctx: TripDateCtx): TransportQuery {
  if (next) return { kind: "next" };
  const text = rest.trim().replace(/\s+/g, " ");
  if (text === "") return { kind: "day", date: ctx.today };
  const { date, rest: left, outOfRange } = extractDate(text, ctx);
  const leftover = left.trim();
  if (leftover === "") {
    if (outOfRange) return { kind: "out_of_range" };
    if (date) return { kind: "day", date };
  }
  const inTripDate = outOfRange ? null : date;
  return { kind: "search", query: text, date: inTripDate, dateQuery: inTripDate ? leftover : "" };
}

// Plain code-point comparison -- HH:MM / ISO dates are zero-padded, and "~"
// sorts after every digit, which is how blanks go last. (localeCompare would
// put punctuation before digits.)
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};
const pad = (n: number): string => String(n).padStart(2, "0");

export function departureTimes(t: Transport): string[] {
  return [...new Set(t.departure_times.map((s) => normalizeTime(s)).filter(Boolean))].sort(cmp);
}

export function effectiveDeparture(t: Transport, nowHHMM: string, isToday: boolean): { time: string; exhausted: boolean } {
  const times = departureTimes(t);
  if (times.length > 0 && isToday) {
    const upcoming = times.find((x) => x >= nowHHMM);
    return upcoming ? { time: upcoming, exhausted: false } : { time: times[times.length - 1], exhausted: true };
  }
  if (times.length > 0) return { time: normalizeTime(t.depart_time) || times[0], exhausted: false };
  return { time: normalizeTime(t.depart_time), exhausted: false };
}

export function addMinutes(hhmm: string, minutes: number): string {
  const total = (((toMin(hhmm) + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// arrive_time is paired with depart_time; for any other round (multi-departure
// legs) derive arrival from duration_min instead of showing a stale time.
export function arrivalTime(t: Transport, dep: string): string {
  if (t.arrive_time && dep === normalizeTime(t.depart_time)) return normalizeTime(t.arrive_time);
  if (t.duration_min > 0 && dep) return addMinutes(dep, t.duration_min);
  return "";
}

// Today only. An arrival earlier than the departure is an overnight leg and
// never counts as past on the departure day.
export function isPast(t: Transport, nowHHMM: string): boolean {
  const dep = effectiveDeparture(t, nowHHMM, true);
  if (!dep.time) return false;
  const arr = arrivalTime(t, dep.time);
  if (arr) return arr >= dep.time && arr < nowHHMM;
  return dep.time < nowHHMM;
}

export function sortTransports(list: Transport[], nowHHMM: string, isToday: boolean): Transport[] {
  const key = (t: Transport) => effectiveDeparture(t, nowHHMM, isToday).time || "~";
  return [...list].sort((a, b) => cmp(key(a), key(b)));
}

export function nextTransport(list: Transport[], nowHHMM: string): Transport | null {
  for (const t of sortTransports(list, nowHHMM, true)) {
    const dep = effectiveDeparture(t, nowHHMM, true);
    if (dep.time && !dep.exhausted && dep.time >= nowHHMM) return t;
  }
  return null;
}

export function countdown(nowHHMM: string, hhmm: string): string {
  if (!nowHHMM || !hhmm) return "";
  const diff = toMin(hhmm) - toMin(nowHHMM);
  if (diff < 0) return "";
  if (diff === 0) return "ออกตอนนี้";
  if (diff < 60) return `อีก ${diff} นาที`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `อีก ${h} ชม.` : `อีก ${h} ชม. ${m} นาที`;
}

const MODE_GROUPS: [string[], string][] = [
  [["mtr", "รถไฟ", "train", "metro"], "🚇"],
  [["bus", "บัส", "รถเมล์"], "🚌"],
  [["ferry", "เรือ"], "⛴"],
  [["taxi", "แท็กซี่", "didi", "uber", "grab"], "🚕"],
  [["เดิน", "walk"], "🚶"],
  [["flight", "บิน"], "✈️"],
];

export function modeIcon(mode: string): string {
  const m = mode.toLowerCase();
  return MODE_GROUPS.find(([words]) => words.some((w) => m.includes(w)))?.[1] ?? "🧭";
}

export function searchTransports(list: Transport[], query: string): Transport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (t: Transport) => [t.from, t.to, t.mode, t.notes, t.pickup_point].some((f) => (f || "").toLowerCase().includes(q));
  const key = (t: Transport) => `${t.day_date || "~"} ${effectiveDeparture(t, "", false).time || "~"}`;
  return list.filter(hit).sort((a, b) => cmp(key(a), key(b)));
}

// Full-text search first; if that finds nothing and the text started with a
// date, search the remainder within that day only.
export function runTransportSearch(list: Transport[], q: { query: string; date: string | null; dateQuery: string }): Transport[] {
  const full = searchTransports(list, q.query);
  if (full.length > 0 || !q.date || !q.dateQuery) return full;
  return searchTransports(list.filter((t) => t.day_date === q.date), q.dateQuery);
}

export function transportDates(list: Transport[]): string[] {
  return [...new Set(list.map((t) => t.day_date).filter(Boolean))].sort(cmp);
}
