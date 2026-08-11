"use client";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { tzOffsetMinutes, tzClock } from "@/lib/timezones";

// Only earns its place on screen when the trip actually crosses a timezone --
// a trip within Thailand has nothing to say here. The live dot borrows the
// same animate-pulse language as the "กำลังเที่ยว" active-trip status
// elsewhere in the app, so it reads as "this number is ticking" rather than
// decoration.
export function TimezoneBanner({ homeTimezone, tripTimezone }: { homeTimezone: string; tripTimezone: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now || !homeTimezone || !tripTimezone || homeTimezone === tripTimezone) return null;

  const diffMin = tzOffsetMinutes(tripTimezone, now) - tzOffsetMinutes(homeTimezone, now);
  const diffHours = diffMin / 60;
  const diffLabel = `${diffHours >= 0 ? "+" : "-"}${Number.isInteger(diffHours) ? Math.abs(diffHours) : Math.abs(diffHours).toFixed(1)} ชม.`;

  return (
    <div className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full bg-muted/10 text-xs w-fit">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
      <Clock3 size={12} className="text-muted shrink-0" />
      <span className="tabular-nums font-semibold">ที่นี่ {tzClock(tripTimezone, now)}</span>
      <span className="text-muted/50">·</span>
      <span className="tabular-nums text-muted">บ้าน {tzClock(homeTimezone, now)}</span>
      <span className="text-muted">({diffLabel})</span>
    </div>
  );
}
