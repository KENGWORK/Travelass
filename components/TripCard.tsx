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

export function TripCard({ trip }: { trip: Trip }) {
  const badge = STATUS_BADGE[trip.status];
  const color = tripColor(trip.id);

  if (trip.cover_photo_id) {
    return (
      <MotionLink
        href={`/trips/${trip.id}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 16 }}
        className={[
          "group relative block h-48 overflow-hidden rounded-3xl shadow-card hover:shadow-card-hover",
          trip.status === "active" ? "ring-2 ring-primary/40" : "",
        ].join(" ")}
      >
        <img
          src={photoUrl(trip.cover_photo_id)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/10" aria-hidden="true" />

        <div className="absolute top-4 right-4 text-right">
          <p className="money text-sm font-semibold text-white drop-shadow">{tripCountdown(trip)}</p>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className={`inline-flex items-center gap-1.5 mb-2 h-6 px-2.5 rounded-full text-xs font-medium backdrop-blur-sm ${badge.className}`}>
            {trip.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />}
            {badge.label}
          </span>
          <h2 className="font-heading text-xl font-semibold text-white truncate drop-shadow">{trip.name}</h2>
          <p className="flex items-center gap-1 text-sm text-white/85 mt-1">
            <MapPin size={13} className="shrink-0" />
            <span className="truncate">{trip.destination}</span>
            <span className="text-white/60">· {fmtDate(trip.start_date)} - {fmtDate(trip.end_date)}</span>
          </p>
        </div>
      </MotionLink>
    );
  }

  return (
    <MotionLink
      href={`/trips/${trip.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, rotate: -0.5 }}
      whileTap={{ scale: 0.97, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 16 }}
      className={[
        "group relative flex overflow-hidden rounded-3xl bg-surface shadow-card hover:shadow-card-hover",
        trip.status === "active" ? "ring-2 ring-primary/40" : "",
      ].join(" ")}
    >
      <span className="w-3 shrink-0 rounded-r-full" aria-hidden="true" style={{ backgroundColor: color }} />
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
            <span className={`inline-flex items-center gap-1.5 mt-2.5 h-6 px-2.5 rounded-full text-xs font-medium ${badge.className}`}>
              {trip.status === "active" && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
              )}
              {badge.label}
            </span>
          </div>
          <div className="text-right shrink-0">
            <p className="money text-lg font-semibold text-accent">—</p>
            <p className="text-xs text-muted mt-1 font-medium">{tripCountdown(trip)}</p>
          </div>
        </div>
      </div>
    </MotionLink>
  );
}
