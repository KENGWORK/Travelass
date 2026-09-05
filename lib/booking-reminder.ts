import type { Booking } from "./models/types";

const DAY_MS = 86400000;
const GRACE_MS = 2 * 3600000;

type ReminderBooking = Pick<Booking, "date_from" | "time_from">;

function startOfDayMs(dateISO: string): number {
  return new Date(dateISO + "T00:00:00").getTime();
}

export function eventStartMs(booking: ReminderBooking): number {
  if (booking.time_from) return new Date(`${booking.date_from}T${booking.time_from}:00`).getTime();
  return startOfDayMs(booking.date_from);
}

// Window: from midnight the day before the event, through 2 hours after
// the event actually starts (for a timed booking) -- or through the end
// of the event's own day (for a date-only booking, e.g. a hotel stay,
// which has no start time to add a grace period to).
function reminderWindow(booking: ReminderBooking): { start: number; end: number } {
  const dayStart = startOfDayMs(booking.date_from);
  const start = dayStart - DAY_MS;
  const end = booking.time_from ? eventStartMs(booking) + GRACE_MS : dayStart + DAY_MS;
  return { start, end };
}

export function isReminderActive(booking: ReminderBooking, now: number): boolean {
  if (!booking.date_from) return false;
  const { start, end } = reminderWindow(booking);
  return now >= start && now <= end;
}

export function upcomingReminders<T extends ReminderBooking>(bookings: T[], now: number): T[] {
  return bookings.filter((b) => isReminderActive(b, now)).sort((a, b) => eventStartMs(a) - eventStartMs(b));
}

// Countdown text for the reminder banner: still counting down before the
// event starts, "ถึงเวลาแล้ว" once inside the grace window (a negative
// countdown reads as broken, not urgent).
export function countdownLabel(booking: ReminderBooking, now: number): string {
  const start = eventStartMs(booking);
  if (now >= start) return "ถึงเวลาแล้ว";
  const diffMin = Math.round((start - now) / 60000);
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours === 0) return `อีก ${minutes} นาที`;
  if (minutes === 0) return `อีก ${hours} ชม.`;
  return `อีก ${hours} ชม. ${minutes} นาที`;
}

// Scoped by booking id AND day so dismissing today's reminder doesn't
// silently suppress tomorrow's re-appearance of the same booking.
export function dismissKey(bookingId: string, todayISO: string): string {
  return `travelass:dismissed-reminder:${bookingId}:${todayISO}`;
}
