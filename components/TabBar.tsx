"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, TrainFront, Wallet, Info, Plus } from "lucide-react";

export function TabBar({ tripId, onFab }: { tripId: string; onFab: () => void }) {
  const path = usePathname();
  const tabs = [
    { href: `/trips/${tripId}/itinerary`, icon: CalendarDays, label: "แผน" },
    { href: `/trips/${tripId}/transport`, icon: TrainFront, label: "เดินทาง" },
    null,
    { href: `/trips/${tripId}/money`, icon: Wallet, label: "เงิน" },
    { href: `/trips/${tripId}/info`, icon: Info, label: "ข้อมูล" },
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 h-16 bg-surface border-t border-muted/20 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t, i) => t === null ? (
        <div key={i} className="relative">
          <motion.button
            aria-label="จดค่าใช้จ่าย"
            onClick={onFab}
            whileHover={{ scale: 1.08, rotate: -6 }}
            whileTap={{ scale: 0.85, rotate: 12 }}
            transition={{ type: "spring", stiffness: 350, damping: 12 }}
            className="wiggle-idle absolute left-1/2 -translate-x-1/2 -top-3 w-14 h-14 rounded-full gradient-accent text-white shadow-float border-[3px] border-surface grid place-items-center cursor-pointer"
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
  );
}
