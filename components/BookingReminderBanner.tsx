"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plane, BedDouble, Car, Ticket, X, type LucideIcon } from "lucide-react";
import { upcomingReminders, countdownLabel, dismissKey } from "@/lib/booking-reminder";
import { todayISO } from "@/lib/diary-days";
import type { Booking, BookingType } from "@/lib/models/types";

const ICONS: Record<BookingType, LucideIcon> = { flight: Plane, hotel: BedDouble, car: Car, activity: Ticket };

// Checked on every app open (dashboard mount), not via push -- no service
// worker or permission prompt needed. Refreshes on a timer so the
// countdown keeps ticking while the dashboard stays open.
export function BookingReminderBanner({
  tripId,
  bookings,
  now: nowProp,
}: {
  tripId: string;
  bookings: Booking[];
  now?: number;
}) {
  const router = useRouter();
  // Date.now() is impure -- reading it belongs in an effect, not directly in
  // render, so "now" is seeded and ticked forward through state instead.
  const [clockNow, setClockNow] = useState<number | null>(null);

  useEffect(() => {
    if (nowProp !== undefined) return; // test/fixed-clock mode, no ticking
    setClockNow(Date.now());
    const id = setInterval(() => setClockNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, [nowProp]);

  const now = nowProp ?? clockNow;
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  if (now === null) return null; // first client paint, before the effect above seeds the clock
  const today = todayISO(now);

  const isDismissed = (id: string) => {
    if (dismissedIds.has(id)) return true;
    try {
      return localStorage.getItem(dismissKey(id, today)) !== null;
    } catch {
      return false;
    }
  };

  const active = upcomingReminders(bookings, now).filter((b) => !isDismissed(b.id));

  const dismiss = (id: string) => {
    try {
      localStorage.setItem(dismissKey(id, today), "1");
    } catch {}
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  if (active.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {active.map((b) => {
        const Icon = ICONS[b.type];
        return (
          <div
            key={b.id}
            onClick={() => router.push(`/trips/${tripId}/bookings`)}
            className="press cursor-pointer rounded-2xl bg-warning/10 border border-warning/20 p-3 flex items-center gap-3"
          >
            <span className="h-10 w-10 shrink-0 rounded-full bg-warning/20 text-warning grid place-items-center">
              <Icon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{b.vendor}</p>
              <p className="text-xs text-muted">{countdownLabel(b, now)}</p>
            </div>
            <button
              type="button"
              aria-label="ปิดแจ้งเตือนนี้วันนี้"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(b.id);
              }}
              className="h-9 w-9 shrink-0 grid place-items-center rounded-full text-muted cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
