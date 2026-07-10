"use client";
import { useEffect, useState } from "react";
import { motion, animate } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { tripDays } from "@/lib/days";
import { summarize } from "@/lib/summary";
import { CategoryDonut } from "@/components/CategoryDonut";
import { ExpenseList } from "@/components/ExpenseList";
import { ExpenseEditSheet } from "@/components/ExpenseEditSheet";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Expense } from "@/lib/models/types";

type FilterMode = "today" | "day" | "all";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CountUpMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(display, value, { duration: 0.4, onUpdate: setDisplay });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <p className="money text-4xl font-bold">฿{Math.round(display).toLocaleString()}</p>;
}

const MODES: { key: FilterMode; label: string }[] = [
  { key: "today", label: "วันนี้" },
  { key: "day", label: "รายวัน" },
  { key: "all", label: "ทั้งทริป" },
];

export default function MoneyPage() {
  const { trip } = useTrip();
  const { expenses, summary, loading, reload } = useTripData(trip.id);

  const days = tripDays(trip.start_date, trip.end_date);
  const [mode, setMode] = useState<FilterMode>("today");
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = todayISO();
    return days.find((d) => d.date === today)?.date ?? days[0]?.date ?? trip.start_date;
  });
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);

  useEffect(() => {
    setCategory(null);
  }, [mode, selectedDate]);

  const filtered =
    mode === "all"
      ? expenses
      : expenses.filter((e) => e.datetime.slice(0, 10) === (mode === "today" ? todayISO() : selectedDate));

  const byCategoryExpenses = category ? filtered.filter((e) => e.category === category) : filtered;

  const filteredTotal = filtered.reduce((sum, e) => sum + e.amount_thb, 0);
  const bigTotal = mode === "all" ? summary.totalTHB : filteredTotal;

  const filteredByCategory = summarize(filtered, [], []).byCategory;

  if (loading) {
    return (
      <div className="p-4 max-w-3xl mx-auto flex flex-col gap-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-56" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-3xl mx-auto flex flex-col gap-5">
      <h1 className="font-heading text-xl font-semibold">สรุปค่าใช้จ่าย</h1>

      <div className="relative h-11 grid grid-cols-3 rounded-full bg-muted/10 p-0.5">
        {MODES.map((m, i) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className="relative h-full rounded-full text-sm font-medium cursor-pointer"
          >
            {mode === m.key && (
              <motion.div
                layoutId="money-mode"
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ type: "spring", duration: 0.2 }}
              />
            )}
            <span className={`relative z-10 ${mode === m.key ? "text-white" : "text-muted"}`}>{m.label}</span>
          </button>
        ))}
      </div>

      {mode === "day" && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <span
              key={d.date}
              onClick={() => setSelectedDate(d.date)}
              className="relative inline-flex shrink-0 before:absolute before:inset-[-4px] before:content-['']"
            >
              <Chip selected={selectedDate === d.date}>{d.label}</Chip>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-1 py-2">
        <CountUpMoney value={bigTotal} />
        <p className="text-sm text-muted">
          จ่ายล่วงหน้า ฿{summary.prepaidTHB.toLocaleString()} · หน้างาน ฿{summary.onsiteTHB.toLocaleString()}
        </p>
      </div>

      <CategoryDonut data={filteredByCategory} total={filteredTotal} selected={category} onSelect={setCategory} />

      {Object.keys(summary.byPayer).length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-muted">แบ่งตามคนจ่าย</h2>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted/10">
            {Object.entries(summary.byPayer).map(([payer, amount], i) => (
              <div
                key={payer}
                style={{
                  flex: amount,
                  backgroundColor: i % 2 === 0 ? "var(--color-primary)" : "var(--color-accent)",
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {Object.entries(summary.byPayer).map(([payer, amount], i) => (
              <span key={payer} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: i % 2 === 0 ? "var(--color-primary)" : "var(--color-accent)" }}
                />
                {payer} <span className="money font-medium">฿{Math.round(amount).toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <ExpenseList expenses={byCategoryExpenses} days={days} onSelect={setEditing} />

      {process.env.NEXT_PUBLIC_SHEET_URL && (
        <a href={process.env.NEXT_PUBLIC_SHEET_URL} target="_blank" rel="noreferrer">
          <Button variant="ghost" full className="inline-flex items-center justify-center gap-2">
            <ExternalLink size={16} />
            เปิดใน Google Sheets
          </Button>
        </a>
      )}

      <ExpenseEditSheet trip={trip} expense={editing} open={!!editing} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}
