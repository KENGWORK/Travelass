import type { ItineraryItem, Transport } from "./models/types";

// Build a planned itinerary item from a transport leg (kept linked, so edits to
// the transport flow through) or from a saved place/restaurant (a snapshot).
export function itineraryFromTransport(t: Transport, day: string, id: string): ItineraryItem {
  return {
    id,
    trip_id: t.trip_id,
    day_date: day,
    time: t.depart_time,
    end_time: t.arrive_time,
    title: `${t.from} → ${t.to}`,
    place: t.to,
    maps_link: "",
    notes: "",
    status: "planned",
    moved_to_date: "",
    linked_transport_id: t.id,
    linked_booking_id: "",
    sort_order: 999,
  };
}

export function itineraryFromPlace(
  place: { name: string; area: string; maps_link: string },
  day: string,
  id: string,
): ItineraryItem {
  return {
    id,
    trip_id: "",
    day_date: day,
    time: "",
    end_time: "",
    title: place.name,
    place: place.area,
    maps_link: place.maps_link,
    notes: "",
    status: "planned",
    moved_to_date: "",
    linked_transport_id: "",
    linked_booking_id: "",
    sort_order: 999,
  };
}
