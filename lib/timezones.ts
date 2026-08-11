// Curated IANA timezones for common Thai-traveler destinations -- a full
// tz database dropdown (400+ entries) is noise for a picker meant to be
// answered in one glance while filling out a trip.
export const TZ_OPTIONS: { tz: string; label: string }[] = [
  { tz: "Asia/Bangkok", label: "กรุงเทพฯ (ไทย)" },
  { tz: "Asia/Tokyo", label: "โตเกียว · ญี่ปุ่น" },
  { tz: "Asia/Seoul", label: "โซล · เกาหลีใต้" },
  { tz: "Asia/Shanghai", label: "จีน (เซี่ยงไฮ้/ปักกิ่ง)" },
  { tz: "Asia/Hong_Kong", label: "ฮ่องกง" },
  { tz: "Asia/Taipei", label: "ไต้หวัน" },
  { tz: "Asia/Singapore", label: "สิงคโปร์" },
  { tz: "Asia/Kuala_Lumpur", label: "มาเลเซีย" },
  { tz: "Asia/Jakarta", label: "อินโดนีเซีย (จาการ์ตา)" },
  { tz: "Asia/Manila", label: "ฟิลิปปินส์" },
  { tz: "Asia/Ho_Chi_Minh", label: "เวียดนาม" },
  { tz: "Asia/Kolkata", label: "อินเดีย" },
  { tz: "Asia/Dubai", label: "ดูไบ · UAE" },
  { tz: "Europe/London", label: "ลอนดอน · UK" },
  { tz: "Europe/Paris", label: "ยุโรปกลาง (ปารีส/เบอร์ลิน/โรม)" },
  { tz: "Europe/Moscow", label: "มอสโก" },
  { tz: "Australia/Sydney", label: "ซิดนีย์ · ออสเตรเลีย" },
  { tz: "Pacific/Auckland", label: "นิวซีแลนด์" },
  { tz: "America/New_York", label: "นิวยอร์ก (US ตะวันออก)" },
  { tz: "America/Los_Angeles", label: "ลอสแอนเจลิส (US ตะวันตก)" },
];

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok";
  } catch {
    return "Asia/Bangkok";
  }
}

// UTC offset in minutes for a timezone at a given instant, DST-aware.
export function tzOffsetMinutes(tz: string, date: Date): number {
  const raw = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = raw.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!match) return 0;
  const h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  return h * 60 + (h < 0 ? -m : m);
}

export function tzClock(tz: string, date: Date): string {
  return new Intl.DateTimeFormat("th-TH", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
