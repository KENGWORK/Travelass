"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { dayColor } from "@/lib/day-color";
import { netBalances, simplifyDebts, expensesBetween } from "@/lib/settle";
import type { Expense, Member } from "@/lib/models/types";

function fmtDate(datetime: string): string {
  return new Date(datetime).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

// Whole-trip, never date-scoped — debt isn't a per-day concept. Only expenses
// with splits touch this at all (see lib/settle.ts); an empty result means
// no expense has been marked split yet, not that everyone's settled up.
export function SettleSummary({ expenses, members }: { expenses: Expense[]; members: Member[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const balances = netBalances(expenses);
  const settlements = simplifyDebts(balances);
  const names = [...new Set(Object.keys(balances))];
  const colorFor = (name: string) => members.find((m) => m.name === name)?.color ?? dayColor(names.indexOf(name));

  if (settlements.length === 0) {
    return <p className="text-muted text-sm py-6 text-center">ไม่มีรายจ่ายที่ต้องหารกัน</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {settlements.map((s, i) => {
        const key = `${s.from}-${s.to}-${i}`;
        const open = openKey === key;
        const lines = expensesBetween(expenses, s.from, s.to);
        return (
          <div key={key} className="rounded-2xl bg-surface shadow-card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : key)}
              className="press w-full flex items-center gap-3 p-3 cursor-pointer"
            >
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${colorFor(s.from)} 18%, transparent)`, color: colorFor(s.from) }}
              >
                {s.from.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1 flex items-center gap-2 text-sm">
                <span className="font-medium truncate">{s.from}</span>
                <ArrowRight size={14} className="text-muted shrink-0" />
                <span className="font-medium truncate">{s.to}</span>
              </div>
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${colorFor(s.to)} 18%, transparent)`, color: colorFor(s.to) }}
              >
                {s.to.slice(0, 1)}
              </span>
              <p className="money text-sm font-semibold shrink-0">฿{s.amount.toLocaleString()}</p>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted shrink-0">
                <ChevronDown size={16} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1.5 px-3 pb-3">
                    {lines.length === 0 ? (
                      <p className="text-xs text-muted">ยอดนี้มาจากการหักลบหลายรายการ (ดูรายละเอียดที่แท็บ ทั้งทริป)</p>
                    ) : (
                      lines.map((l) => (
                        <div key={l.id} className="flex items-center gap-2 rounded-xl bg-muted/5 p-2 text-xs">
                          <span className="text-muted shrink-0 w-12">{fmtDate(l.datetime)}</span>
                          <span className="flex-1 min-w-0 truncate font-medium">{l.description}</span>
                          <span className="text-muted shrink-0">{l.from} → {l.to}</span>
                          <span className="money font-semibold shrink-0">฿{l.amount_thb.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
