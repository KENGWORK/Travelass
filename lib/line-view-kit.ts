// Shared pure helpers for the read-only LINE views (booking, places, quick info/notes).
import { CLAY, compact, txt, uriAction, imageUrl, flexMessage, textMessage, buildPhotoAlbum, type FlexNode } from "@/lib/line-flex";
import { nowHHMMInTz, thaiDateLabel } from "@/lib/line-date";
import type { Trip } from "@/lib/models/types";

// Re-exported (not redefined) so the wording stays single-sourced in the foundation's lib/line-menu.ts.
// tripDateCtx lives in lib/line-date.ts (foundation); import it from there.
export { NO_TRIP_TEXT } from "@/lib/line-menu";
export const GONE_TEXT = "ไม่เจอรายการนี้แล้ว (อาจถูกลบในแอป)";
export const LIST_PAGE_SIZE = 15;

export function tripNowHHMM(trip: Trip, now: Date): string {
  return nowHHMMInTz(trip.trip_timezone, now);
}

export function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// Every whitespace-separated query token must appear in at least one field
// ("wifi 5G" matches label "wifi" + value "HK-5G").
export function includesCI(fields: (string | null | undefined)[], query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields.map((f) => (f ?? "").toLowerCase());
  return tokens.every((t) => hay.some((h) => h.includes(t)));
}

// Counts code points (not UTF-16 units) so Thai/emoji are not split mid-character.
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}

export function firstLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "") ?? "";
}

// Heuristic for "will Flex maxLines cut this?" -- explicit newlines plus soft wraps.
export function exceedsLines(text: string, maxLines: number, charsPerLine = 32): boolean {
  const visual = text
    .split(/\r?\n/)
    .reduce((sum, l) => sum + Math.max(1, Math.ceil(Array.from(l).length / charsPerLine)), 0);
  return visual > maxLines;
}

export function pageSlice<T>(items: T[], page: number, size = LIST_PAGE_SIZE): { items: T[]; hasMore: boolean } {
  const p = Math.max(1, Math.floor(page) || 1);
  const start = (p - 1) * size;
  return { items: items.slice(start, start + size), hasMore: items.length > start + size };
}

export function joinParts(parts: (string | null | undefined | false)[], sep = " · "): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(sep);
}

export function appUrl(origin: string, tripId: string, path: string): string {
  return `${origin}/trips/${encodeURIComponent(tripId)}/${path}`;
}

export function btn(action: FlexNode, style: "primary" | "secondary" | "link" = "secondary"): FlexNode {
  return { type: "button", style, height: "sm", ...(style === "primary" ? { color: CLAY.coral } : {}), action };
}

export function emptyStateMessage(text: string, openUrl: string): FlexNode {
  return flexMessage(truncate(text, 400), {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: CLAY.cream,
      paddingAll: "16px",
      contents: compact([txt(text, { wrap: true, size: "md", color: CLAY.ink })]),
    },
    footer: { type: "box", layout: "vertical", contents: [btn(uriAction("เปิดแอป", openUrl), "primary")] },
  });
}

const BADGE_BOX = { type: "box", layout: "vertical", position: "absolute", cornerRadius: "12px", paddingAll: "4px", paddingStart: "8px", paddingEnd: "8px" };

// Hero = the photo itself; tapping anywhere opens the full image in LINE's browser (zoom/save there).
export function zoomHero(p: { origin: string; photoId: string; badge?: string }): FlexNode {
  const full = imageUrl(p.origin, p.photoId);
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "0px",
    action: uriAction("ขยายรูป", full),
    contents: compact([
      { type: "image", url: full, size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      p.badge
        ? { ...BADGE_BOX, offsetTop: "8px", offsetStart: "8px", backgroundColor: "#FFFFFFE6", contents: compact([txt(p.badge, { size: "xs", weight: "bold", color: CLAY.ink })]) }
        : null,
      { ...BADGE_BOX, offsetBottom: "8px", offsetEnd: "8px", backgroundColor: "#00000080", contents: compact([txt("แตะเพื่อขยาย", { size: "xxs", color: "#FFFFFF" })]) },
    ]),
  };
}

// buildPhotoAlbum is specified as returning "a FlexNode" -- wrap it unless it is already a full message.
export function albumMessage(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode {
  const album = buildPhotoAlbum(p);
  return album.type === "flex" ? album : flexMessage(truncate(`📷 ${p.title}`, 400), album);
}

export function outOfRangeText(trip: Trip): string {
  return `วันที่นั้นอยู่นอกช่วงทริป (${thaiDateLabel(trip.start_date)} – ${thaiDateLabel(trip.end_date)})`;
}

// LINE text messages cap at 5000 chars. 4800 leaves room for the "…ยังมีต่อ อ่านในแอป <url>" suffix.
export const LONG_TEXT_CHUNK = 4800;

export function splitLongText(text: string, max = LONG_TEXT_CHUNK, maxParts = 5): { parts: string[]; truncated: boolean } {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > 0 && parts.length < maxParts) {
    if (rest.length <= max) {
      parts.push(rest);
      rest = "";
      break;
    }
    let cut = rest.lastIndexOf("\n", max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  return { parts, truncated: rest.length > 0 };
}

// Long free text (booking notes, quick notes) as ≤ 5 plain text messages.
export function longTextMessages(text: string, moreUrl: string, emptyText: string): FlexNode[] {
  const { parts, truncated } = splitLongText(text);
  if (parts.length === 0) return [textMessage(emptyText)];
  if (truncated) parts[parts.length - 1] += `\n…ยังมีต่อ อ่านในแอป ${moreUrl}`;
  return parts.map((t) => textMessage(t));
}
