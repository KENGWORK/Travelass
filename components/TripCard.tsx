"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import type { Trip } from "@/lib/models/types";

const MotionLink = motion.create(Link);

const STATUS_BADGE: Record<Trip["status"], { className: string; label: string }> = {
  planning: { className: "tint-warning", label: "กำลังวางแผน" },
  active: { className: "tint-primary", label: "กำลังเที่ยว" },
  done: { className: "bg-muted/15 text-muted", label: "จบแล้ว" },
};

const ACCENT_BAR: Record<Trip["status"], string> = {
  planning: "bg-warning",
  active: "gradient-primary",
  done: "bg-muted/40",
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
      <span className={`w-2 shrink-0 rounded-r-full ${ACCENT_BAR[trip.status]}`} aria-hidden="true" />
      <div className="flex-1 min-w-0 p-4 flex items-start justify-between gap-3">
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
          <p className="text-xs text-muted mt-1 font-medium">{countdown(trip)}</p>
        </div>
      </div>
    </MotionLink>
  );
}
