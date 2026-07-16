"use client";
import { motion } from "framer-motion";

// Next.js re-mounts template.tsx on every navigation within this segment,
// which is exactly what an enter transition needs. The old page unmounts
// immediately when the router swaps, so there's no exit-wait — that
// AnimatePresence mode="wait" exit-wait in the layout was what made each tab
// need two taps / flash blank (it held the route change until a 200ms exit
// finished, fighting the App Router). Enter-only here = instant nav + a
// quick fade-up, while the layout (and its TripDataProvider cache) stays put.
export default function TripTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="pb-24"
    >
      {children}
    </motion.main>
  );
}
