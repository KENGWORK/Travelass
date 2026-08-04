"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { CATS } from "@/lib/categories";
import { dayColor } from "@/lib/day-color";
import { photoUrl } from "@/lib/photo-url";
import type { SpendItem } from "@/lib/spend";
import type { Member } from "@/lib/models/types";

function colorFor(key: string): string {
  return CATS.find((c) => c.name === key)?.color ?? "var(--color-cat-other)";
}

const SOURCE_LABEL: Record<SpendItem["source"], string | null> = {
  expense: null,
  booking: "จอง",
  transport: "เดินทาง",
};

// Groups the same spend items SpendList shows, but by payer instead of by
// day — "who spent what" instead of "what happened when". Each payer is its
// own accordion section (same collapse pattern as the transport/bookings
// pages) so a trip with many line items doesn't dump everyone's spending in
// one long flat list.
export function PersonSpendList({
  items,
  members,
  onPick,
}: {
  items: SpendItem[];
  members: Member[];
  onPick: (item: SpendItem) => void;
}) {
  const [openPayers, setOpenPayers] = useState<Set<string>>(new Set());

  const groups = new Map<string, SpendItem[]>();
  for (const it of items) {
    const key = it.payer || "ไม่ระบุ";
    const list = groups.get(key) ?? [];
    list.push(it);
    groups.set(key, list);
  }
  const payers = [...groups.keys()].sort((a, b) => {
    const totalA = groups.get(a)!.reduce((s, it) => s + it.amount_thb, 0);
    const totalB = groups.get(b)!.reduce((s, it) => s + it.amount_thb, 0);
    return totalB - totalA;
  });

  if (payers.length === 0) {
    return <p className="text-muted text-sm py-6 text-center">ยังไม่มีรายจ่าย</p>;
  }

  const toggle = (payer: string) => {
    setOpenPayers((prev) => {
      const next = new Set(prev);
      if (next.has(payer)) next.delete(payer);
      else next.add(payer);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {payers.map((payer, i) => {
        const payerItems = groups.get(payer)!.sort((a, b) => b.date.localeCompare(a.date));
        const total = payerItems.reduce((s, it) => s + it.amount_thb, 0);
        const color = members.find((m) => m.name === payer)?.color ?? dayColor(i);
        const open = openPayers.has(payer);
        return (
          <section key={payer} className="rounded-2xl bg-surface shadow-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(payer)}
              className="press w-full flex items-center gap-3 p-3 cursor-pointer"
            >
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
              >
                {payer.slice(0, 1)}
              </span>
              <span className="flex-1 min-w-0 text-left font-medium truncate">{payer}</span>
              <span className="money text-sm font-semibold shrink-0">฿{Math.round(total).toLocaleString()}</span>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted shrink-0">
                <ChevronDown size={18} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    {payerItems.map((it) => {
                      const badge = SOURCE_LABEL[it.source];
                      return (
                        <button
                          key={`${it.source}-${it.id}`}
                          type="button"
                          onClick={() => onPick(it)}
                          className="press flex items-center gap-3 rounded-xl bg-muted/5 p-2.5 text-left cursor-pointer"
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
                              <span className="text-xs text-muted truncate">{it.category} · {it.date}</span>
                            </div>
                          </div>
                          <p className="money text-sm font-semibold shrink-0">฿{Math.round(it.amount_thb).toLocaleString()}</p>
                          {it.slip_photo_ids.length > 0 && (
                            <img src={photoUrl(it.slip_photo_ids[0])} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}
