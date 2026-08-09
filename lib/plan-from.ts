import type { Booking, ItineraryItem, Transport } from "./models/types";

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
    notes: t.notes,
    status: "planned",
    moved_to_date: "",
    linked_transport_id: t.id,
    linked_booking_id: "",
    sort_order: 999,
    photo_ids: [],
  };
}

// Snapshot a booking (flight/hotel/car/activity) into the plan -- carries its
// confirmation/slip photos along (e.g. an activity ticket's QR code), so the
// itinerary card is enough on its own to scan in at the gate, no need to dig
// back into the booking tracker mid-activity.
export function itineraryFromBooking(b: Booking, day: string, id: string): ItineraryItem {
  return {
    id,
    trip_id: b.trip_id,
    day_date: day,
    time: "",
    end_time: "",
    title: b.vendor || "กิจกรรม",
    place: b.detail,
    maps_link: "",
    notes: b.notes,
    status: "planned",
    moved_to_date: "",
    linked_transport_id: "",
    linked_booking_id: b.id,
    sort_order: 999,
    photo_ids: [...b.slip_photo_ids],
  };
}

export function itineraryFromPlace(
  place: { name: string; area: string; maps_link: string; note: string },
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
    notes: place.note,
    status: "planned",
    moved_to_date: "",
    linked_transport_id: "",
    linked_booking_id: "",
    sort_order: 999,
    photo_ids: [],
  };
}
