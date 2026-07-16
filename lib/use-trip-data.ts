"use client";
import { useCallback, useEffect, useState } from "react";
import { apiList } from "@/lib/api";
import type { Expense, Booking, Transport, ItineraryItem } from "@/lib/models/types";
import { summarize } from "@/lib/summary";

const TRIP_DATA_CHANGED_EVENT = "trip-data-changed";
const EXPENSE_ADDED_EVENT = "trip-expense-optimistic-added";
const EXPENSE_ROLLBACK_EVENT = "trip-expense-optimistic-rollback";

export function notifyTripDataChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TRIP_DATA_CHANGED_EVENT));
}

// Optimistic-add path for quick expense: skips the full refetch so the entry
// shows up instantly everywhere useTripData is mounted. Reserved for flows
// the user taps often (see lib/api.ts's Google round-trip cost); most
// mutations still just call notifyTripDataChanged() and refetch.
export function notifyExpenseAdded(expense: Expense) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Expense>(EXPENSE_ADDED_EVENT, { detail: expense }));
}

export function notifyExpenseRollback(expenseId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(EXPENSE_ROLLBACK_EVENT, { detail: expenseId }));
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

  useEffect(() => {
    const onAdded = (e: Event) => {
      const expense = (e as CustomEvent<Expense>).detail;
      if (expense.trip_id !== tripId) return;
      setExpenses((prev) => [...prev, expense]);
    };
    const onRollback = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setExpenses((prev) => prev.filter((x) => x.id !== id));
    };
    window.addEventListener(EXPENSE_ADDED_EVENT, onAdded);
    window.addEventListener(EXPENSE_ROLLBACK_EVENT, onRollback);
    return () => {
      window.removeEventListener(EXPENSE_ADDED_EVENT, onAdded);
      window.removeEventListener(EXPENSE_ROLLBACK_EVENT, onRollback);
    };
  }, [tripId]);

  const summary = summarize(expenses, bookings, transports);

  return { expenses, bookings, transports, itinerary, summary, loading, reload, setItinerary };
}
