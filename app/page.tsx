"use client";
import { useEffect, useState } from "react";
import { Plus, Plane } from "lucide-react";
import { apiList } from "@/lib/api";
import { dbList } from "@/lib/local-db";
import { isSynced } from "@/lib/sync-status";
import { isGoogleConfigured } from "@/lib/backend";
import { subscribe } from "@/lib/notify";
import type { Trip } from "@/lib/models/types";
import { TripCard } from "@/components/TripCard";
import { TripFormSheet } from "@/components/TripFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshButton } from "@/components/ui/RefreshButton";

// Active trips (happening now) float to the top; among the rest, upcoming
// trips sort soonest-first ("ใกล้มาถึงอยู่บนสุด") and past/done trips sort
// most-recent-first at the bottom.
function tripRank(trip: Trip): 0 | 1 | 2 {
  if (trip.status === "active") return 0;
  return trip.start_date >= todayISO() ? 1 : 2;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const sortTrips = (t: Trip[]) =>
  [...t].sort((a, b) => {
    const ra = tripRank(a);
    const rb = tripRank(b);
    if (ra !== rb) return ra - rb;
    return ra === 2 ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date);
  });

export default function TripListPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = () =>
    apiList<Trip>("trips").then((t) => {
      // The local cache may legitimately be empty on a device that's never
      // synced yet — keep showing the skeleton (trips === null) until either
      // there's real data, or the cache is otherwise trustworthy (already
      // synced before, or there's no Google sync to wait for at all).
      if (t.length > 0 || !isGoogleConfigured() || isSynced("trips")) {
        setTrips(sortTrips(t));
      }
    });

  useEffect(() => {
    load();
  }, []);

  useEffect(() => subscribe("trips", () => setTrips(sortTrips(dbList("trips") as unknown as Trip[]))), []);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between h-14 mb-6">
        <h1 className="font-heading text-[28px] font-bold">ทริปของเรา</h1>
        <div className="flex items-center gap-1">
          <RefreshButton onRefresh={load} />
          <button aria-label="สร้างทริป" onClick={() => setOpen(true)}
            className="wiggle-idle w-12 h-12 rounded-full gradient-primary text-white shadow-card hover:shadow-card-hover hover:scale-105 grid place-items-center cursor-pointer active:scale-[0.9] transition-transform duration-200 border-2 border-surface">
            <Plus size={26} />
          </button>
        </div>
      </header>
      <div className="flex flex-col gap-6">
        {trips === null && [1, 2].map((i) => <Skeleton key={i} className="h-[120px]" />)}
        {trips?.map((t, i) => <TripCard key={t.id} trip={t} index={i} />)}
        {trips?.length === 0 && (
          <EmptyState icon={Plane} title="ยังไม่มีทริป" subtitle="กด + มุมขวาบนเพื่อเริ่มวางแผนทริปแรกของคุณ" />
        )}
      </div>
      <TripFormSheet
        open={open}
        onClose={() => setOpen(false)}
        onOptimisticCreate={(trip) => setTrips((prev) => sortTrips([...(prev ?? []), trip]))}
      />
    </main>
  );
}
