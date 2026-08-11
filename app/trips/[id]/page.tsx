"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, animate } from "framer-motion";
import { CalendarDays, TrainFront, Ticket, ListChecks, ChevronRight, Trash2, Pencil, type LucideIcon } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiUpdate } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Mascot } from "@/components/ui/Mascot";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { SearchButton } from "@/components/ui/SearchButton";
import { UploadButton } from "@/components/ui/UploadButton";
import { toast } from "@/components/ui/Toast";
import { TodayView } from "@/components/TodayView";
import { MembersCard } from "@/components/MembersCard";
import { DeleteTripSheet } from "@/components/DeleteTripSheet";
import { EditTripSheet } from "@/components/EditTripSheet";
import type { Trip } from "@/lib/models/types";

const MotionLink = motion.create(Link);

const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

function CountUpMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(display, value, { duration: 0.4, onUpdate: setDisplay });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <p className="money text-xl font-semibold text-white">฿{Math.round(display).toLocaleString()}</p>;
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

// Decorative sweep for the hero ring: trip-progress fraction while active,
// otherwise how close the start date is within a 30-day horizon.
function ringProgress(trip: Trip): number {
  const now = Date.now();
  const start = Date.parse(trip.start_date);
  const end = Date.parse(trip.end_date);
  if (trip.status === "done") return 1;
  if (trip.status === "active") return (now - start) / (end - start || 1);
  const daysLeft = Math.ceil((start - now) / 864e5);
  return 1 - Math.min(1, Math.max(0, daysLeft) / 30);
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div
      whileHover={{ y: -2, rotate: -1 }}
      transition={{ type: "spring", stiffness: 320, damping: 16 }}
      className="rounded-3xl bg-surface border border-black/[0.04] shadow-card hover:shadow-card-hover p-4 flex flex-col gap-1.5"
    >
      <p className="text-xs text-muted font-medium">{label}</p>
      {children}
    </motion.div>
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
  tint,
}: {
  tripId: string;
  href: string;
  icon: LucideIcon;
  label: string;
  tint: string;
}) {
  return (
    <MotionLink
      href={`/trips/${tripId}/${href}`}
      whileHover={{ y: -4, rotate: -0.5 }}
      whileTap={{ scale: 0.96, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 16 }}
      className="group flex items-center gap-3 rounded-3xl bg-surface border border-black/[0.04] shadow-card hover:shadow-card-hover p-5"
    >
      <motion.span
        whileHover={{ rotate: [0, -12, 12, -6, 0], scale: 1.08 }}
        transition={{ duration: 0.5 }}
        className="w-12 h-12 rounded-2xl grid place-items-center shadow-card"
        style={{ background: `${tint}22`, color: tint }}
      >
        <Icon size={22} />
      </motion.span>
      <span className="font-medium flex-1 group-hover:text-primary transition-colors">{label}</span>
      <ChevronRight size={18} className="text-muted/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </MotionLink>
  );
}

const SHORTCUTS: { href: string; icon: LucideIcon; label: string; tint: string }[] = [
  { href: "itinerary", icon: CalendarDays, label: "แผนการเดินทาง", tint: "var(--color-primary)" },
  { href: "transport", icon: TrainFront, label: "เดินทาง", tint: "var(--color-cat-transport)" },
  { href: "bookings", icon: Ticket, label: "การจอง", tint: "var(--color-cat-tickets)" },
  { href: "checklist", icon: ListChecks, label: "เช็คลิสต์", tint: "var(--color-accent)" },
];

export default function TripDashboardPage() {
  const { trip, refresh, setTrip } = useTrip();
  const { bookings, itinerary, transports, summary, loading, reload, setItinerary, setTransports, setBookings } = useTripData(trip.id);
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const setStatus = (status: Trip["status"]) => {
    if (status === trip.status) return;
    const previous = trip;
    const patch = { ...trip, status };
    setTrip(patch);
    apiUpdate("trips", trip.id, patch).catch(() => {
      setTrip(previous);
      toast("บันทึกไม่สำเร็จ ลองอีกครั้ง", "error");
    });
  };

  const bookedCount = bookings.filter((b) => b.paid || b.ref_no.trim() !== "").length;

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-heading text-[28px] font-bold">{trip.name}</h1>
              <button
                type="button"
                aria-label="แก้ไขทริป"
                onClick={() => setEditOpen(true)}
                className="relative h-9 w-9 shrink-0 grid place-items-center rounded-full text-muted hover:bg-primary/8 active:scale-90 transition-transform cursor-pointer"
              >
                <Pencil size={16} />
              </button>
            </div>
            <p className="text-sm text-muted mt-0.5">
              {fmtDate(trip.start_date)} - {fmtDate(trip.end_date)}
            </p>
          </div>
          <ModeToggle trip={trip} onChange={setStatus} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <SearchButton />
          <UploadButton />
          <RefreshButton onRefresh={() => Promise.all([refresh(), reload()])} />
          <Mascot size={56} className="-mt-1" />
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-3 grid-rows-2 gap-4 h-[144px]">
          <Skeleton className="col-span-2 row-span-2" />
          <Skeleton />
          <Skeleton />
        </div>
      ) : (
        <div className="grid grid-cols-3 grid-rows-2 gap-4">
          <motion.div
            whileHover={{ y: -2, rotate: -0.5 }}
            transition={{ type: "spring", stiffness: 320, damping: 16 }}
            className="col-span-2 row-span-2 rounded-3xl gradient-primary text-white shadow-card hover:shadow-card-hover p-5 flex items-center justify-between gap-3"
          >
            <div>
              <p className="text-xs text-white/75 font-medium">ใช้ไปแล้ว</p>
              <CountUpMoney value={summary.totalTHB} />
            </div>
            <ProgressRing progress={ringProgress(trip)} size={64}>
              <span className="text-xs font-semibold text-white">{daysValue(trip)}</span>
            </ProgressRing>
          </motion.div>
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
        <TodayView tripId={trip.id} />
      ) : (
        <div className="flex flex-col gap-4">
          {SHORTCUTS.map((s) => (
            <ShortcutCard key={s.href} tripId={trip.id} {...s} />
          ))}
          <MembersCard tripId={trip.id} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="mt-2 h-11 rounded-2xl text-danger text-sm font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Trash2 size={16} />
        ลบทริปนี้
      </button>

      <DeleteTripSheet
        trip={trip}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => router.replace("/")}
      />

      <EditTripSheet
        trip={trip}
        itinerary={itinerary}
        transports={transports}
        bookings={bookings}
        setTrip={setTrip}
        setItinerary={setItinerary}
        setTransports={setTransports}
        setBookings={setBookings}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
