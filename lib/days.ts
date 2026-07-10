const THAI_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export function tripDays(start: string, end: string): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  for (let i = 1; d <= last; i++, d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ date: iso, label: `วัน ${i} ${THAI_DOW[d.getDay()]} ${d.getDate()}` });
  }
  return out;
}
