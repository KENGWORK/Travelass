"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { PhotoViewer } from "@/components/PhotoViewer";
import { photoUrl } from "@/lib/photo-url";
import type { Booking } from "@/lib/models/types";

export function BookingCard({ booking, onEdit }: { booking: Booking; onEdit: () => void }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const isBooked = booking.paid || booking.ref_no !== "";
  const thumbs = booking.slip_photo_ids.slice(0, 4);
  const extra = booking.slip_photo_ids.length - thumbs.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, rotate: -1 }}
      whileTap={{ scale: 0.97, rotate: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 16 }}
      className="rounded-3xl bg-surface shadow-card hover:shadow-card-hover p-3 flex flex-col gap-2 relative overflow-hidden"
    >
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
                className="press relative h-14 w-14 rounded-2xl overflow-hidden cursor-pointer shrink-0 shadow-card"
              >
                <img src={photoUrl(id)} alt="" className="w-full h-full object-cover" />
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
          <motion.span
            initial={{ scale: 0, rotate: 15 }}
            animate={{ scale: 1, rotate: 6 }}
            transition={{ type: "spring", stiffness: 260, damping: 10 }}
            className="sticker tint-success text-xs"
          >
            ✓ จองแล้ว
          </motion.span>
        ) : (
          <span className="sticker tint-warning text-xs -rotate-3">
            <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
            ยังไม่จอง
          </span>
        )}
      </div>

      {viewerIndex !== null && (
        <PhotoViewer fileIds={booking.slip_photo_ids} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </motion.div>
  );
}
