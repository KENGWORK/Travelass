"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { tripGradient } from "@/lib/trip-color";
import { tripCountdown } from "@/lib/trip-countdown";
import { photoUrl } from "@/lib/photo-url";
import type { Trip } from "@/lib/models/types";

const MotionLink = motion.create(Link);

const STATUS_DOT: Record<Trip["status"], { className: string; label: string }> = {
  planning: { className: "text-warning", label: "กำลังวางแผน" },
  active: { className: "text-primary", label: "กำลังเที่ยว" },
  done: { className: "text-white/60", label: "จบแล้ว" },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

// One consistent treatment for every trip, whether it has a real cover photo
// or not — a deterministic gradient (lib/trip-color.ts) stands in so the
// list never mixes "photo cards" with a visually different flat-card style.
// Everything (status, title, destination/dates, countdown) lives in one
// bottom-anchored block instead of floating corner chips, so there's a
// single reading path down the card instead of scattered fixed points.
export function TripCard({ trip, index = 0 }: { trip: Trip; index?: number }) {
  const status = STATUS_DOT[trip.status];

  return (
    <MotionLink
      href={`/trips/${trip.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 18, delay: index * 0.05 }}
      className={[
        "group relative block aspect-[2.8/1] overflow-hidden rounded-2xl ring-1 ring-black/5 shadow-card hover:shadow-card-hover",
        trip.status === "active" ? "ring-2 ring-primary/50" : "",
      ].join(" ")}
    >
      {trip.cover_photo_id ? (
        <img
          src={photoUrl(trip.cover_photo_id)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: tripGradient(trip.id) }}
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" aria-hidden="true" />

      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <span className={`inline-flex items-center gap-1.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${status.className}`}>
          {trip.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />}
          {status.label}
        </span>
        <h2 className="font-heading text-base font-semibold text-white leading-tight truncate">{trip.name}</h2>
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <p className="text-xs text-white/75 truncate">{trip.destination} · {fmtDate(trip.start_date)}-{fmtDate(trip.end_date)}</p>
          <p className="text-xs font-semibold text-white shrink-0">{tripCountdown(trip)}</p>
        </div>
      </div>
    </MotionLink>
  );
}
