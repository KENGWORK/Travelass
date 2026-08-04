"use client";
import { ArrowRight } from "lucide-react";
import { dayColor } from "@/lib/day-color";
import { netBalances, simplifyDebts } from "@/lib/settle";
import type { Expense, Member } from "@/lib/models/types";

// Whole-trip, never date-scoped — debt isn't a per-day concept. Only expenses
// with splits touch this at all (see lib/settle.ts); an empty result means
// no expense has been marked split yet, not that everyone's settled up.
export function SettleSummary({ expenses, members }: { expenses: Expense[]; members: Member[] }) {
  const balances = netBalances(expenses);
  const settlements = simplifyDebts(balances);
  const names = [...new Set(Object.keys(balances))];
  const colorFor = (name: string) => members.find((m) => m.name === name)?.color ?? dayColor(names.indexOf(name));

  if (settlements.length === 0) {
    return <p className="text-muted text-sm py-6 text-center">ไม่มีรายจ่ายที่ต้องหารกัน</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {settlements.map((s, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl bg-surface shadow-card p-3">
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
        </div>
      ))}
    </div>
  );
}
