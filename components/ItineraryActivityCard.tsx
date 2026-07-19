"use client";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, MapPin } from "lucide-react";
import { computeDurationMin, formatDuration } from "@/lib/time";
import { photoUrl } from "@/lib/photo-url";
import type { ItineraryItem, Transport } from "@/lib/models/types";
import type { LucideIcon } from "lucide-react";

export function ItineraryActivityCard({
  item,
  transport,
  TransportIcon,
  accent,
  isLast,
  onEdit,
  onViewPhoto,
  onDragEnd,
}: {
  item: ItineraryItem;
  transport: Transport | undefined;
  TransportIcon: LucideIcon | null;
  accent: string;
  isLast: boolean;
  onEdit: (item: ItineraryItem) => void;
  onViewPhoto: (item: ItineraryItem) => void;
  onDragEnd: () => void;
}) {
  // Whole-card dragging fought with the page's own vertical scroll on
  // touch (a swipe anywhere on the card reordered instead of scrolling).
  // dragListener={false} + a dedicated handle means only that grip
  // triggers a drag; everywhere else on the card scrolls or taps normally.
  const dragControls = useDragControls();
  const durationMin = item.time && item.end_time ? computeDurationMin(item.time, item.end_time) : 0;

  return (
    <Reorder.Item value={item} dragListener={false} dragControls={dragControls} onDragEnd={onDragEnd} className="list-none">
      <div className="relative pl-7">
        {!isLast && (
          <span
            className="absolute left-[9px] top-6 w-0.5"
            style={{ backgroundColor: accent, opacity: 0.3, bottom: "-12px" }}
          />
        )}
        <span
          className="absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 border-bg"
          style={{ backgroundColor: accent }}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => onEdit(item)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onEdit(item);
            }
          }}
          className="press w-full text-left rounded-2xl bg-surface shadow-card p-3 flex items-start gap-2 cursor-pointer"
        >
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            <p className="font-heading text-base font-medium">{item.title}</p>
            {item.place && (
              <p className="text-sm text-muted flex items-center gap-1">
                {item.place}
                {item.maps_link && (
                  <a
                    href={item.maps_link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="relative text-primary inline-flex items-center justify-center p-2.5 before:absolute before:inset-[-5px] before:content-['']"
                  >
                    <MapPin size={14} />
                  </a>
                )}
              </p>
            )}
            {transport && TransportIcon && (
              <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary-soft rounded-full px-2 py-1 w-fit mt-1">
                <TransportIcon size={12} />
                {transport.duration_min} นาที
              </span>
            )}
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1.5">
            {item.time && (
              <div
                className="flex items-center gap-1 tabular-nums rounded-xl px-2 py-1"
                style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` }}
              >
                <span className="text-base font-semibold leading-tight">{item.time}</span>
                {item.end_time && (
                  <>
                    <span className="text-xs text-muted leading-tight">–</span>
                    <span className="text-base font-semibold leading-tight">{item.end_time}</span>
                  </>
                )}
              </div>
            )}
            {durationMin > 0 && (
              <span className="text-[11px] leading-tight" style={{ color: accent }}>
                {formatDuration(durationMin)}
              </span>
            )}
            {item.photo_ids.length > 0 && (
              <button
                type="button"
                aria-label="ดูรูป"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewPhoto(item);
                }}
                className="relative h-11 w-11 cursor-pointer"
              >
                <img src={photoUrl(item.photo_ids[0])} alt="" className="h-11 w-11 rounded-lg object-cover" />
                {item.photo_ids.length > 1 && (
                  <span className="absolute -bottom-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-primary text-white text-[10px] font-medium flex items-center justify-center">
                    +{item.photo_ids.length - 1}
                  </span>
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            aria-label="ลากจัดลำดับ"
            onPointerDown={(e) => {
              e.stopPropagation();
              dragControls.start(e);
            }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 self-stretch -my-3 -mr-3 pl-1 pr-2 flex items-center text-muted/50 cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical size={18} />
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}
