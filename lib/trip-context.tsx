"use client";
import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { apiList } from "@/lib/api";
import { dbList } from "@/lib/local-db";
import { isSynced } from "@/lib/sync-status";
import { isGoogleConfigured } from "@/lib/backend";
import { subscribe } from "@/lib/notify";
import type { Trip } from "@/lib/models/types";
import { Skeleton } from "@/components/ui/Skeleton";

interface TripContextValue {
  trip: Trip;
  refresh: () => Promise<void>;
  setTrip: Dispatch<SetStateAction<Trip>>;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Resolve a lookup miss against the trip list: only declare "not found"
  // once the local cache is trustworthy (already synced before, or there's
  // no Google sync to wait for at all) — otherwise a fresh/cleared device
  // landing directly on a trip URL (deep link, PWA home-screen reopen)
  // would see a false "not found" before the trip list has ever synced.
  const resolve = useCallback(
    (trips: Trip[]) => {
      const found = trips.find((t) => t.id === tripId);
      if (found) {
        setTrip(found);
        setNotFound(false);
        return;
      }
      if (!isGoogleConfigured() || isSynced("trips")) {
        setNotFound(true);
      }
    },
    [tripId],
  );

  const refresh = useCallback(async () => {
    const trips = await apiList<Trip>("trips");
    resolve(trips);
  }, [resolve]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => subscribe("trips", () => resolve(dbList("trips") as unknown as Trip[])), [resolve]);

  if (notFound) {
    return <p className="p-4 text-center text-muted">ไม่พบทริปนี้</p>;
  }

  if (!trip) {
    return (
      <div className="p-4 max-w-3xl mx-auto flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <TripContext.Provider value={{ trip, refresh, setTrip: setTrip as Dispatch<SetStateAction<Trip>> }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be used within TripProvider");
  return ctx;
}
