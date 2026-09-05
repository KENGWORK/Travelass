export function todayISO(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Which day's diary card opens by default -- today's, if the trip is
// currently running; the first day, if the trip hasn't started yet (nothing
// to catch up on, so jump to day 1); otherwise null (trip already ended --
// every day starts collapsed, a reading-mode view over the whole diary).
export function defaultOpenDiaryDate(dates: string[], today: string): string | null {
  if (dates.length === 0) return null;
  if (dates.includes(today)) return today;
  if (today < dates[0]) return dates[0];
  return null;
}
