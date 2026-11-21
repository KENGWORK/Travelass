// Pure Flex builders for the LINE restaurants / wishlist view.
import type { Trip } from "@/lib/models/types";
import { CLAY, compact, txt, postbackAction, flexMessage, textMessage, quickReply, type FlexNode } from "@/lib/line-flex";
import { mapButtons } from "@/lib/line-maps";
import {
  countPlaces, describePlaceFilter, encodePlaceFilter, filterPlaces, isPlaceFiltered, paginatePlaces, placeMapsQuery,
  sortPlaces, starLabel, topAreas, type Place, type PlaceFilter, type PlaceKind,
} from "@/lib/line-places";
import { appUrl, btn, emptyStateMessage, joinParts, truncate, zoomHero } from "@/lib/line-view-kit";

export const PLACE_KIND_META: Record<PlaceKind, { icon: string; title: string; empty: string; tab: string }> = {
  r: { icon: "🍜", title: "ร้านอาหาร", empty: "ยังไม่มีร้านในทริปนี้", tab: "restaurants" },
  w: { icon: "📍", title: "ที่อยากไป", empty: "ยังไม่มีที่เที่ยวในทริปนี้", tab: "wishlist" },
};

function filterData(kind: PlaceKind, f: PlaceFilter): Record<string, string | undefined> {
  return { k: kind, f: encodePlaceFilter(f) || undefined, q: f.query || undefined };
}

export function buildPlaceBubble(origin: string, p: Place): FlexNode {
  const photo = p.photoIds[0];
  const badge = joinParts([p.starred ? `⭐ ${starLabel(p.kind)}` : null, p.visited ? "✓ ไปแล้ว" : null]) || undefined;
  const name = !photo && badge ? `${p.name}  ${badge}` : p.name;
  const line = joinParts([p.area ? `📍 ${p.area}` : null, p.kind === "r" && p.priceLevel > 0 ? "฿".repeat(p.priceLevel) : null]);
  const toggle = p.visited
    ? btn(postbackAction("↩ ยังไม่ไป", { a: "pl_unvisit", k: p.kind, id: p.id, v: 1 }))
    : btn(postbackAction("✓ ไปแล้ว", { a: "pl_visit", k: p.kind, id: p.id, v: 0 }), "primary");
  return {
    type: "bubble",
    size: "kilo",
    ...(photo ? { hero: zoomHero({ origin, photoId: photo, badge }) } : {}),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: compact([
        txt(name || "(ไม่มีชื่อ)", { weight: "bold", size: "md", wrap: true, maxLines: 2, color: p.visited ? CLAY.grayInk : CLAY.ink }),
        txt(line || null, { size: "xs", wrap: true, color: CLAY.muted }),
        txt(p.note || null, { size: "xs", wrap: true, maxLines: 3, color: CLAY.muted }),
      ]),
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: compact([
        ...mapButtons({ query: placeMapsQuery(p), mapsLink: p.mapsLink || undefined }),
        p.photoIds.length ? btn(postbackAction(`📷 รูป (${p.photoIds.length})`, { a: "pl_photos", k: p.kind, id: p.id })) : null,
        toggle,
      ]),
    },
  };
}

export function buildSinglePlaceMessage(origin: string, p: Place): FlexNode {
  return flexMessage(truncate(p.name || PLACE_KIND_META[p.kind].title, 400), { type: "carousel", contents: [buildPlaceBubble(origin, p)] });
}

function headerBubble(kind: PlaceKind, all: Place[], matched: Place[], f: PlaceFilter): FlexNode {
  const meta = PLACE_KIND_META[kind];
  const c = countPlaces(matched);
  const filtered = isPlaceFiltered(f);
  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: CLAY.cream,
      contents: compact([
        txt(`${meta.icon} ${meta.title} · ${matched.length}`, { weight: "bold", size: "lg", wrap: true, color: CLAY.ink }),
        txt(`${starLabel(kind)} ${c.starred} · ยังไม่ไป ${c.unvisited} · ไปแล้ว ${c.visited}`, { size: "xs", wrap: true, color: CLAY.muted }),
        filtered ? txt(`กรอง: ${describePlaceFilter(f, kind)}`, { size: "xs", wrap: true, color: CLAY.coral }) : null,
      ]),
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: compact([
        ...topAreas(all, 4).map((a) => btn(postbackAction(`${truncate(a.area, 14)} (${a.count})`, { a: "pl_list", k: kind, q: a.area }))),
        filtered
          ? btn(postbackAction("ล้างตัวกรอง", { a: "pl_list", k: kind }), "link")
          : btn(postbackAction(`⭐ เฉพาะ${starLabel(kind)}`, { a: "pl_list", k: kind, f: "s" }), "primary"),
      ]),
    },
  };
}

function moreBubble(kind: PlaceKind, f: PlaceFilter, nextPage: number, remaining: number): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      contents: [btn(postbackAction(`ดูต่อ (${remaining})`, { a: "pl_list", ...filterData(kind, f), n: nextPage }), "primary")],
    },
  };
}

export function buildPlacesCarousel(p: { origin: string; kind: PlaceKind; all: Place[]; matched: Place[]; filter: PlaceFilter; page: number }): FlexNode {
  const page = Math.max(1, Math.floor(p.page) || 1);
  const pg = paginatePlaces(p.matched, page);
  const bubbles = compact([
    pg.withHeader ? headerBubble(p.kind, p.all, p.matched, p.filter) : null,
    ...pg.items.map((pl) => buildPlaceBubble(p.origin, pl)),
    pg.remaining > 0 ? moreBubble(p.kind, p.filter, page + 1, pg.remaining) : null,
  ]);
  const meta = PLACE_KIND_META[p.kind];
  return flexMessage(truncate(`${meta.icon} ${meta.title} · ${p.matched.length}`, 400), { type: "carousel", contents: bubbles });
}

function areaQuickReply(kind: PlaceKind, places: Place[]): FlexNode | undefined {
  const areas = topAreas(places, 13);
  return areas.length ? quickReply(areas.map((a) => ({ label: a.area, data: { a: "pl_list", k: kind, q: a.area } }))) : undefined;
}

export function buildPlacesReply(p: { trip: Trip; origin: string; kind: PlaceKind; places: Place[]; filter: PlaceFilter; page: number; fromCommand: boolean }): FlexNode[] {
  const meta = PLACE_KIND_META[p.kind];
  if (p.places.length === 0) return [emptyStateMessage(meta.empty, appUrl(p.origin, p.trip.id, `info?tab=${meta.tab}`))];
  const matched = sortPlaces(filterPlaces(p.places, p.filter));
  if (matched.length === 0) return [textMessage(`ไม่เจอ '${describePlaceFilter(p.filter, p.kind)}'`, areaQuickReply(p.kind, p.places))];
  if (p.fromCommand && p.filter.query && matched.length === 1) return [buildSinglePlaceMessage(p.origin, matched[0])];
  const page = paginatePlaces(matched, p.page).items.length ? p.page : 1;
  return [buildPlacesCarousel({ origin: p.origin, kind: p.kind, all: p.places, matched, filter: p.filter, page })];
}
