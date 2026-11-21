// Test-only helpers for the LINE view features. Never import from production code.
import { vi } from "vitest";
import { decodePostback, type FlexNode } from "@/lib/line-flex";
import type { HandlerCtx } from "@/lib/line-handlers/types";
import type { Booking, ItineraryItem, QuickInfo, QuickNote, Restaurant, Trip, WishItem } from "@/lib/models/types";

type Obj = Record<string, unknown>;

export function walk(node: unknown, visit: (o: Obj) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  if (node && typeof node === "object") {
    visit(node as Obj);
    Object.values(node as Obj).forEach((v) => walk(v, visit));
  }
}

export function texts(node: unknown): string[] {
  const out: string[] = [];
  walk(node, (o) => {
    if (o.type === "text" && typeof o.text === "string") out.push(o.text);
  });
  return out;
}

export function allText(node: unknown): string {
  return texts(node).join("\n");
}

export function hasEmptyText(node: unknown): boolean {
  let bad = false;
  walk(node, (o) => {
    if (o.type === "text" && (typeof o.text !== "string" || o.text === "")) bad = true;
  });
  return bad;
}

export function actionsOf(node: unknown): Obj[] {
  const out: Obj[] = [];
  walk(node, (o) => {
    if (o.action && typeof o.action === "object") out.push(o.action as Obj);
  });
  return out;
}

export function postbacksOf(node: unknown): Record<string, string>[] {
  return actionsOf(node)
    .filter((a) => a.type === "postback")
    .map((a) => decodePostback(String(a.data)));
}

export function countBubbles(node: unknown): number {
  let n = 0;
  walk(node, (o) => {
    if (o.type === "bubble") n++;
  });
  return n;
}

export function mkTrip(p: Partial<Trip> = {}): Trip {
  return {
    id: "t1", name: "HK", destination: "Hong Kong", start_date: "2026-11-19", end_date: "2026-11-24",
    home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
    home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong", ...p,
  };
}

export function mkBooking(p: Partial<Booking> = {}): Booking {
  return {
    id: "b1", trip_id: "t1", type: "flight", vendor: "", ref_no: "", date_from: "", date_to: "", time_from: "",
    detail: "", amount: 0, currency: "THB", fx_rate: 1, amount_thb: 0, payer: "", pay_timing: "prepaid",
    paid: false, slip_photo_ids: [], notes: "", ...p,
  };
}

export function mkItem(p: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: "i1", trip_id: "t1", day_date: "2026-11-20", time: "", end_time: "", title: "", place: "", maps_link: "",
    notes: "", status: "planned", moved_to_date: "", linked_transport_id: "", linked_booking_id: "",
    sort_order: 0, photo_ids: [], plan_id: "", ...p,
  };
}

export function mkRestaurant(p: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "r1", trip_id: "t1", name: "", area: "", maps_link: "", note: "", must_try: false, price_level: 0,
    visited: false, photo_ids: [], ...p,
  };
}

export function mkWish(p: Partial<WishItem> = {}): WishItem {
  return { id: "w1", trip_id: "t1", name: "", area: "", maps_link: "", note: "", star: false, visited: false, photo_ids: [], ...p };
}

export function mkQuickInfo(p: Partial<QuickInfo> = {}): QuickInfo {
  return { id: "q1", trip_id: "t1", label: "", value: "", photo_ids: [], pinned: false, sort_order: 0, ...p };
}

export function mkNote(p: Partial<QuickNote> = {}): QuickNote {
  return { id: "n1", trip_id: "t1", title: "", content: "", photo_ids: [], sort_order: 0, ...p };
}

// 2026-11-20T03:00Z = 11:00 on 2026-11-20 in Asia/Hong_Kong (mkTrip's timezone).
export function mkCtx(p: Partial<HandlerCtx> = {}): HandlerCtx {
  return {
    event: { type: "message", source: { type: "user", userId: "U1" } } as HandlerCtx["event"],
    replyToken: "rt",
    accessToken: "tok",
    origin: "https://app.test",
    now: new Date("2026-11-20T03:00:00Z"),
    userKey: "user:U1",
    isGroup: false,
    trip: mkTrip(),
    reply: vi.fn(async (messages: FlexNode[]) => { void messages; }),
    ...p,
  };
}

export function repliedMessages(ctx: HandlerCtx): FlexNode[] {
  const calls = vi.mocked(ctx.reply).mock.calls;
  return calls.length ? calls[0][0] : [];
}
