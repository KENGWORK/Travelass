"use client";
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { queueLength, subscribeQueue } from "@/lib/sync-queue";

export function RefreshButton({ onRefresh }: { onRefresh: () => Promise<unknown> | void }) {
  const [spinning, setSpinning] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(queueLength() > 0);
    return subscribeQueue(() => setPending(queueLength() > 0));
  }, []);

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
      aria-label={pending ? "รีเฟรช (มีรายการรอซิงค์)" : "รีเฟรช"}
      onClick={run}
      className="relative h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-primary/8 active:scale-90 transition-transform cursor-pointer"
    >
      <RotateCw size={20} className={spinning ? "animate-spin" : ""} />
      {pending && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
    </button>
  );
}
