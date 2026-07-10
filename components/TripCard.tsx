import Link from "next/link";
import type { Trip } from "@/lib/models/types";

const STATUS_BADGE: Record<Trip["status"], { className: string; label: string }> = {
  planning: { className: "bg-warning/15 text-warning", label: "กำลังวางแผน" },
  active: { className: "bg-primary-soft text-primary", label: "กำลังเที่ยว" },
  done: { className: "bg-muted/15 text-muted", label: "จบแล้ว" },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

function countdown(trip: Trip): string {
  const now = Date.now();
  const start = Date.parse(trip.start_date);
  const end = Date.parse(trip.end_date);
  if (trip.status === "done") return `${fmtDate(trip.start_date)} - ${fmtDate(trip.end_date)}`;
  if (trip.status === "active") {
    const day = Math.floor((now - start) / 864e5) + 1;
    return `วันที่ ${day} ของทริป`;
  }
  const days = Math.ceil((start - now) / 864e5);
  return `อีก ${days} วัน`;
}

export function TripCard({ trip }: { trip: Trip }) {
  const badge = STATUS_BADGE[trip.status];
  return (
    <Link
      href={`/trips/${trip.id}`}
      className={[
        "block rounded-2xl bg-surface border border-muted/20 shadow-sm p-4",
        trip.status === "active" ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold truncate">{trip.name}</h2>
          <p className="text-sm text-muted mt-0.5">{fmtDate(trip.start_date)} - {fmtDate(trip.end_date)}</p>
          <span className={`inline-flex items-center gap-1.5 mt-2 h-6 px-2.5 rounded-full text-xs font-medium ${badge.className}`}>
            {trip.status === "active" && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            )}
            {badge.label}
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="money text-lg font-semibold">—</p>
          <p className="text-xs text-muted mt-1">{countdown(trip)}</p>
        </div>
      </div>
    </Link>
  );
}
