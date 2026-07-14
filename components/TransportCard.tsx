"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, Clock, Timer, ChevronDown } from "lucide-react";
import { PhotoViewer } from "@/components/PhotoViewer";
import { transportIcon } from "@/lib/transport-icon";
import { photoUrl } from "@/lib/photo-url";
import type { Transport, PayTiming } from "@/lib/models/types";

const TIMING_LABEL: Record<PayTiming, string> = {
  prepaid: "จ่ายล่วงหน้า",
  pay_before: "จ่ายก่อน",
  pay_after: "จ่ายหลัง",
};

export function TransportCard({ transport, onEdit }: { transport: Transport; onEdit: () => void }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [altOpen, setAltOpen] = useState(false);
  const Icon = transportIcon(transport.mode);
  const hasPickupPhoto = transport.pickup_photo_ids.length > 0;

  return (
    <div className="press rounded-3xl bg-surface shadow-card hover:shadow-card-hover p-3 flex flex-col gap-2 relative">
      <div className="cursor-pointer flex flex-col gap-2" onClick={onEdit}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-full bg-primary-soft grid place-items-center shrink-0 wiggle-idle">
              <Icon size={16} className="text-primary" />
            </span>
            <p className="text-base font-medium truncate">
              {transport.from} → {transport.to}
            </p>
          </div>
          {hasPickupPhoto && <div className="w-16 h-16 shrink-0" />}
        </div>

        <div className="flex flex-col gap-1.5">
          {transport.depart_time && (
            <div className="flex items-center gap-1.5 text-sm">
              <Clock size={16} className="shrink-0 text-primary" />
              <span className="font-medium">
                ออก {transport.depart_time}
                {transport.arrive_time && <span className="text-muted"> · ถึง {transport.arrive_time}</span>}
              </span>
            </div>
          )}
          {transport.pickup_point && (
            <div className="flex items-center gap-1.5 text-sm text-muted">
              <MapPin size={16} className="shrink-0" />
              <span>{transport.pickup_point}</span>
            </div>
          )}
          {transport.departure_times.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted flex-wrap">
              <Clock size={16} className="shrink-0" />
              <div className="flex gap-1 flex-wrap">
                {transport.departure_times.map((t, i) => (
                  <span key={i} className="rounded-full bg-muted/10 px-2 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {transport.duration_min > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted">
              <Timer size={16} className="shrink-0" />
              <span>~{transport.duration_min} นาที</span>
            </div>
          )}
          {transport.price_amount > 0 && (
            <div className="text-sm flex items-baseline gap-1.5 flex-wrap">
              <span className="money font-semibold">฿{transport.price_thb.toLocaleString()}</span>
              {transport.price_currency !== "THB" && (
                <span className="text-muted text-xs">
                  {transport.price_amount.toLocaleString()} {transport.price_currency} ≈ ฿{transport.price_thb.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        {transport.payer && (
          <div className="flex items-center gap-2 text-sm pt-1 border-t border-muted/10">
            <span className="w-6 h-6 rounded-full bg-primary-soft text-primary text-xs font-semibold flex items-center justify-center shrink-0">
              {transport.payer.charAt(0)}
            </span>
            <span className="text-muted">
              {transport.payer}จ่าย · {TIMING_LABEL[transport.pay_timing]}
            </span>
            {transport.paid ? (
              <motion.span
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: -6 }}
                transition={{ type: "spring", stiffness: 260, damping: 10 }}
                className="sticker tint-success text-xs ml-auto"
              >
                ✓ จ่ายแล้ว
              </motion.span>
            ) : (
              <span className="sticker tint-warning text-xs ml-auto rotate-2">ยังไม่จ่าย</span>
            )}
          </div>
        )}
      </div>

      {hasPickupPhoto && (
        <button
          type="button"
          aria-label="ดูรูปจุดนัดพบ"
          onClick={(e) => {
            e.stopPropagation();
            setViewerOpen(true);
          }}
          className="absolute top-3 right-3 w-16 h-16 rounded-xl overflow-hidden cursor-pointer"
        >
          <img src={photoUrl(transport.pickup_photo_ids[0])} alt="" className="w-full h-full object-cover" />
        </button>
      )}

      {transport.alt_option && (
        <div>
          <button
            type="button"
            aria-expanded={altOpen}
            onClick={(e) => {
              e.stopPropagation();
              setAltOpen((o) => !o);
            }}
            className="w-full min-h-11 flex items-center justify-between text-sm text-muted cursor-pointer"
          >
            <span>ตัวเลือกสำรอง</span>
            <motion.span animate={{ rotate: altOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={16} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {altOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="rounded-xl bg-muted/10 p-3 text-sm text-muted whitespace-pre-wrap">{transport.alt_option}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {viewerOpen && (
        <PhotoViewer fileIds={transport.pickup_photo_ids} initialIndex={0} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}
