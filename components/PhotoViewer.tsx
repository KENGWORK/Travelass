"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { photoUrl } from "@/lib/photo-url";

export interface PhotoViewerProps {
  fileIds: string[];
  initialIndex: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_SCALE = 2.5;

function touchDist(a: React.Touch, b: React.Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function PhotoViewer({ fileIds, initialIndex, onClose }: PhotoViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [pinching, setPinching] = useState(false);
  const pinchStart = useRef({ dist: 0, scale: 1 });

  if (typeof document === "undefined") return null;

  const zoomed = scale > 1.02;

  const setZoomed = (next: boolean) => setScale(next ? TAP_SCALE : 1);
  const toggleZoom = () => setZoomed(!zoomed);

  // Real two-finger pinch, same gesture as the phone's own photo viewer.
  // While pinching we hand off from framer-motion's single-pointer `drag`
  // (which only ever sees one of the two touches) to raw touch tracking.
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setPinching(true);
      pinchStart.current = { dist: touchDist(e.touches[0], e.touches[1]), scale };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (pinching && e.touches.length === 2) {
      const d = touchDist(e.touches[0], e.touches[1]);
      const next = (pinchStart.current.scale * d) / pinchStart.current.dist;
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2 && pinching) {
      setPinching(false);
      if (scale < 1.05) setScale(1);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <button
          type="button"
          aria-label={zoomed ? "ย่อรูป" : "ขยายรูป"}
          onClick={toggleZoom}
          className="h-11 w-11 flex items-center justify-center rounded-full bg-black/40 text-white cursor-pointer"
        >
          {zoomed ? <ZoomOut size={22} /> : <ZoomIn size={22} />}
        </button>
        <button
          type="button"
          aria-label="ปิด"
          onClick={onClose}
          className="h-11 w-11 flex items-center justify-center rounded-full bg-black/40 text-white cursor-pointer"
        >
          <X size={24} />
        </button>
      </div>
      <motion.div
        className="h-full w-full flex items-center justify-center"
        drag={pinching ? false : zoomed ? true : "x"}
        dragConstraints={zoomed ? { top: -300, bottom: 300, left: -300, right: 300 } : { left: 0, right: 0 }}
        dragElastic={zoomed ? 0.15 : 0.5}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDragEnd={(_, info) => {
          if (zoomed || pinching) return;
          if (info.offset.x > 80 && index > 0) setIndex(index - 1);
          else if (info.offset.x < -80 && index < fileIds.length - 1) setIndex(index + 1);
        }}
      >
        <motion.img
          key={`${index}-${zoomed}`}
          src={photoUrl(fileIds[index])}
          alt=""
          onDoubleClick={toggleZoom}
          initial={false}
          animate={{ scale }}
          transition={pinching ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
          className={`max-h-full max-w-full m-auto select-none ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          style={{ touchAction: zoomed ? "none" : "pan-y" }}
          draggable={false}
        />
      </motion.div>
    </div>,
    document.body
  );
}
