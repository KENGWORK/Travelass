"use client";
/* Hallmark · component: read-only detail popup · genre: playful (existing app system, Restrained)
 * Notes is the one thing the card doesn't already show in full, so it's the
 * loudest thing here; time/title were already seen before the tap, so they
 * sit small at the top as orientation only. Strictly read-only -- no edit
 * affordance in here on purpose (edit lives behind the time-rail tap on the
 * card instead), so this never becomes a second, redundant edit entry point.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { MapPin, X } from "lucide-react";
import { PhotoViewer } from "@/components/PhotoViewer";
import { photoUrl } from "@/lib/photo-url";
import { computeDurationMin, formatDuration } from "@/lib/time";
import type { ItineraryItem, Transport } from "@/lib/models/types";
import type { LucideIcon } from "lucide-react";

export function ItineraryDetailPopup({
  item,
  transport,
  TransportIcon,
  accent,
  onClose,
}: {
  item: ItineraryItem;
  transport: Transport | undefined;
  TransportIcon: LucideIcon | null;
  accent: string;
  onClose: () => void;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const durationMin = item.time && item.end_time ? computeDurationMin(item.time, item.end_time) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="relative w-full max-w-md max-h-[85dvh] rounded-3xl bg-surface shadow-float flex flex-col overflow-hidden"
      >
        <button
          type="button"
          aria-label="ปิด"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 h-9 w-9 flex items-center justify-center rounded-full bg-black/5 text-muted cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Orientation strap — already seen on the card, so this stays
              small and muted rather than repeating the hierarchy. Time/
              duration and title get their own rows so neither has to
              truncate or wrap into the other. */}
          <div className="pr-8 flex flex-col gap-1">
            <div className="flex items-baseline gap-1.5 text-sm tabular-nums">
              <span className="font-semibold" style={{ color: accent }}>
                {item.time || "–"}
                {item.end_time && <> – {item.end_time}</>}
              </span>
              {durationMin > 0 && <span className="text-muted">· {formatDuration(durationMin)}</span>}
            </div>
            <p className="text-sm text-muted leading-snug">{item.title}</p>
          </div>

          {/* Notes — the reason this popup exists. Everything else here is
              secondary to it. Each line of the note is its own paragraph
              (not one pre-wrapped block) so a numbered list or separate
              thoughts read as distinct lines, not a run-on block. */}
          {item.notes ? (
            <div className="flex flex-col gap-2.5 text-lg leading-relaxed">
              {item.notes.split("\n").map((line, i) =>
                line.trim() ? (
                  <p key={i} className="whitespace-pre-wrap break-words">{line}</p>
                ) : (
                  <div key={i} className="h-1" />
                ),
              )}
            </div>
          ) : (
            <p className="text-sm text-muted/70 italic">ไม่มีโน้ตสำหรับกิจกรรมนี้</p>
          )}

          {(item.place || transport) && (
            <div className="flex flex-wrap gap-2">
              {item.place && (
                item.maps_link ? (
                  <a
                    href={item.maps_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary bg-primary-soft rounded-full px-3 py-1.5"
                  >
                    <MapPin size={13} />
                    {item.place}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted bg-muted/10 rounded-full px-3 py-1.5">
                    <MapPin size={13} />
                    {item.place}
                  </span>
                )
              )}
              {transport && TransportIcon && (
                <span
                  className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-3 py-1.5"
                  style={{ backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
                >
                  <TransportIcon size={13} />
                  {transport.from} → {transport.to} · {transport.duration_min} นาที
                </span>
              )}
            </div>
          )}

          {item.photo_ids.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {item.photo_ids.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  aria-label="ดูรูป"
                  onClick={() => setViewerIndex(i)}
                  className="aspect-square rounded-xl overflow-hidden cursor-pointer"
                >
                  <img src={photoUrl(id)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {viewerIndex !== null && (
        <PhotoViewer fileIds={item.photo_ids} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>,
    document.body,
  );
}
