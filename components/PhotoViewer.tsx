"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export interface PhotoViewerProps {
  fileIds: string[];
  initialIndex: number;
  onClose: () => void;
}

export function PhotoViewer({ fileIds, initialIndex, onClose }: PhotoViewerProps) {
  const [index, setIndex] = useState(initialIndex);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black">
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute top-2 right-2 z-10 h-11 w-11 flex items-center justify-center rounded-full bg-black/40 text-white cursor-pointer"
      >
        <X size={24} />
      </button>
      <motion.div
        className="h-full w-full flex items-center justify-center"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        onDragEnd={(_, info) => {
          if (info.offset.x > 80 && index > 0) setIndex(index - 1);
          else if (info.offset.x < -80 && index < fileIds.length - 1) setIndex(index + 1);
        }}
      >
        <img
          src={`/api/img/${fileIds[index]}`}
          alt=""
          className="max-h-full max-w-full m-auto"
          style={{ touchAction: "pinch-zoom" }}
        />
      </motion.div>
    </div>,
    document.body
  );
}
