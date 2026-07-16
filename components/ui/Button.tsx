"use client";
import { ButtonHTMLAttributes } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

// "3D" keycap effect: a solid bottom edge (color-mix, darker) gives the button
// physical thickness. Pressing collapses the edge and drops the face down —
// spring back on release. Ghost stays flat (no chrome, it's a text action).
const VARIANT_CLASSES = {
  primary:
    "gradient-primary text-white shadow-[0_4px_0_color-mix(in_srgb,var(--color-primary)_55%,black)]",
  secondary:
    "bg-primary-soft text-primary shadow-[0_3px_0_color-mix(in_srgb,var(--color-primary-soft)_55%,black)]",
  ghost: "bg-transparent text-primary hover:bg-primary-soft",
  danger:
    "bg-danger text-white shadow-[0_4px_0_color-mix(in_srgb,var(--color-danger)_55%,black)]",
} as const;

const PRESS_Y = { primary: 4, secondary: 3, ghost: 0, danger: 4 } as const;

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onDrag" | "onDragEnd" | "onDragStart" | "onAnimationStart"> {
  variant?: keyof typeof VARIANT_CLASSES;
  loading?: boolean;
  full?: boolean;
}

export function Button({ variant = "primary", loading, full, disabled, className = "", children, ...rest }: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled || loading ? undefined : { scale: 1.03 }}
      whileTap={disabled || loading ? undefined : { y: PRESS_Y[variant], scale: 0.98, boxShadow: "0 0px 0 transparent" }}
      transition={{ type: "spring", stiffness: 450, damping: 18 }}
      className={[
        "h-12 rounded-full font-semibold px-6 cursor-pointer disabled:opacity-50",
        VARIANT_CLASSES[variant],
        full ? "w-full" : "",
        className,
      ].filter(Boolean).join(" ")}
      disabled={disabled || loading}
      {...(rest as HTMLMotionProps<"button">)}
    >
      {loading ? (
        <span className="inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
      ) : (
        children
      )}
    </motion.button>
  );
}
