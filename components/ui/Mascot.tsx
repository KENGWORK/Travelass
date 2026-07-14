"use client";
import { motion } from "framer-motion";

// Smiling-suitcase mascot — the app's one recurring character, shown in
// empty states and the dashboard hero so the family/teen tone reads as
// "friendly companion", not just rounded corners.
export function Mascot({ size = 72, className = "" }: { size?: number; className?: string }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={className}
      initial={{ y: 0 }}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <ellipse cx="48" cy="86" rx="22" ry="4" fill="var(--color-text)" opacity="0.08" />
      <rect x="40" y="10" width="16" height="10" rx="4" fill="var(--color-muted)" />
      <rect x="16" y="20" width="64" height="56" rx="16" fill="var(--color-primary)" />
      <rect x="16" y="20" width="64" height="56" rx="16" fill="none" stroke="var(--color-text)" strokeOpacity="0.08" strokeWidth="2" />
      <rect x="24" y="30" width="48" height="36" rx="8" fill="var(--color-primary-soft)" />
      <circle cx="38" cy="46" r="4" fill="var(--color-text)" />
      <circle cx="58" cy="46" r="4" fill="var(--color-text)" />
      <path d="M36 56 Q48 66 60 56" stroke="var(--color-text)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <rect x="10" y="40" width="8" height="18" rx="4" fill="var(--color-accent)" />
      <rect x="78" y="40" width="8" height="18" rx="4" fill="var(--color-accent)" />
    </motion.svg>
  );
}
