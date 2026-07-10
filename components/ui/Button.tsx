"use client";
import { ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary: "bg-primary text-white",
  secondary: "bg-primary-soft text-primary",
  ghost: "bg-transparent text-primary",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASSES;
  loading?: boolean;
  full?: boolean;
}

export function Button({ variant = "primary", loading, full, disabled, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      className={[
        "h-12 rounded-full font-semibold px-6 cursor-pointer transition active:scale-[0.97] disabled:opacity-50",
        VARIANT_CLASSES[variant],
        full ? "w-full" : "",
        className,
      ].filter(Boolean).join(" ")}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
      ) : (
        children
      )}
    </button>
  );
}
