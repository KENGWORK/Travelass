"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, TrainFront, Wallet, Info, Plus, Camera, Calculator } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";

export function TabBar({
  tripId,
  onSnapSlip,
  onQuickExpense,
}: {
  tripId: string;
  onSnapSlip: () => void;
  onQuickExpense: () => void;
}) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const tabs = [
    { href: `/trips/${tripId}/itinerary`, icon: CalendarDays, label: "แผน" },
    { href: `/trips/${tripId}/transport`, icon: TrainFront, label: "เดินทาง" },
    null,
    { href: `/trips/${tripId}/money`, icon: Wallet, label: "เงิน" },
    { href: `/trips/${tripId}/info`, icon: Info, label: "ข้อมูล" },
  ] as const;
  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-30 h-16 bg-surface border-t border-muted/20 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t, i) => t === null ? (
          <div key={i} className="relative">
            <motion.button
              aria-label="จดค่าใช้จ่าย"
              onClick={() => setMenuOpen(true)}
              whileHover={{ scale: 1.08, rotate: -6 }}
              whileTap={{ scale: 0.85, rotate: 12 }}
              transition={{ type: "spring", stiffness: 350, damping: 12 }}
              className="wiggle-idle absolute left-1/2 -translate-x-1/2 -top-3 w-14 h-14 rounded-full gradient-accent text-white shadow-float border-[3px] border-surface grid place-items-center cursor-pointer z-40"
            >
              <Plus size={26} />
            </motion.button>
          </div>
        ) : (
        <Link key={t.href} href={t.href}
          className={`flex flex-col items-center justify-center gap-0.5 text-xs ${path.startsWith(t.href) ? "text-primary font-medium" : "text-muted"}`}>
          <t.icon size={24} /><span>{t.label}</span>
        </Link>
      ))}
      </nav>

      {/* A small floating popup anchored to the FAB used to sometimes eat
          taps meant for it (the popup and its full-viewport backdrop were
          both freshly-mounted siblings of the FAB on the very click that
          opened them, an unreliable pattern) -- BottomSheet is the same
          proven overlay every other sheet in the app already uses, with
          full-width rows that are far more forgiving to tap than a small
          floating menu. */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="จดค่าใช้จ่าย">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onSnapSlip();
            }}
            className="press h-16 rounded-2xl bg-primary-soft text-left flex items-center gap-3 px-4 cursor-pointer"
          >
            <Camera size={20} className="text-primary shrink-0" />
            <span>
              <span className="block font-medium">ถ่ายสลิป</span>
              <span className="block text-xs text-muted">กรอกรายละเอียดทีหลังได้</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onQuickExpense();
            }}
            className="press h-16 rounded-2xl bg-muted/10 text-left flex items-center gap-3 px-4 cursor-pointer"
          >
            <Calculator size={20} className="text-accent shrink-0" />
            <span className="block font-medium">จดด่วน</span>
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
