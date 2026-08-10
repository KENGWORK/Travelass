"use client";
import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { apiList } from "@/lib/api";
import { dbList } from "@/lib/local-db";
import { isSynced } from "@/lib/sync-status";
import { isGoogleConfigured } from "@/lib/backend";
import { subscribe } from "@/lib/notify";
import type { Expense, Booking, Transport, ItineraryItem, DayPlan } from "@/lib/models/types";
import { summarize } from "@/lib/summary";

interface TripDataValue {
  expenses: Expense[];
  bookings: Booking[];
  transports: Transport[];
  itinerary: ItineraryItem[];
  dayPlans: DayPlan[];
  summary: ReturnType<typeof summarize>;
  loading: boolean;
  reload: () => Promise<void>;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setBookings: Dispatch<SetStateAction<Booking[]>>;
  setTransports: Dispatch<SetStateAction<Transport[]>>;
  setItinerary: Dispatch<SetStateAction<ItineraryItem[]>>;
  setDayPlans: Dispatch<SetStateAction<DayPlan[]>>;
}

const TripDataContext = createContext<TripDataValue | null>(null);

const ENTITIES = ["expenses", "bookings", "transports", "itinerary", "day_plans"] as const;

function allSynced(tripId: string): boolean {
  return ENTITIES.every((e) => isSynced(e, tripId));
}

// Mounted once per trip in app/trips/[id]/layout.tsx, which Next.js keeps
// alive across nav between tabs (itinerary/transport/money/info/...) since
// they're all the same route segment's children. That's what makes
// switching tabs instant: there's no refetch-on-mount per page anymore,
// every page reads the same already-fetched state via useTripData().
//
// Local-first (docs/superpowers/specs/2026-07-17-localstorage-first-sync-design.md):
// reload() calls lib/api.ts's apiList, which itself resolves instantly from
// the local cache and (if Google is configured) kicks a background Sheets
// revalidate. This provider subscribes to lib/notify.ts so it picks up that
// revalidate's result — and any other write to these entities from
// anywhere in the app — without needing to be told explicitly.
export function TripDataProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
  const [dayPlans, setDayPlans] = useState<DayPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [e, b, t, i, p] = await Promise.all([
      apiList<Expense>("expenses", tripId),
      apiList<Booking>("bookings", tripId),
      apiList<Transport>("transports", tripId),
      apiList<ItineraryItem>("itinerary", tripId),
      apiList<DayPlan>("day_plans", tripId),
    ]);
    setExpenses(e);
    setBookings(b);
    setTransports(t);
    setItinerary(i);
    setDayPlans(p);
    setLoading(isGoogleConfigured() && !allSynced(tripId));
  }, [tripId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const refresh = () => {
      setExpenses(dbList("expenses", tripId) as unknown as Expense[]);
      setBookings(dbList("bookings", tripId) as unknown as Booking[]);
      setTransports(dbList("transports", tripId) as unknown as Transport[]);
      setItinerary(dbList("itinerary", tripId) as unknown as ItineraryItem[]);
      setDayPlans(dbList("day_plans", tripId) as unknown as DayPlan[]);
      setLoading((prev) => (prev ? isGoogleConfigured() && !allSynced(tripId) : false));
    };
    const unsubs = ENTITIES.map((entity) => subscribe(entity, refresh));
    return () => unsubs.forEach((unsub) => unsub());
  }, [tripId]);

  const summary = summarize(expenses, bookings, transports);

  return (
    <TripDataContext.Provider
      value={{ expenses, bookings, transports, itinerary, dayPlans, summary, loading, reload, setExpenses, setBookings, setTransports, setItinerary, setDayPlans }}
    >
      {children}
    </TripDataContext.Provider>
  );
}

// tripId param kept (unused) so every existing `useTripData(trip.id)` call
// site keeps working unchanged after the context refactor.
export function useTripData(_tripId?: string): TripDataValue {
  const ctx = useContext(TripDataContext);
  if (!ctx) throw new Error("useTripData must be used within TripDataProvider");
  return ctx;
}
