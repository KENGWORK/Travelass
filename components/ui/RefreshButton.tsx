"use client";
import { useState } from "react";
import { RotateCw } from "lucide-react";

export function RefreshButton({ onRefresh }: { onRefresh: () => Promise<unknown> | void }) {
  const [spinning, setSpinning] = useState(false);

  const run = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await onRefresh();
    } finally {
      setSpinning(false);
    }
  };

  return (
    <button
      type="button"
      aria-label="รีเฟรช"
      onClick={run}
      className="h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-primary/8 active:scale-90 transition-transform cursor-pointer"
    >
      <RotateCw size={20} className={spinning ? "animate-spin" : ""} />
    </button>
  );
}
