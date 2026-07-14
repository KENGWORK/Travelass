"use client";
import { CATS } from "@/lib/categories";
import { photoUrl } from "@/lib/photo-url";
import type { Expense } from "@/lib/models/types";

function colorFor(key: string): string {
  return CATS.find((c) => c.name === key)?.color ?? "var(--color-cat-other)";
}

function timeOf(datetime: string): string {
  const d = new Date(datetime);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ExpenseList({
  expenses,
  days,
  onSelect,
}: {
  expenses: Expense[];
  days: { date: string; label: string }[];
  onSelect: (expense: Expense) => void;
}) {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    const date = e.datetime.slice(0, 10);
    const list = groups.get(date) ?? [];
    list.push(e);
    groups.set(date, list);
  }
  const dates = [...groups.keys()].sort();

  if (dates.length === 0) {
    return <p className="text-muted text-sm py-6 text-center">ยังไม่มีรายจ่าย</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {dates.map((date) => {
        const dayLabel = days.find((d) => d.date === date)?.label ?? date;
        const items = groups.get(date)!.slice().sort((a, b) => a.datetime.localeCompare(b.datetime));
        return (
          <div key={date} className="flex flex-col gap-2">
            <h2 className="font-heading text-sm font-semibold text-muted">{dayLabel}</h2>
            <div className="flex flex-col gap-2">
              {items.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelect(e)}
                  className="press flex items-center gap-3 rounded-2xl bg-surface shadow-card p-3 text-left cursor-pointer"
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(e.category) }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{e.description || e.category}</p>
                    <p className="text-xs text-muted">{timeOf(e.datetime)}</p>
                  </div>
                  <p className="money text-sm font-semibold shrink-0">฿{Math.round(e.amount_thb).toLocaleString()}</p>
                  {e.slip_photo_ids.length > 0 ? (
                    <img
                      src={photoUrl(e.slip_photo_ids[0])}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <span className="h-10 w-10 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
