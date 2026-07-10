"use client";
import Link from "next/link";
import { motion } from "framer-motion";

const OPTIONS = [
  { key: "transport", label: "เดินทาง" },
  { key: "bookings", label: "จอง" },
] as const;

export function PlanBookSegment({
  tripId,
  active,
}: {
  tripId: string;
  active: "transport" | "bookings";
}) {
  const activeIndex = OPTIONS.findIndex((o) => o.key === active);

  return (
    <div className="relative h-11 grid grid-cols-2 rounded-full bg-muted/10 p-0.5">
      {OPTIONS.map((o, i) => (
        <Link
          key={o.key}
          href={`/trips/${tripId}/${o.key}`}
          className="relative h-full rounded-full text-sm font-medium cursor-pointer flex items-center justify-center"
        >
          {activeIndex === i && (
            <motion.div
              layoutId="plan-book-segment"
              className="absolute inset-0 rounded-full bg-primary"
              transition={{ type: "spring", duration: 0.2 }}
            />
          )}
          <span className={`relative z-10 ${activeIndex === i ? "text-white" : "text-muted"}`}>{o.label}</span>
        </Link>
      ))}
    </div>
  );
}
