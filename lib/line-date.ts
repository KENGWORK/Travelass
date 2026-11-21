import type { Trip } from "@/lib/models/types";

// Date parsing for LINE commands ("แพลน พรุ่งนี้", "จอง 21/11", ...). Pure:
// every function takes `now` / the trip window explicitly.

export interface TripDateCtx { start: string; end: string; today: string } // ISO yyyy-mm-dd

const DEFAULT_TZ = "Asia/Bangkok";
const DAY_MS = 86_400_000;

function tzParts(tz: string, now: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz || DEFAULT_TZ, ...opts });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TZ, ...opts });
  }
  return Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
}

export function todayInTz(tz: string, now: Date): string {
  const p = tzParts(tz, now, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

export function nowHHMMInTz(tz: string, now: Date): string {
  const p = tzParts(tz, now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${hour}:${p.minute}`;
}

function toUTC(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUTC(toUTC(date) + n * DAY_MS);
}

export function tripDayIndex(date: string, start: string): number {
  return Math.round((toUTC(date) - toUTC(start)) / DAY_MS) + 1;
}

function weekday(date: string): number {
  return new Date(toUTC(date)).getUTCDay();
}

// Validated y/m/d -> ISO; null for impossible dates like 31/2.
function isoOf(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return fromUTC(dt.getTime());
}

const THAI_DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const THAI_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_MONTH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const EN_MONTH_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function thaiDateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${THAI_DOW_SHORT[weekday(date)]} ${d} ${THAI_MONTH_SHORT[m - 1]}`;
}

export function tripDateCtx(trip: Pick<Trip, "start_date" | "end_date" | "trip_timezone">, now: Date): TripDateCtx {
  return { start: trip.start_date, end: trip.end_date, today: todayInTz(trip.trip_timezone, now) };
}

// ---- month words ---------------------------------------------------------

// word (lowercase, dots removed) -> month 1..12
const MONTH_LOOKUP: Record<string, number> = {};
THAI_MONTH_FULL.forEach((w, i) => (MONTH_LOOKUP[w] = i + 1));
THAI_MONTH_SHORT.forEach((w, i) => (MONTH_LOOKUP[w.replace(/\./g, "")] = i + 1));
EN_MONTH_FULL.forEach((w, i) => {
  MONTH_LOOKUP[w] = i + 1;
  MONTH_LOOKUP[w.slice(0, 3)] = i + 1;
});
MONTH_LOOKUP["sept"] = 9;

function monthFromWord(word: string): number | null {
  return MONTH_LOOKUP[word.toLowerCase().replace(/[.\s]/g, "")] ?? null;
}

// "พ.ย." -> "พ\.?ย\.?" so "พย", "พ.ย", "พ.ย." all match.
const THAI_ABBR_PATTERNS = THAI_MONTH_SHORT.map((a) => a.split(".").filter(Boolean).join("\\.?") + "\\.?");
const EN_MONTH_WORDS = [...EN_MONTH_FULL, "sept", ...EN_MONTH_FULL.map((w) => w.slice(0, 3))];
// Each alternative carries its own "not followed by a letter" guard, so
// "3 มีคน" / "3 พยาบาล" / "3 marchers" aren't dates.
const MONTH_ALT = [
  ...[...THAI_MONTH_FULL, ...THAI_ABBR_PATTERNS].map((w) => `${w}(?![ก-๙])`),
  ...EN_MONTH_WORDS.map((w) => `${w}(?![a-z])`),
]
  .sort((a, b) => b.length - a.length)
  .join("|");

// ---- token patterns (no "g" flag: exec() always returns the first match) --

const RELATIVE_OFFSET: Record<string, number> = {
  "เมื่อวานนี้": -1,
  "เมื่อวาน": -1,
  "มะรืนนี้": 2,
  "มะรืน": 2,
  "พรุ่งนี้": 1,
  "วันนี้": 0,
};
const RELATIVE_RE = new RegExp(`(${Object.keys(RELATIVE_OFFSET).sort((a, b) => b.length - a.length).join("|")})`);
// Explicit years are 2000-2699 only (CE, or BE 2400-2699), so an amount like
// "1500" after a date is never swallowed as the year.
const YEAR = "(2[0-6]\\d\\d)";
const DMY_RE = new RegExp(`(?<![\\d/])(?:วันที่\\s*)?(\\d{1,2})/(\\d{1,2})(?:/${YEAR})?(?![\\d/])`);
const D_MONTH_RE = new RegExp(`(?<![\\d/])(?:วันที่\\s*)?(\\d{1,2})\\s*(${MONTH_ALT})(?:\\s*${YEAR}(?!\\d))?`, "i");
const TRIP_DAY_RE = new RegExp("(?:วันที่|(?<![a-z])day)\\s*(\\d{1,2})(?![\\d/])", "i");

const THAI_DOW: Record<string, number> = {
  "อาทิตย์": 0, "จันทร์": 1, "อังคาร": 2, "พุธ": 3, "พฤหัสบดี": 4, "พฤหัส": 4, "ศุกร์": 5, "เสาร์": 6,
};
const EN_DOW: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const byLengthDesc = (o: Record<string, number>) => Object.keys(o).sort((a, b) => b.length - a.length).join("|");
const THAI_DOW_RE = new RegExp(`(?:วัน)?(${byLengthDesc(THAI_DOW)})`);
const EN_DOW_RE = new RegExp(`(?<![a-z])(${byLengthDesc(EN_DOW)})(?![a-z])`, "i");

function yearFor(explicit: string | undefined, month: number, ctx: TripDateCtx): number {
  if (explicit) {
    const y = Number(explicit);
    return y >= 2400 ? y - 543 : y; // Buddhist era (regex only admits 2000-2699)
  }
  const startYear = Number(ctx.start.slice(0, 4));
  const startMonth = Number(ctx.start.slice(5, 7));
  const endYear = Number(ctx.end.slice(0, 4));
  return endYear > startYear && month < startMonth ? endYear : startYear;
}

// First trip day >= today with that weekday; else first trip day with it;
// else (trip never hits that weekday) the next one from today -> out of range.
function resolveWeekday(target: number, ctx: TripDateCtx): string {
  const from = ctx.today > ctx.start ? ctx.today : ctx.start;
  for (let d = from; d <= ctx.end; d = addDays(d, 1)) if (weekday(d) === target) return d;
  for (let d = ctx.start; d <= ctx.end; d = addDays(d, 1)) if (weekday(d) === target) return d;
  let d = ctx.today;
  while (weekday(d) !== target) d = addDays(d, 1);
  return d;
}

interface Hit { index: number; length: number; date: string }

function firstHit(re: RegExp, text: string, resolve: (m: RegExpExecArray) => string | null): Hit | null {
  const m = re.exec(text);
  if (!m) return null;
  const date = resolve(m);
  return date ? { index: m.index, length: m[0].length, date } : null;
}

export function extractDate(text: string, ctx: TripDateCtx): { date: string | null; rest: string; outOfRange: boolean } {
  const clean = text.replace(/\s+/g, " ").trim();
  const hits = [
    firstHit(RELATIVE_RE, clean, (m) => addDays(ctx.today, RELATIVE_OFFSET[m[1]])),
    firstHit(DMY_RE, clean, (m) => {
      const month = Number(m[2]);
      return isoOf(yearFor(m[3], month, ctx), month, Number(m[1]));
    }),
    firstHit(D_MONTH_RE, clean, (m) => {
      const month = monthFromWord(m[2]);
      return month ? isoOf(yearFor(m[3], month, ctx), month, Number(m[1])) : null;
    }),
    firstHit(TRIP_DAY_RE, clean, (m) => addDays(ctx.start, Number(m[1]) - 1)),
    firstHit(THAI_DOW_RE, clean, (m) => resolveWeekday(THAI_DOW[m[1]], ctx)),
    firstHit(EN_DOW_RE, clean, (m) => resolveWeekday(EN_DOW[m[1].toLowerCase()], ctx)),
  ]
    .filter((h): h is Hit => h !== null)
    // earliest token wins; on a tie the longer one ("วันที่ 20 พ.ย." beats "วันที่ 20")
    .sort((a, b) => a.index - b.index || b.length - a.length);

  const hit = hits[0];
  if (!hit) return { date: null, rest: clean, outOfRange: false };
  const rest = `${clean.slice(0, hit.index)} ${clean.slice(hit.index + hit.length)}`.replace(/\s+/g, " ").trim();
  return { date: hit.date, rest, outOfRange: hit.date < ctx.start || hit.date > ctx.end };
}
