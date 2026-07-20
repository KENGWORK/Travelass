// Pure date-math for "trip dates were wrong, move everything with them" —
// when a trip's start_date is edited, every day-scoped row (itinerary,
// transports, bookings) shifts by the same delta so nobody has to
// re-enter their whole plan just to fix a typo'd date.

export function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / msPerDay);
}

export function shiftDate(date: string, days: number): string {
  if (!date || days === 0) return date;
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
