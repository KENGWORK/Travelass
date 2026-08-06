"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, Plane } from "lucide-react";
import { tripColor } from "@/lib/trip-color";
import { tripCountdown } from "@/lib/trip-countdown";
import { photoUrl } from "@/lib/photo-url";
import type { Trip } from "@/lib/models/types";

const MotionLink = motion.create(Link);

const STATUS_BADGE: Record<Trip["status"], { className: string; label: string }> = {
  planning: { className: "tint-warning", label: "กำลังวางแผน" },
  active: { className: "tint-primary", label: "กำลังเที่ยว" },
  done: { className: "bg-muted/15 text-muted", label: "จบแล้ว" },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

// Eyebrow-style status pill — tracked-out caps instead of a plain sentence
// chip, same tint colors as before, just refined proportions.
function StatusBadge({ trip }: { trip: Trip }) {
  const badge = STATUS_BADGE[trip.status];
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.08em] ${badge.className}`}>
      {trip.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />}
      {badge.label}
    </span>
  );
}

// Double-bezel shell: a soft outer tray (ring + faint fill) holding an inner
// core with its own top highlight, so the card reads as machined depth
// rather than a flat rectangle sitting on the page.
function CardShell({
  href,
  index,
  active,
  children,
}: {
  href: string;
  index: number;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <MotionLink
      href={href}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 18, delay: index * 0.06 }}
      className={[
        "group block rounded-[2rem] bg-muted/5 ring-1 ring-black/5 p-1.5 shadow-card hover:shadow-card-hover transition-shadow duration-300",
        active ? "ring-primary/40" : "",
      ].join(" ")}
    >
      <div className="relative overflow-hidden rounded-[calc(2rem-0.375rem)] bg-surface shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]">
        {children}
      </div>
    </MotionLink>
  );
}

export function TripCard({ trip, index = 0 }: { trip: Trip; index?: number }) {
  const color = tripColor(trip.id);

  if (trip.cover_photo_id) {
    return (
      <CardShell href={`/trips/${trip.id}`} index={index} active={trip.status === "active"}>
        {/* Photo is purely visual — every word lives on plain surface below,
            so legibility never depends on how bright the photo happens to be. */}
        <div className="relative h-36 overflow-hidden">
          <img
            src={photoUrl(trip.cover_photo_id)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute top-3 right-3 h-7 px-2.5 rounded-full bg-surface/90 backdrop-blur-sm text-xs font-semibold text-text flex items-center shadow-card">
            {tripCountdown(trip)}
          </span>
        </div>

        <div className="p-5">
          <div className="mb-2.5"><StatusBadge trip={trip} /></div>
          <h2 className="font-heading text-lg font-semibold truncate group-hover:text-primary transition-colors">
            {trip.name}
          </h2>
          <p className="flex items-center gap-1 text-sm text-muted mt-0.5">
            <MapPin size={13} className="shrink-0" />
            <span className="truncate">{trip.destination}</span>
            <span className="text-muted/70 shrink-0">· {fmtDate(trip.start_date)} - {fmtDate(trip.end_date)}</span>
          </p>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell href={`/trips/${trip.id}`} index={index} active={trip.status === "active"}>
      <div className="flex">
        <span className="w-3 shrink-0" aria-hidden="true" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0 p-5 flex items-start gap-4">
          <span
            className="shrink-0 h-11 w-11 rounded-2xl grid place-items-center mt-0.5"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
            aria-hidden="true"
          >
            <Plane size={20} style={{ transform: "rotate(45deg)" }} />
          </span>
          <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-semibold truncate group-hover:text-primary transition-colors">
                {trip.name}
              </h2>
              <p className="flex items-center gap-1 text-sm text-muted mt-0.5">
                <MapPin size={13} className="shrink-0" />
                <span className="truncate">{trip.destination}</span>
              </p>
              <p className="text-xs text-muted/80 mt-1">{fmtDate(trip.start_date)} - {fmtDate(trip.end_date)}</p>
              <div className="mt-2.5"><StatusBadge trip={trip} /></div>
            </div>
            <div className="text-right shrink-0">
              <p className="money text-lg font-semibold text-accent">—</p>
              <p className="text-xs text-muted mt-1 font-medium">{tripCountdown(trip)}</p>
            </div>
          </div>
        </div>
      </div>
    </CardShell>
  );
}
