"use client";
import { AnimatePresence, motion } from "framer-motion";

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-40 bg-surface rounded-t-3xl p-4 pb-8 max-h-[92dvh] overflow-y-auto"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y" dragConstraints={{ top: 0 }} dragElastic={0.2}
            onDragEnd={(_, i) => { if (i.offset.y > 120) onClose(); }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted/30" />
            {title && <h2 className="font-heading text-lg font-semibold mb-3">{title}</h2>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
