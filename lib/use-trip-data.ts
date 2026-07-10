"use client";
import { useCallback, useEffect, useState } from "react";
import { apiList } from "@/lib/api";
import type { Expense, Booking, Transport, ItineraryItem } from "@/lib/models/types";
import { summarize } from "@/lib/summary";

const TRIP_DATA_CHANGED_EVENT = "trip-data-changed";

export function notifyTripDataChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TRIP_DATA_CHANGED_EVENT));
}

export function useTripData(tripId: string) {
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

  useEffect(() => {
    window.addEventListener(TRIP_DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TRIP_DATA_CHANGED_EVENT, reload);
  }, [reload]);

  const summary = summarize(expenses, bookings, transports);

  return { expenses, bookings, transports, itinerary, summary, loading, reload };
}
