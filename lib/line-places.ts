// Pure places-view logic (restaurants + wishlist share one shape: Place).
import type { Restaurant, WishItem } from "@/lib/models/types";
import { includesCI, norm, joinParts } from "@/lib/line-view-kit";

export type PlaceKind = "r" | "w";

export interface Place {
  id: string; kind: PlaceKind; name: string; area: string; mapsLink: string; note: string;
  starred: boolean; visited: boolean; priceLevel: number; photoIds: string[];
}

export interface PlaceFilter { starred?: boolean; visited?: boolean; query: string }

export function starLabel(kind: PlaceKind): string {
  return kind === "r" ? "ต้องลอง" : "ติดดาว";
}

export function normalizePlace(row: Restaurant | WishItem, kind: PlaceKind): Place {
  return {
    id: row.id,
    kind,
    name: row.name ?? "",
    area: row.area ?? "",
    mapsLink: row.maps_link ?? "",
    note: row.note ?? "",
    starred: kind === "r" ? Boolean((row as Restaurant).must_try) : Boolean((row as WishItem).star),
    visited: Boolean(row.visited),
    priceLevel: kind === "r" ? Number((row as Restaurant).price_level) || 0 : 0,
    photoIds: row.photo_ids ?? [],
  };
}

const FILTER_WORDS: Record<string, Partial<PlaceFilter>> = {
  "ต้องลอง": { starred: true },
  "ดาว": { starred: true },
  "ติดดาว": { starred: true },
  "ยังไม่ไป": { visited: false },
  "ไปแล้ว": { visited: true },
};

// Whole-token match only, so a place name containing e.g. "ดาว" is still searchable.
export function parsePlacesRest(rest: string): PlaceFilter {
  const f: PlaceFilter = { query: "" };
  const left: string[] = [];
  for (const tok of norm(rest).split(" ")) {
    if (!tok) continue;
    const hit = FILTER_WORDS[tok];
    if (hit) Object.assign(f, hit);
    else left.push(tok);
  }
  f.query = left.join(" ");
  return f;
}

export function encodePlaceFilter(f: PlaceFilter): string {
  return [f.starred ? "s" : "", f.visited === false ? "v0" : f.visited === true ? "v1" : ""].filter(Boolean).join(".");
}

export function decodePlaceFilter(f: string | undefined, q: string | undefined): PlaceFilter {
  const parts = (f ?? "").split(".");
  const out: PlaceFilter = { query: q ?? "" };
  if (parts.includes("s")) out.starred = true;
  if (parts.includes("v0")) out.visited = false;
  if (parts.includes("v1")) out.visited = true;
  return out;
}

export function filterPlaces(places: Place[], f: PlaceFilter): Place[] {
  return places.filter(
    (p) =>
      (!f.starred || p.starred) &&
      (f.visited === undefined || p.visited === f.visited) &&
      includesCI([p.name, p.area, p.note], f.query),
  );
}

const rank = (p: Place) => (p.starred ? 0 : p.visited ? 2 : 1);

export function sortPlaces(places: Place[]): Place[] {
  return [...places].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "th"));
}

export function topAreas(places: Place[], limit: number): { area: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of places) {
    const a = p.area.trim();
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
    .slice(0, limit);
}

export function countPlaces(places: Place[]): { starred: number; unvisited: number; visited: number } {
  return {
    starred: places.filter((p) => p.starred).length,
    unvisited: places.filter((p) => !p.visited).length,
    visited: places.filter((p) => p.visited).length,
  };
}

// Page 1 = header + 10 + "more"; later pages = 11 + "more" -> never above 12 bubbles.
export const FIRST_PAGE_SIZE = 10;
export const NEXT_PAGE_SIZE = 11;

export function paginatePlaces<T>(items: T[], page: number): { items: T[]; remaining: number; withHeader: boolean } {
  const p = Math.max(1, Math.floor(page) || 1);
  const start = p === 1 ? 0 : FIRST_PAGE_SIZE + (p - 2) * NEXT_PAGE_SIZE;
  const size = p === 1 ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE;
  const slice = items.slice(start, start + size);
  return { items: slice, remaining: Math.max(0, items.length - start - slice.length), withHeader: p === 1 };
}

export function isPlaceFiltered(f: PlaceFilter): boolean {
  return Boolean(f.starred) || f.visited !== undefined || f.query.trim() !== "";
}

export function describePlaceFilter(f: PlaceFilter, kind: PlaceKind): string {
  return joinParts([
    f.starred ? starLabel(kind) : null,
    f.visited === false ? "ยังไม่ไป" : f.visited === true ? "ไปแล้ว" : null,
    f.query,
  ]);
}

export function placeMapsQuery(p: Place): string {
  return `${p.name} ${p.area}`.trim();
}
