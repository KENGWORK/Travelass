"use client";
import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { apiList } from "@/lib/api";
import type { Expense, Booking, Transport, ItineraryItem } from "@/lib/models/types";
import { summarize } from "@/lib/summary";

interface TripDataValue {
  expenses: Expense[];
  bookings: Booking[];
  transports: Transport[];
  itinerary: ItineraryItem[];
  summary: ReturnType<typeof summarize>;
  loading: boolean;
  reload: () => Promise<void>;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setBookings: Dispatch<SetStateAction<Booking[]>>;
  setTransports: Dispatch<SetStateAction<Transport[]>>;
  setItinerary: Dispatch<SetStateAction<ItineraryItem[]>>;
}

const TripDataContext = createContext<TripDataValue | null>(null);

// Mounted once per trip in app/trips/[id]/layout.tsx, which Next.js keeps
// alive across nav between tabs (itinerary/transport/money/info/...) since
// they're all the same route segment's children. That's what makes
// switching tabs instant: there's no refetch-on-mount per page anymore,
// every page reads the same already-fetched state via useTripData().
export function TripDataProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [e, b, t, i] = await Promise.all([
      apiList<Expense>("expenses", tripId),
      apiList<Booking>("bookings", tripId),
      apiList<Transport>("transports", tripId),
      apiList<ItineraryItem>("itinerary", tripId),
    ]);
    setExpenses(e);
    setBookings(b);
    setTransports(t);
    setItinerary(i);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const summary = summarize(expenses, bookings, transports);

  return (
    <TripDataContext.Provider
      value={{ expenses, bookings, transports, itinerary, summary, loading, reload, setExpenses, setBookings, setTransports, setItinerary }}
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
