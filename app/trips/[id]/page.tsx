"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, animate } from "framer-motion";
import { CalendarDays, TrainFront, Ticket, ListChecks, type LucideIcon } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiUpdate } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Trip } from "@/lib/models/types";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

function CountUpMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(display, value, { duration: 0.4, onUpdate: setDisplay });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <p className="money text-lg font-semibold text-accent">฿{Math.round(display).toLocaleString()}</p>;
}

function daysValue(trip: Trip): string {
  const now = Date.now();
  const start = Date.parse(trip.start_date);
  const end = Date.parse(trip.end_date);
  if (trip.status === "done") return "จบแล้ว";
  if (trip.status === "active") {
    const days = Math.max(0, Math.ceil((end - now) / 864e5));
    return `${days} วัน`;
  }
  const days = Math.ceil((start - now) / 864e5);
  return `${days} วัน`;
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface border border-muted/20 p-3 flex flex-col gap-1">
      <p className="text-xs text-muted">{label}</p>
      {children}
    </div>
  );
}

const MODE_OPTIONS: { key: Trip["status"]; label: string }[] = [
  { key: "planning", label: "วางแผน" },
  { key: "active", label: "กำลังเที่ยว" },
];

function ModeToggle({ trip, onChange }: { trip: Trip; onChange: (status: Trip["status"]) => void }) {
  const isDone = trip.status === "done";
  const activeIndex = trip.status === "active" ? 1 : 0;
  return (
    <div
      className={`relative h-11 grid grid-cols-2 rounded-full bg-muted/10 p-0.5 ${
        isDone ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {MODE_OPTIONS.map((o, i) => (
        <button
          key={o.key}
          onClick={() => !isDone && onChange(o.key)}
          disabled={isDone}
          className="relative h-full rounded-full text-sm font-medium cursor-pointer"
        >
          {!isDone && activeIndex === i && (
            <motion.div
              layoutId="mode"
              className="absolute inset-0 rounded-full bg-primary"
              transition={{ type: "spring", duration: 0.2 }}
            />
          )}
          <span className={`relative z-10 ${!isDone && activeIndex === i ? "text-white" : "text-muted"}`}>
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function ShortcutCard({
  tripId,
  href,
  icon: Icon,
  label,
}: {
  tripId: string;
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={`/trips/${tripId}/${href}`}
      className="flex items-center gap-3 rounded-2xl bg-surface border border-muted/20 p-4"
    >
      <span className="w-10 h-10 rounded-full bg-primary-soft text-primary grid place-items-center">
        <Icon size={20} />
      </span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

const SHORTCUTS: { href: string; icon: LucideIcon; label: string }[] = [
  { href: "itinerary", icon: CalendarDays, label: "แผนการเดินทาง" },
  { href: "transport", icon: TrainFront, label: "เดินทาง" },
  { href: "bookings", icon: Ticket, label: "การจอง" },
  { href: "checklist", icon: ListChecks, label: "เช็คลิสต์" },
];

export default function TripDashboardPage() {
  const { trip, refresh } = useTrip();
  const { bookings, summary, loading } = useTripData(trip.id);

  const setStatus = async (status: Trip["status"]) => {
    if (status === trip.status) return;
    await apiUpdate("trips", trip.id, { ...trip, status });
    await refresh();
  };

  const bookedCount = bookings.filter((b) => b.paid || b.ref_no.trim() !== "").length;

  return (
    <div className="p-4 max-w-3xl mx-auto flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="font-heading text-[28px] font-bold">{trip.name}</h1>
          <p className="text-sm text-muted mt-0.5">
            {fmtDate(trip.start_date)} - {fmtDate(trip.end_date)}
          </p>
        </div>
        <ModeToggle trip={trip} onChange={setStatus} />
      </header>

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="ใช้ไป">
            <CountUpMoney value={summary.totalTHB} />
          </StatCard>
          <StatCard label="จองแล้ว">
            <p className="text-lg font-semibold">
              {bookedCount}/{bookings.length}
            </p>
          </StatCard>
          <StatCard label="เหลืออีก">
            <p className="text-lg font-semibold">{daysValue(trip)}</p>
          </StatCard>
        </div>
      )}

      {trip.status === "active" ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">วันนี้</h2>
          <ShortcutCard tripId={trip.id} href="itinerary" icon={CalendarDays} label="ดูแผนวันนี้" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {SHORTCUTS.map((s) => (
            <ShortcutCard key={s.href} tripId={trip.id} {...s} />
          ))}
        </div>
      )}
    </div>
  );
}
