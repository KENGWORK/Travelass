"use client";
import { useEffect, useState } from "react";
import { normalizeTime } from "@/lib/time";

// Digits typed as the user goes in ("930" -> "09:30" live), clamped to
// HH:MM on blur/Enter via normalizeTime for out-of-range values (e.g. "99").
function formatDigits(digits: string): string {
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

// 24-hour time field: type digits, auto-formatted live, normalized to HH:MM on
// blur/Enter. Always 24hr regardless of browser locale, unlike <input type=time>.
export function TimeInput({
  value,
  onChange,
  placeholder = "--:--",
  autoFocus,
  className = "",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  id?: string;
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
      id={id}
      inputMode="numeric"
      autoFocus={autoFocus}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(formatDigits(e.target.value.replace(/\D/g, "").slice(0, 4)))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className={`field time-field ${className}`}
    />
  );
}
