// LINE restaurants / wishlist view -- I/O only; logic in lib/line-places*.ts.
import { listRows, updateRow } from "@/lib/store";
import type { EntityName } from "@/lib/models/mappers";
import type { Restaurant, Trip, WishItem } from "@/lib/models/types";
import type { HandlerCtx, PostbackData } from "@/lib/line-handlers/types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { decodePlaceFilter, normalizePlace, parsePlacesRest, type PlaceFilter, type PlaceKind } from "@/lib/line-places";
import { buildPlacesReply, buildSinglePlaceMessage, PLACE_KIND_META } from "@/lib/line-places-messages";
import { NO_TRIP_TEXT, GONE_TEXT, albumMessage, appUrl } from "@/lib/line-view-kit";

type PlaceRow = Restaurant | WishItem;

const ENTITY: Record<PlaceKind, EntityName> = { r: "restaurants", w: "wishlist" };

const loadRows = (tripId: string, kind: PlaceKind) => listRows<PlaceRow>(ENTITY[kind], tripId);

async function replyList(ctx: HandlerCtx, trip: Trip, kind: PlaceKind, filter: PlaceFilter, page: number, fromCommand: boolean): Promise<void> {
  const rows = await loadRows(trip.id, kind);
  await ctx.reply(
    buildPlacesReply({ trip, origin: ctx.origin, kind, places: rows.map((r) => normalizePlace(r, kind)), filter, page, fromCommand }),
  );
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "places") return;
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  await replyList(ctx, trip, route.placeKind, parsePlacesRest(route.rest), 1, true);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  const trip = ctx.trip;
  if (!trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const kind: PlaceKind = data.k === "w" ? "w" : "r";

  if (data.a === "pl_list") return replyList(ctx, trip, kind, decodePlaceFilter(data.f, data.q), Number(data.n) || 1, false);

  const rows = await loadRows(trip.id, kind);
  const row = rows.find((r) => r.id === data.id);
  if (!row) return ctx.reply([textMessage(GONE_TEXT)]);

  if (data.a === "pl_photos") {
    if (!row.photo_ids.length) return ctx.reply([textMessage("รายการนี้ไม่มีรูป")]);
    return ctx.reply([
      albumMessage({ origin: ctx.origin, photoIds: row.photo_ids, title: row.name, moreUrl: appUrl(ctx.origin, trip.id, `info?tab=${PLACE_KIND_META[kind].tab}`) }),
    ]);
  }

  if (data.a === "pl_visit" || data.a === "pl_unvisit") {
    const target = data.a === "pl_visit";
    const expectedCurrent = data.v === "1";
    // Re-check: the other person (or the app) may have flipped it since this card was sent.
    if (row.visited !== expectedCurrent || row.visited === target) {
      return ctx.reply([textMessage("สถานะเปลี่ยนไปแล้ว นี่คือข้อมูลล่าสุด"), buildSinglePlaceMessage(ctx.origin, normalizePlace(row, kind))]);
    }
    const updated: PlaceRow = { ...row, visited: target };
    await updateRow<PlaceRow>(ENTITY[kind], row.id, updated);
    return ctx.reply([buildSinglePlaceMessage(ctx.origin, normalizePlace(updated, kind))]);
  }
}
