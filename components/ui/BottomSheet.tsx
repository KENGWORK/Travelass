"use client";
import { AnimatePresence, motion, useDragControls } from "framer-motion";

// drag is started only from the handle strip (dragListener=false +
// dragControls) so a touch-drag inside the scrollable content area scrolls
// natively instead of being captured as a dismiss-swipe — previously drag="y"
// sat directly on the same element as overflow-y-auto, which on touch devices
// swallowed the scroll gesture and made long forms unreachable past the fold.
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const dragControls = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-40 bg-surface rounded-t-3xl max-h-[92dvh] flex flex-col"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y" dragListener={false} dragControls={dragControls} dragConstraints={{ top: 0 }} dragElastic={0.2}
            onDragEnd={(_, i) => { if (i.offset.y > 120) onClose(); }}
          >
            <div
              className="shrink-0 pt-4 px-4 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted/30" />
              {title && <h2 className="font-heading text-lg font-semibold mb-3">{title}</h2>}
            </div>
            <div className="min-h-0 overflow-y-auto px-4 pb-8">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
