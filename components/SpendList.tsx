"use client";
import { CATS } from "@/lib/categories";
import { photoUrl } from "@/lib/photo-url";
import type { SpendItem } from "@/lib/spend";

function colorFor(key: string): string {
  return CATS.find((c) => c.name === key)?.color ?? "var(--color-cat-other)";
}

const SOURCE_LABEL: Record<SpendItem["source"], string | null> = {
  expense: null,
  booking: "จอง",
  transport: "เดินทาง",
};

// Renders any mix of expenses + paid bookings + paid transports, grouped by
// day. Tapping an expense edits it; tapping a booking/transport row hands the
// item back so the page can route to where it actually lives (they aren't
// editable as expenses).
export function SpendList({
  items,
  days,
  onPick,
}: {
  items: SpendItem[];
  days: { date: string; label: string }[];
  onPick: (item: SpendItem) => void;
}) {
  const groups = new Map<string, SpendItem[]>();
  for (const it of items) {
    const list = groups.get(it.date) ?? [];
    list.push(it);
    groups.set(it.date, list);
  }
  const dates = [...groups.keys()].sort();

  if (dates.length === 0) {
    return <p className="text-muted text-sm py-6 text-center">ยังไม่มีรายจ่าย</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {dates.map((date) => {
        const dayLabel = days.find((d) => d.date === date)?.label ?? (date || "ไม่ระบุวัน");
        const dayItems = groups.get(date)!;
        return (
          <div key={date} className="flex flex-col gap-2">
            <h2 className="font-heading text-sm font-semibold text-muted">{dayLabel}</h2>
            <div className="flex flex-col gap-2">
              {dayItems.map((it) => {
                const badge = SOURCE_LABEL[it.source];
                return (
                  <button
                    key={`${it.source}-${it.id}`}
                    type="button"
                    onClick={() => onPick(it)}
                    className="press flex items-center gap-3 rounded-2xl bg-surface shadow-card p-3 text-left cursor-pointer"
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(it.category) }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{it.description}</p>
                      <div className="flex items-center gap-1.5">
                        {badge && (
                          <span className="text-[11px] leading-none px-1.5 py-0.5 rounded-full bg-muted/15 text-muted shrink-0">
                            {badge}
                          </span>
                        )}
                        <span className="text-xs text-muted truncate">{it.category}</span>
                      </div>
                    </div>
                    <p className="money text-sm font-semibold shrink-0">฿{Math.round(it.amount_thb).toLocaleString()}</p>
                    {it.slip_photo_ids.length > 0 ? (
                      <img src={photoUrl(it.slip_photo_ids[0])} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <span className="h-10 w-10 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
