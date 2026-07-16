"use client";
import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { apiList } from "@/lib/api";
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

  const refresh = useCallback(async () => {
    const trips = await apiList<Trip>("trips");
    const found = trips.find((t) => t.id === tripId);
    if (found) setTrip(found);
    else setNotFound(true);
  }, [tripId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
