"use client";
import { motion } from "framer-motion";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ checked, onChange }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "h-6 w-6 rounded-full border flex items-center justify-center cursor-pointer transition shrink-0",
        checked ? "bg-primary border-primary" : "border-muted/30 bg-surface",
      ].join(" ")}
    >
      {checked && (
        <motion.svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M5 13l4 4L19 7"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.2 }}
          />
        </motion.svg>
      )}
    </button>
  );
}
