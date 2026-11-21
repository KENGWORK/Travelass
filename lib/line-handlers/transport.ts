// lib/line-handlers/transport.ts
// LINE "เดินทาง" feature: I/O glue only -- logic in lib/line-transport.ts,
// layout in lib/line-transport-messages.ts. View-only: nothing is written.
import { listRows } from "@/lib/store";
import { nowHHMMInTz, tripDateCtx, type TripDateCtx } from "@/lib/line-date";
import { textMessage, type FlexNode } from "@/lib/line-flex";
import { NO_TRIP_TEXT } from "@/lib/line-menu";
import type { Route } from "@/lib/line-router";
import type { ItineraryItem, Transport, Trip } from "@/lib/models/types";
import { inTrip, dayWindow } from "@/lib/line-plan";
import { albumMessage, buildDayPicker, tripRangeText } from "@/lib/line-plan-messages";
import { parseTransportQuery, runTransportSearch, sortTransports, nextTransport, searchTransports, transportDates } from "@/lib/line-transport";
import { buildTransportList, buildTransportDetail, buildPlanPicker } from "@/lib/line-transport-messages";
import type { HandlerCtx, PostbackData } from "./types";

interface Loaded {
  trip: Trip;
  transports: Transport[];
  today: string;
  now: string;
  dateCtx: TripDateCtx;
}

async function load(trip: Trip, now: Date): Promise<Loaded> {
  const transports = await listRows<Transport>("transports", trip.id);
  const dateCtx = tripDateCtx(trip, now);
  return { trip, transports, today: dateCtx.today, now: nowHHMMInTz(trip.trip_timezone, now), dateCtx };
}

const within = (L: Loaded, date: string): boolean => inTrip(date, L.trip.start_date, L.trip.end_date);

function dayList(L: Loaded, date: string, page: number): FlexNode {
  const list = sortTransports(L.transports.filter((t) => t.day_date === date), L.now, date === L.today);
  return buildTransportList({
    mode: { kind: "day", date, start: L.trip.start_date, end: L.trip.end_date },
    transports: list,
    nowHHMM: L.now,
    today: L.today,
    page,
  });
}

// Same rules for a typed search and a tr_list?q= page, so "ดูต่อ" / "กลับรายการ"
// reproduce exactly the results the user saw.
function searchResults(L: Loaded, query: string): Transport[] {
  const q = parseTransportQuery(query, false, L.dateCtx);
  return q.kind === "search" ? runTransportSearch(L.transports, q) : searchTransports(L.transports, query);
}

function searchList(L: Loaded, query: string, page: number): FlexNode {
  return buildTransportList({
    mode: { kind: "search", query },
    transports: searchResults(L, query),
    nowHHMM: L.now,
    today: L.today,
    page,
  });
}

function outOfRangeMessage(L: Loaded): FlexNode {
  const { start_date: start, end_date: end } = L.trip;
  return buildDayPicker(tripRangeText(start, end), dayWindow(start, end, L.today, 13), start, "tr_list");
}

async function linkedItems(L: Loaded, t: Transport): Promise<ItineraryItem[]> {
  const items = await listRows<ItineraryItem>("itinerary", L.trip.id);
  return items.filter((it) => it.linked_transport_id === t.id);
}

async function detailMessage(ctx: HandlerCtx, L: Loaded, t: Transport, back: { d?: string; q?: string }): Promise<FlexNode> {
  return buildTransportDetail({
    origin: ctx.origin,
    t,
    nowHHMM: L.now,
    today: L.today,
    planItems: await linkedItems(L, t),
    back,
  });
}

export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  if (route.kind !== "transport") return;
  if (!ctx.trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const L = await load(ctx.trip, ctx.now);
  const q = parseTransportQuery(route.rest, route.next, L.dateCtx);

  if (q.kind === "out_of_range") return ctx.reply([outOfRangeMessage(L)]);

  if (q.kind === "day") {
    if (!within(L, q.date)) return ctx.reply([outOfRangeMessage(L)]);
    return ctx.reply([dayList(L, q.date, 1)]);
  }

  if (q.kind === "search") {
    const found = runTransportSearch(L.transports, q);
    if (found.length === 0) {
      const days = transportDates(L.transports).filter((d) => within(L, d));
      return ctx.reply([buildDayPicker(`ไม่เจอการเดินทาง "${q.query}"`, days, L.trip.start_date, "tr_list")]);
    }
    if (found.length === 1) return ctx.reply([await detailMessage(ctx, L, found[0], { q: q.query })]);
    return ctx.reply([searchList(L, q.query, 1)]);
  }

  // รอบต่อไป / รถรอบถัดไป -- today's next departure, straight to the detail.
  const todays = sortTransports(L.transports.filter((t) => t.day_date === L.today), L.now, true);
  const next = nextTransport(todays, L.now);
  if (!next) {
    const none = textMessage("วันนี้ไม่มีการเดินทางรอบถัดไปแล้ว");
    return ctx.reply(todays.length > 0 ? [none, dayList(L, L.today, 1)] : [none]);
  }
  return ctx.reply([await detailMessage(ctx, L, next, { d: L.today })]);
}

const ROW_ACTIONS = new Set(["tr_detail", "tr_photos", "tr_note", "tr_plan"]);

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  if (!ctx.trip) return ctx.reply([textMessage(NO_TRIP_TEXT)]);
  const L = await load(ctx.trip, ctx.now);
  const page = Math.max(1, Number(data.n) || 1);

  if (data.a === "tr_list") {
    if (data.q) return ctx.reply([searchList(L, data.q, page)]);
    const date = data.d && within(L, data.d) ? data.d : L.today;
    if (!within(L, date)) return ctx.reply([outOfRangeMessage(L)]);
    return ctx.reply([dayList(L, date, page)]);
  }
  if (!ROW_ACTIONS.has(data.a)) return;

  const t = L.transports.find((x) => x.id === data.id);
  if (!t) return ctx.reply([textMessage("การเดินทางนี้ถูกลบไปแล้ว")]);

  switch (data.a) {
    case "tr_detail":
      return ctx.reply([await detailMessage(ctx, L, t, { d: data.d, q: data.q })]);
    case "tr_photos":
      if (t.pickup_photo_ids.length === 0) return ctx.reply([await detailMessage(ctx, L, t, {})]);
      return ctx.reply([
        albumMessage({
          origin: ctx.origin,
          photoIds: t.pickup_photo_ids,
          title: `จุดขึ้นรถ · ${t.from} → ${t.to}`,
          moreUrl: `${ctx.origin}/trips/${L.trip.id}/transport`,
        }),
      ]);
    case "tr_note":
      return ctx.reply([textMessage((t.notes || "ไม่มีโน้ต").slice(0, 5000))]);
    default: {
      // tr_plan
      const items = await linkedItems(L, t);
      return ctx.reply([items.length > 0 ? buildPlanPicker(items) : textMessage("ไม่มีรายการในแพลนที่ผูกกับการเดินทางนี้")]);
    }
  }
}
