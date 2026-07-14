"use client";
import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { apiList } from "@/lib/api";
import type { Member } from "@/lib/models/types";

// Payer selector populated from the trip's members, with a free-text fallback.
export function PayerChips({
  tripId,
  value,
  onChange,
}: {
  tripId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiList<Member>("members", tripId).then((m) => {
        if (alive) setNames(m.map((x) => x.name));
      });
    load();
    window.addEventListener("members-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("members-changed", load);
    };
  }, [tripId]);

  const known = names.length ? names : ["ฉัน"];

  return (
    <div className="flex gap-2 flex-wrap">
      {known.map((p) => (
        <span
          key={p}
          onClick={() => onChange(p)}
          className="relative inline-flex before:absolute before:inset-[-4px] before:content-['']"
        >
          <Chip selected={value === p}>{p}</Chip>
        </span>
      ))}
      <input
        value={known.includes(value) ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="อื่นๆ"
        className="h-12 w-24 rounded-full border border-muted/30 bg-surface px-3 text-sm"
      />
    </div>
  );
}
