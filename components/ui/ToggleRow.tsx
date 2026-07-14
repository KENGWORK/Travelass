"use client";
import { useId } from "react";
import { Checkbox } from "@/components/ui/Checkbox";

// Single focusable control (the Checkbox button) — the label activates it via
// native <label for> association (buttons are labelable elements) instead of
// wrapping both in a second, redundant tab stop.
export function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 min-h-11 py-1">
      <Checkbox id={id} checked={checked} onChange={onChange} />
      <label htmlFor={id} className="text-sm cursor-pointer select-none">
        {label}
      </label>
    </div>
  );
}
