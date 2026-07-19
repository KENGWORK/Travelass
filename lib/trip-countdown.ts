const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

// `now` is injectable so this stays a pure, testable function instead of
// reading Date.now() directly.
export function tripCountdown(
  trip: { status: "planning" | "active" | "done"; start_date: string; end_date: string },
  now: number = Date.now(),
): string {
  const start = Date.parse(trip.start_date);
  if (trip.status === "done") return `${fmtDate(trip.start_date)} - ${fmtDate(trip.end_date)}`;
  // A trip can be marked "active" before its start_date actually arrives
  // (e.g. flipped early by hand) — in that case "วันที่ -N ของทริป" reads
  // as broken, so fall back to the same "อีก N วัน" countdown as planning.
  if (trip.status === "active" && now >= start) {
    const day = Math.floor((now - start) / 864e5) + 1;
    return `วันที่ ${day} ของทริป`;
  }
  const days = Math.ceil((start - now) / 864e5);
  return `อีก ${days} วัน`;
}
