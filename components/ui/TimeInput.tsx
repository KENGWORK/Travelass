"use client";
import { useEffect, useState } from "react";
import { normalizeTime } from "@/lib/time";

// 24-hour time field: type digits (and optional colon), normalized to HH:MM on
// blur/Enter. Always 24hr regardless of browser locale, unlike <input type=time>.
export function TimeInput({
  value,
  onChange,
  placeholder = "--:--",
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);

  const commit = () => {
    const n = normalizeTime(text);
    setText(n);
    onChange(n);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className={`h-12 rounded-2xl border border-muted/30 bg-surface px-4 ${className}`}
    />
  );
}
