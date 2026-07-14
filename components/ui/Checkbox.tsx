"use client";
import { motion } from "framer-motion";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  "aria-label"?: string;
}

export function Checkbox({ checked, onChange, id, "aria-label": ariaLabel }: CheckboxProps) {
  return (
    <motion.button
      type="button"
      id={id}
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      whileTap={{ scale: 0.85 }}
      animate={{ scale: checked ? [1, 1.2, 1] : 1 }}
      transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
      className={[
        "h-6 w-6 rounded-full border flex items-center justify-center cursor-pointer shrink-0",
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
    </motion.button>
  );
}
