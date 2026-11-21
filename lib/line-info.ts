// Pure quick-info / quick-notes logic. Server-side: no localStorage, so the
// app's lib/quickinfo-order.ts override is intentionally NOT used here.
import type { QuickInfo, QuickNote } from "@/lib/models/types";
import { includesCI, firstLine } from "@/lib/line-view-kit";

export type ValueKind = "phone" | "url" | "address" | "text";

const PHONE_RE = /^\+?[\d\s-]+$/;
const ADDRESS_LABEL_RE = /ที่อยู่|address|โรงแรม|hotel/i;
const ADDRESS_VALUE_RE = /\b(road|rd|st|street)\b|[道號街]/i;

export function classifyValue(label: string, value: string): ValueKind {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return "url";
  if (PHONE_RE.test(v)) {
    const digits = v.replace(/\D/g, "").length;
    if (digits >= 3 && digits <= 20) return "phone";
  }
  if (ADDRESS_LABEL_RE.test(label) || ADDRESS_VALUE_RE.test(v)) return "address";
  return "text";
}

export function telUri(value: string): string {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}

export function sortQuickInfo(rows: QuickInfo[]): QuickInfo[] {
  return [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sort_order - b.sort_order);
}

export function searchQuickInfo(rows: QuickInfo[], query: string): QuickInfo[] {
  return rows.filter((r) => includesCI([r.label, r.value], query));
}

export function sortNotes(rows: QuickNote[]): QuickNote[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

export function searchNotes(rows: QuickNote[], query: string): QuickNote[] {
  return rows.filter((n) => includesCI([n.title, n.content], query));
}

export function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
}

export function noteTitle(n: QuickNote): string {
  return n.title.trim() || firstLine(n.content) || "(ไม่มีหัวข้อ)";
}

export function bigTextSize(value: string): "5xl" | "4xl" | "3xl" {
  const n = Array.from(value).length;
  return n <= 20 ? "5xl" : n <= 60 ? "4xl" : "3xl";
}
