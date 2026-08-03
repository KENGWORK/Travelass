"use client";
import { useEffect, useState } from "react";
import { MapPin, UtensilsCrossed } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { apiList } from "@/lib/api";
import { transportIcon } from "@/lib/transport-icon";
import { itineraryFromTransport, itineraryFromPlace } from "@/lib/plan-from";
import type { Transport, Restaurant, WishItem, ItineraryItem } from "@/lib/models/types";

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
  const [transports, setTransports] = useState<Transport[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [wishlist, setWishlist] = useState<WishItem[]>([]);

  useEffect(() => {
    if (!open) return;
    apiList<Transport>("transports", tripId).then(setTransports);
    apiList<Restaurant>("restaurants", tripId).then(setRestaurants);
    apiList<WishItem>("wishlist", tripId).then(setWishlist);
  }, [open, tripId]);

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
          {transports.map((t) => {
            const Icon = transportIcon(t.mode);
            return (
              <button key={t.id} type="button" className={rowClass} onClick={() => take(itineraryFromTransport(t, day, crypto.randomUUID()))}>
                <Icon size={18} className="text-primary shrink-0" />
                <span className="min-w-0">
                  <span className="block font-medium truncate">{t.from} → {t.to}</span>
                  {t.depart_time && <span className="block text-xs text-muted">ออก {t.depart_time}{t.arrive_time && ` · ถึง ${t.arrive_time}`}</span>}
                </span>
              </button>
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
