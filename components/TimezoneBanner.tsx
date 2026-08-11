"use client";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { tzOffsetMinutes, tzClock } from "@/lib/timezones";

// Only earns its place on screen when the trip actually crosses a timezone --
// a trip within Thailand has nothing to say here. Destination time is the
// thing worth a glance (what time is it *there*, right now); home time and
// the offset are context, not the headline, so they sit small underneath
// instead of competing at equal weight on one cramped line.
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
    <div
      className="inline-flex items-center gap-2 h-10 pl-1 pr-3 rounded-full w-fit"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 14%, transparent)" }}
    >
      <span className="h-8 w-8 rounded-full grid place-items-center shrink-0 bg-primary text-white">
        <Clock3 size={15} />
      </span>
      <div className="flex flex-col leading-none">
        <span className="tabular-nums font-bold text-primary text-base leading-none">
          {tzClock(tripTimezone, now)}
        </span>
        <span className="tabular-nums text-[10px] text-muted leading-none mt-1">
          บ้าน {tzClock(homeTimezone, now)} · {diffLabel}
        </span>
      </div>
    </div>
  );
}
