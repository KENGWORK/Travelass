"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, UtensilsCrossed, ChevronDown, Ticket } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { apiList } from "@/lib/api";
import { useTrip } from "@/lib/trip-context";
import { tripDays } from "@/lib/days";
import { transportIcon } from "@/lib/transport-icon";
import { itineraryFromTransport, itineraryFromPlace, itineraryFromBooking } from "@/lib/plan-from";
import type { Transport, Restaurant, WishItem, ItineraryItem, Booking } from "@/lib/models/types";

// Pull an existing transport (linked) or a saved restaurant/wishlist place
// (snapshot) into the plan for the given day, so nothing is retyped.
export function PullIntoPlanSheet({
  open,
  onClose,
  tripId,
  day,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  day: string;
  onPick: (item: ItineraryItem) => void;
}) {
  const { trip } = useTrip();
  const [transports, setTransports] = useState<Transport[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [wishlist, setWishlist] = useState<WishItem[]>([]);
  const [openDays, setOpenDays] = useState<Set<string>>(() => new Set([day]));

  useEffect(() => {
    if (!open) return;
    apiList<Transport>("transports", tripId).then(setTransports);
    apiList<Booking>("bookings", tripId).then(setBookings);
    apiList<Restaurant>("restaurants", tripId).then(setRestaurants);
    apiList<WishItem>("wishlist", tripId).then(setWishlist);
    // Re-default to just this day expanded every time the sheet reopens --
    // it's opened from a specific day's tab in the itinerary, so that's the
    // one the user almost certainly wants without an extra tap.
    setOpenDays(new Set([day]));
  }, [open, tripId, day]);

  const toggleDay = (date: string) => {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const days = useMemo(() => tripDays(trip.start_date, trip.end_date), [trip.start_date, trip.end_date]);

  const take = (item: ItineraryItem) => {
    onPick({ ...item, trip_id: tripId });
    onClose();
  };

  const rowClass =
    "w-full text-left rounded-2xl bg-bg border border-muted/20 p-3 flex items-center gap-3 cursor-pointer";

  return (
    <BottomSheet open={open} onClose={onClose} title="ดึงเข้าแผน">
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="font-heading font-semibold text-sm text-muted">การเดินทาง</h3>
          {transports.length === 0 && <p className="text-sm text-muted">ยังไม่มีการเดินทาง</p>}
          {days.map((d) => {
            const dayTransports = transports.filter((t) => t.day_date === d.date);
            if (dayTransports.length === 0) return null;
            const isOpen = openDays.has(d.date);
            return (
              <div key={d.date} className="rounded-2xl bg-bg border border-muted/20 overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleDay(d.date)}
                  className="w-full min-h-11 px-3 py-2 flex items-center gap-2 cursor-pointer"
                >
                  <span className="flex-1 text-left text-sm font-medium">
                    {d.label} <span className="text-muted font-normal">({dayTransports.length})</span>
                  </span>
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted shrink-0">
                    <ChevronDown size={16} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2 flex flex-col gap-2">
                        {dayTransports.map((t) => {
                          const Icon = transportIcon(t.mode);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              className="w-full text-left rounded-xl bg-surface p-3 flex items-center gap-3 cursor-pointer"
                              onClick={() => take(itineraryFromTransport(t, day, crypto.randomUUID()))}
                            >
                              <Icon size={18} className="text-primary shrink-0" />
                              <span className="min-w-0">
                                <span className="block font-medium truncate">{t.from} → {t.to}</span>
                                {t.depart_time && <span className="block text-xs text-muted">ออก {t.depart_time}{t.arrive_time && ` · ถึง ${t.arrive_time}`}</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-heading font-semibold text-sm text-muted">กิจกรรม/ตั๋ว</h3>
          {bookings.filter((b) => b.type === "activity").length === 0 && <p className="text-sm text-muted">ยังไม่มีกิจกรรม</p>}
          {days.map((d) => {
            const dayBookings = bookings.filter((b) => b.type === "activity" && b.date_from === d.date);
            if (dayBookings.length === 0) return null;
            const isOpen = openDays.has(d.date);
            return (
              <div key={d.date} className="rounded-2xl bg-bg border border-muted/20 overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleDay(d.date)}
                  className="w-full min-h-11 px-3 py-2 flex items-center gap-2 cursor-pointer"
                >
                  <span className="flex-1 text-left text-sm font-medium">
                    {d.label} <span className="text-muted font-normal">({dayBookings.length})</span>
                  </span>
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted shrink-0">
                    <ChevronDown size={16} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2 flex flex-col gap-2">
                        {dayBookings.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className="w-full text-left rounded-xl bg-surface p-3 flex items-center gap-3 cursor-pointer"
                            onClick={() => take(itineraryFromBooking(b, day, crypto.randomUUID()))}
                          >
                            <Ticket size={18} className="text-primary shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium truncate">{b.vendor || "กิจกรรม"}</span>
                              {b.detail && <span className="block text-xs text-muted truncate">{b.detail}</span>}
                            </span>
                            {b.slip_photo_ids.length > 0 && (
                              <span className="text-[10px] font-medium text-primary bg-primary-soft rounded-full px-2 py-1 shrink-0">
                                มี QR
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-heading font-semibold text-sm text-muted">ร้านอาหาร</h3>
          {restaurants.length === 0 && <p className="text-sm text-muted">ยังไม่มีร้าน</p>}
          {restaurants.map((r) => (
            <button key={r.id} type="button" className={rowClass} onClick={() => take(itineraryFromPlace({ name: r.name, area: r.area, maps_link: r.maps_link, note: r.note }, day, crypto.randomUUID()))}>
              <UtensilsCrossed size={18} className="text-primary shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium truncate">{r.name}</span>
                {r.area && <span className="block text-xs text-muted truncate">{r.area}</span>}
              </span>
            </button>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-heading font-semibold text-sm text-muted">ที่อยากไป</h3>
          {wishlist.length === 0 && <p className="text-sm text-muted">ยังไม่มีสถานที่</p>}
          {wishlist.map((w) => (
            <button key={w.id} type="button" className={rowClass} onClick={() => take(itineraryFromPlace({ name: w.name, area: w.area, maps_link: w.maps_link, note: w.note }, day, crypto.randomUUID()))}>
              <MapPin size={18} className="text-primary shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium truncate">{w.name}</span>
                {w.area && <span className="block text-xs text-muted truncate">{w.area}</span>}
              </span>
            </button>
          ))}
        </section>
      </div>
    </BottomSheet>
  );
}
