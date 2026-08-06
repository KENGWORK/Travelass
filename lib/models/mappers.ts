import type { Trip, ItineraryItem, Transport, Booking, Expense, ChecklistItem, Note, QuickInfo, Member, Restaurant, WishItem, TripApp, LinkItem, ShopItem, Phrase, QuickNote } from "./types";

type Kind = "s" | "n" | "b" | "a" | "j"; // string, number, bool, string-array, json

function makeMapper<T>(fields: [keyof T & string, Kind][]) {
  return {
    columns: fields.map(([k]) => k),
    toRow(obj: T): string[] {
      return fields.map(([k, kind]) => {
        const v = obj[k] as unknown;
        if (kind === "n") return String(v ?? 0);
        if (kind === "b") return v ? "TRUE" : "FALSE";
        if (kind === "a") return ((v as string[] | undefined) ?? []).join(",");
        if (kind === "j") return JSON.stringify(v ?? []);
        return String(v ?? "");
      });
    },
    fromRow(row: string[]): T {
      const obj: Record<string, unknown> = {};
      fields.forEach(([k, kind], i) => {
        const cell = row[i] ?? "";
        if (kind === "n") obj[k] = cell === "" ? 0 : Number(cell);
        else if (kind === "b") obj[k] = cell === "TRUE";
        else if (kind === "a") obj[k] = cell === "" ? [] : cell.split(",");
        else if (kind === "j") {
          try { obj[k] = cell === "" ? [] : JSON.parse(cell); } catch { obj[k] = []; }
        } else obj[k] = cell;
      });
      return obj as T;
    },
  };
}

export const ENTITIES = {
  trips: makeMapper<Trip>([["id","s"],["name","s"],["destination","s"],["start_date","s"],["end_date","s"],["home_currency","s"],["trip_currency","s"],["status","s"],["cover_photo_id","s"]]),
  itinerary: makeMapper<ItineraryItem>([["id","s"],["trip_id","s"],["day_date","s"],["time","s"],["end_time","s"],["title","s"],["place","s"],["maps_link","s"],["notes","s"],["status","s"],["moved_to_date","s"],["linked_transport_id","s"],["linked_booking_id","s"],["sort_order","n"],["photo_ids","a"]]),
  transports: makeMapper<Transport>([["id","s"],["trip_id","s"],["day_date","s"],["from","s"],["to","s"],["mode","s"],["pickup_point","s"],["pickup_photo_ids","a"],["departure_times","a"],["depart_time","s"],["arrive_time","s"],["duration_min","n"],["alt_option","s"],["price_amount","n"],["price_currency","s"],["fx_rate","n"],["price_thb","n"],["payer","s"],["pay_timing","s"],["paid","b"],["slip_photo_ids","a"],["notes","s"]]),
  bookings: makeMapper<Booking>([["id","s"],["trip_id","s"],["type","s"],["vendor","s"],["ref_no","s"],["date_from","s"],["date_to","s"],["detail","s"],["amount","n"],["currency","s"],["fx_rate","n"],["amount_thb","n"],["payer","s"],["pay_timing","s"],["paid","b"],["slip_photo_ids","a"],["notes","s"]]),
  expenses: makeMapper<Expense>([["id","s"],["trip_id","s"],["datetime","s"],["category","s"],["description","s"],["amount","n"],["currency","s"],["fx_rate","n"],["amount_thb","n"],["payer","s"],["slip_photo_ids","a"],["splits","j"]]),
  checklist: makeMapper<ChecklistItem>([["id","s"],["trip_id","s"],["group","s"],["item","s"],["done","b"],["from_template","b"]]),
  notes: makeMapper<Note>([["id","s"],["trip_id","s"],["date","s"],["text","s"],["photo_ids","a"]]),
  quickinfo: makeMapper<QuickInfo>([["id","s"],["trip_id","s"],["label","s"],["value","s"],["photo_ids","a"],["pinned","b"],["sort_order","n"]]),
  members: makeMapper<Member>([["id","s"],["trip_id","s"],["name","s"],["color","s"]]),
  restaurants: makeMapper<Restaurant>([["id","s"],["trip_id","s"],["name","s"],["area","s"],["maps_link","s"],["note","s"],["must_try","b"],["price_level","n"],["visited","b"],["photo_ids","a"]]),
  wishlist: makeMapper<WishItem>([["id","s"],["trip_id","s"],["name","s"],["area","s"],["maps_link","s"],["note","s"],["star","b"],["visited","b"],["photo_ids","a"]]),
  apps: makeMapper<TripApp>([["id","s"],["trip_id","s"],["name","s"],["purpose","s"],["url","s"]]),
  links: makeMapper<LinkItem>([["id","s"],["trip_id","s"],["title","s"],["url","s"],["note","s"]]),
  shopping: makeMapper<ShopItem>([["id","s"],["trip_id","s"],["item","s"],["for_whom","s"],["price","s"],["bought","b"],["photo_ids","a"]]),
  phrases: makeMapper<Phrase>([["id","s"],["trip_id","s"],["category","s"],["text","s"],["pronunciation","s"],["meaning","s"]]),
  quicknotes: makeMapper<QuickNote>([["id","s"],["trip_id","s"],["title","s"],["content","s"],["photo_ids","a"],["sort_order","n"]]),
} as const;

export type EntityName = keyof typeof ENTITIES;
