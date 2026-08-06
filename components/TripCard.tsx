"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { tripGradient } from "@/lib/trip-color";
import { tripCountdown } from "@/lib/trip-countdown";
import { photoUrl } from "@/lib/photo-url";
import type { Trip } from "@/lib/models/types";

const MotionLink = motion.create(Link);

const STATUS_BADGE: Record<Trip["status"], { className: string; label: string }> = {
  planning: { className: "tint-warning", label: "กำลังวางแผน" },
  active: { className: "tint-primary", label: "กำลังเที่ยว" },
  done: { className: "bg-white/20 text-white", label: "จบแล้ว" },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

// One consistent treatment for every trip, whether it has a real cover photo
// or not — a deterministic gradient (lib/trip-color.ts) stands in so the
// grid never mixes "photo cards" with a visually different flat-card style.
// Every field lives in the dark-scrim bottom third, never depending on how
// bright the photo underneath happens to be.
export function TripCard({ trip, index = 0 }: { trip: Trip; index?: number }) {
  const badge = STATUS_BADGE[trip.status];

  return (
    <MotionLink
      href={`/trips/${trip.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 18, delay: index * 0.05 }}
      className={[
        "group relative block aspect-[4/5] overflow-hidden rounded-2xl shadow-card hover:shadow-card-hover",
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" aria-hidden="true" />

      <span className="absolute top-2.5 right-2.5 h-6 px-2 rounded-full bg-black/30 backdrop-blur-sm text-[11px] font-semibold text-white flex items-center">
        {tripCountdown(trip)}
      </span>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <span className={`inline-flex items-center gap-1 mb-1.5 h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-[0.06em] ${badge.className}`}>
          {trip.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />}
          {badge.label}
        </span>
        <h2 className="font-heading text-sm font-semibold text-white leading-tight line-clamp-2">{trip.name}</h2>
        <p className="flex items-center gap-1 text-[11px] text-white/75 mt-1">
          <MapPin size={11} className="shrink-0" />
          <span className="truncate">{trip.destination}</span>
        </p>
        <p className="text-[10px] text-white/55 mt-0.5">{fmtDate(trip.start_date)} - {fmtDate(trip.end_date)}</p>
      </div>
    </MotionLink>
  );
}
