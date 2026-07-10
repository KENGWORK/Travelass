"use client";
import { motion } from "framer-motion";

export interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  color?: string;
  children: React.ReactNode;
}

export function Chip({ selected, onClick, color, children }: ChipProps) {
  const selectedStyle = selected && color ? { backgroundColor: `${color}26`, color } : undefined;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 1.05 }}
      onClick={onClick}
      style={selectedStyle}
      className={[
        "h-9 px-4 rounded-full border border-muted/30 text-sm cursor-pointer transition inline-flex items-center gap-1",
        selected ? "border-transparent font-medium" : "",
        selected && !color ? "bg-primary-soft text-primary" : "",
      ].filter(Boolean).join(" ")}
    >
      {children}
    </motion.button>
  );
}
