"use client";
import { tripDays } from "@/lib/days";
import { CATS } from "@/lib/categories";

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
        {days.map((d, i) => {
          const color = CATS[i % CATS.length].color;
          const active = d.date === selected;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(d.date)}
              style={
                active
                  ? { backgroundColor: color, borderColor: color, color: "#fff" }
                  : { backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, borderColor: color, color }
              }
              className="shrink-0 h-11 px-4 rounded-full border text-sm font-medium whitespace-nowrap cursor-pointer transition flex items-center justify-center"
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
