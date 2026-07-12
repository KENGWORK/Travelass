"use client";
import { useState } from "react";
import { PhotoViewer } from "@/components/PhotoViewer";
import type { Booking } from "@/lib/models/types";

export function BookingCard({ booking, onEdit }: { booking: Booking; onEdit: () => void }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const isBooked = booking.paid || booking.ref_no !== "";
  const thumbs = booking.slip_photo_ids.slice(0, 4);
  const extra = booking.slip_photo_ids.length - thumbs.length;

  return (
    <div className="rounded-2xl bg-surface border border-muted/20 p-3 flex flex-col gap-2 relative">
      <div className="cursor-pointer flex flex-col gap-2" onClick={onEdit}>
        <div className="flex items-start justify-between gap-2 pr-20">
          <div className="min-w-0">
            <p className="body-md truncate">{booking.vendor}</p>
            {booking.ref_no && <p className="font-mono text-xs text-muted truncate">{booking.ref_no}</p>}
          </div>
        </div>

        {(booking.date_from || booking.date_to) && (
          <p className="text-sm text-muted">
            {booking.date_from}
            {booking.date_to && booking.date_to !== booking.date_from ? ` – ${booking.date_to}` : ""}
          </p>
        )}

        {booking.amount_thb > 0 && (
          <div className="text-sm flex items-baseline gap-1.5 flex-wrap">
            <span className="money font-semibold">฿{booking.amount_thb.toLocaleString()}</span>
            {booking.currency !== "THB" && (
              <span className="text-muted text-xs">
                {booking.amount.toLocaleString()} {booking.currency} ≈ ฿{booking.amount_thb.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {thumbs.length > 0 && (
          <div className="flex gap-2">
            {thumbs.map((id, i) => (
              <button
                key={id}
                type="button"
                aria-label="ดูสลิป"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerIndex(i);
                }}
                className="relative h-14 w-14 rounded-xl overflow-hidden cursor-pointer shrink-0"
              >
                <img src={id} alt="" className="w-full h-full object-cover" />
                {i === thumbs.length - 1 && extra > 0 && (
                  <span className="absolute inset-0 bg-black/50 text-white text-sm font-medium flex items-center justify-center">
                    +{extra}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3">
        {isBooked ? (
          <span className="rounded-full bg-success/15 text-success text-xs font-medium px-2 py-0.5">จองแล้ว</span>
        ) : (
          <span className="rounded-full bg-warning/15 text-warning text-xs font-medium px-2 py-0.5 inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
            ยังไม่จอง
          </span>
        )}
      </div>

      {viewerIndex !== null && (
        <PhotoViewer fileIds={booking.slip_photo_ids} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  );
}
