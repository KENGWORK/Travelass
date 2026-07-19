"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { photoUrl } from "@/lib/photo-url";

export interface PhotoViewerProps {
  fileIds: string[];
  initialIndex: number;
  onClose: () => void;
}

const ZOOM_SCALE = 2.5;

export function PhotoViewer({ fileIds, initialIndex, onClose }: PhotoViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  if (typeof document === "undefined") return null;

  const toggleZoom = () => setZoomed((z) => !z);

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
        drag={zoomed ? true : "x"}
        dragConstraints={zoomed ? { top: -300, bottom: 300, left: -300, right: 300 } : { left: 0, right: 0 }}
        dragElastic={zoomed ? 0.15 : 0.5}
        onDragEnd={(_, info) => {
          if (zoomed) return;
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
          animate={{ scale: zoomed ? ZOOM_SCALE : 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`max-h-full max-w-full m-auto select-none ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          style={{ touchAction: zoomed ? "none" : "pan-y" }}
          draggable={false}
        />
      </motion.div>
    </div>,
    document.body
  );
}
