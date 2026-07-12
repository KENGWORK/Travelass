// 24-hour time helpers. normalizeTime accepts loose typed input ("9", "930",
// "9:5", …) and returns a canonical "HH:MM" (or "" when there's no time).
export function normalizeTime(input: string): string {
  if (!input) return "";
  const s = input.trim();
  let h: number;
  let m: number;

  if (s.includes(":")) {
    const [hp, mp = ""] = s.split(":");
    const hd = hp.replace(/\D/g, "");
    const md = mp.replace(/\D/g, "");
    if (hd === "" && md === "") return "";
    h = hd === "" ? 0 : parseInt(hd, 10);
    m = md === "" ? 0 : parseInt(md, 10);
  } else {
    const d = s.replace(/\D/g, "");
    if (d === "") return "";
    if (d.length <= 2) {
      h = parseInt(d, 10);
      m = 0;
    } else if (d.length === 3) {
      h = parseInt(d.slice(0, 1), 10);
      m = parseInt(d.slice(1), 10);
    } else {
      h = parseInt(d.slice(0, 2), 10);
      m = parseInt(d.slice(2, 4), 10);
    }
  }

  if (Number.isNaN(h)) h = 0;
  if (Number.isNaN(m)) m = 0;
  h = Math.min(23, Math.max(0, h));
  m = Math.min(59, Math.max(0, m));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTimeRange(start: string, end?: string): string {
  if (!start) return "";
  return end ? `${start} - ${end}` : start;
}
