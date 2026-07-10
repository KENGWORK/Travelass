"use client";
import { tripDays } from "@/lib/days";

export function DayChips({
  startDate,
  endDate,
  selected,
  onSelect,
}: {
  startDate: string;
  endDate: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const days = tripDays(startDate, endDate);

  return (
    <div className="sticky top-0 z-20 bg-bg py-2 -mx-4 px-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onSelect(d.date)}
            className={[
              "shrink-0 h-9 px-4 rounded-full border text-sm font-medium whitespace-nowrap cursor-pointer transition",
              d.date === selected
                ? "bg-primary text-white border-transparent"
                : "border-muted/30 text-muted",
            ].join(" ")}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
