// Text helpers shared by every LINE command parser. Pure.

const POLITE_PREFIXES = ["ขอดู", "ขอ"] as const;
const ASCII_WORD_CHAR = /[a-z0-9]/i;

// "ขอดูขอแพลน" -> "แพลน". Repeatable, so stacked politeness still parses.
// Note: this also eats the "ขอ" of words like "ขอบคุณ" -- harmless, since
// routing only cares whether a known command keyword follows.
export function stripPolitePrefix(text: string): string {
  let s = text.replace(/\s+/g, " ").trim();
  for (;;) {
    const prefix = POLITE_PREFIXES.find((p) => s.startsWith(p));
    if (!prefix) return s;
    s = s.slice(prefix.length).trim();
  }
}

// Keyword must START the (polite-stripped) message. Longest keyword wins so
// "ข้อมูลด่วน" beats "ข้อมูล". Thai has no spaces, so Thai keywords are a
// plain prefix match; an English keyword needs a word boundary after it so
// "plan" doesn't fire on "planet".
export function matchKeyword(text: string, keywords: readonly string[]): { keyword: string; rest: string } | null {
  const s = stripPolitePrefix(text);
  const lower = s.toLowerCase();
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const keyword of sorted) {
    const k = keyword.toLowerCase();
    if (!k || !lower.startsWith(k)) continue;
    const last = k[k.length - 1];
    const next = lower.charAt(k.length);
    if (ASCII_WORD_CHAR.test(last) && next !== "" && ASCII_WORD_CHAR.test(next)) continue;
    return { keyword, rest: s.slice(k.length).trim() };
  }
  return null;
}

export function hasDigit(text: string): boolean {
  return /[0-9๐-๙]/.test(text);
}
