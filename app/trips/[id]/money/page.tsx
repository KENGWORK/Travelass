"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, animate } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { tripDays } from "@/lib/days";
import { summarize } from "@/lib/summary";
import { toSpendItems, type SpendItem } from "@/lib/spend";
import { CategoryDonut } from "@/components/CategoryDonut";
import { SpendList } from "@/components/SpendList";
import { PersonSpendList } from "@/components/PersonSpendList";
import { SettleSummary } from "@/components/SettleSummary";
import { ExpenseEditSheet } from "@/components/ExpenseEditSheet";
import { QuickExpenseSheet } from "@/components/QuickExpenseSheet";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { DashboardButton } from "@/components/ui/DashboardButton";
import { PendingExpenseButton } from "@/components/ui/PendingExpenseButton";
import { SearchButton } from "@/components/ui/SearchButton";
import { UploadButton } from "@/components/ui/UploadButton";
import { apiList } from "@/lib/api";
import { selectPendingExpenses } from "@/lib/pending-expense";
import { photoUrl } from "@/lib/photo-url";
import type { Expense, Member } from "@/lib/models/types";

type FilterMode = "person" | "day" | "all" | "settle";

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
  { key: "person", label: "รายคน" },
  { key: "day", label: "รายวัน" },
  { key: "all", label: "ทั้งทริป" },
  { key: "settle", label: "สรุปหนี้" },
];

export default function MoneyPage() {
  const { trip } = useTrip();
  const router = useRouter();
  const { expenses, bookings, transports, summary, loading, setExpenses } = useTripData(trip.id);

  const days = tripDays(trip.start_date, trip.end_date);
  const pending = selectPendingExpenses(expenses);
  const [mode, setMode] = useState<FilterMode>("person");
  const [selectedDate, setSelectedDate] = useState(() => days[0]?.date ?? trip.start_date);
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  // A pending (slip-captured-but-unfilled) expense is completed through the
  // full keypad/split sheet, not the plain edit form -- it often needs a
  // split set up for the first time, which ExpenseEditSheet can't do.
  const [completingPending, setCompletingPending] = useState<Expense | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    setCategory(null);
  }, [mode, selectedDate]);

  useEffect(() => {
    let alive = true;
    const load = () => apiList<Member>("members", trip.id).then((m) => { if (alive) setMembers(m); });
    load();
    window.addEventListener("members-changed", load);
    return () => { alive = false; window.removeEventListener("members-changed", load); };
  }, [trip.id]);

  // person/all scope the whole trip; day scopes to the selected date.
  const inScope = (date: string) => mode !== "day" || date === selectedDate;

  // Scope expenses + paid bookings + paid transports to the selected mode,
  // then run everything (total, donut, list) off that one scoped set so the
  // grand total, the category ring, and the line items always agree.
  const scopedExpenses = expenses.filter((e) => inScope(e.datetime.slice(0, 10)));
  const scopedBookings = bookings.filter((b) => inScope(b.date_from.slice(0, 10)));
  const scopedTransports = transports.filter((t) => inScope(t.day_date));

  const scoped = summarize(scopedExpenses, scopedBookings, scopedTransports);
  const bigTotal = scoped.totalTHB;

  const allItems = toSpendItems(scopedExpenses, scopedBookings, scopedTransports);
  const listItems = category ? allItems.filter((i) => i.category === category) : allItems;

  const pick = (item: SpendItem) => {
    if (item.source === "expense") {
      const exp = expenses.find((e) => e.id === item.id);
      if (!exp) return;
      if (exp.pending) setCompletingPending(exp);
      else setEditing(exp);
    } else if (item.source === "booking") {
      router.push(`/trips/${trip.id}/bookings`);
    } else {
      router.push(`/trips/${trip.id}/transport`);
    }
  };

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
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">สรุปค่าใช้จ่าย</h1>
        <div className="flex items-center">
          <SearchButton />
          <UploadButton />
          <PendingExpenseButton tripId={trip.id} />
          <DashboardButton tripId={trip.id} />
        </div>
      </div>

      {pending.length > 0 && (
        <div className="rounded-2xl bg-warning/10 p-3 flex flex-col gap-2">
          <p className="text-sm font-semibold text-warning px-1">รายการรอกรอกข้อมูล ({pending.length})</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pending.map((p) => {
              const addedBy = members.find((m) => m.name === p.payer);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCompletingPending(p)}
                  className="press relative shrink-0 h-20 w-20 rounded-xl overflow-hidden cursor-pointer shadow-card"
                  style={
                    addedBy
                      ? { boxShadow: `0 0 0 2px var(--color-surface), 0 0 0 4px ${addedBy.color}, 0 0 10px 2px color-mix(in srgb, ${addedBy.color} 60%, transparent)` }
                      : undefined
                  }
                >
                  <img src={photoUrl(p.slip_photo_ids[0])} alt="" className="w-full h-full object-cover" />
                  {addedBy && (
                    <span
                      className="absolute bottom-1 right-1 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shadow"
                      style={{ backgroundColor: addedBy.color }}
                    >
                      {addedBy.name.slice(0, 1)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative h-11 grid grid-cols-4 rounded-full bg-muted/10 p-0.5">
        {MODES.map((m) => (
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

      {mode === "settle" ? (
        <SettleSummary expenses={expenses} members={members} setExpenses={setExpenses} tripName={trip.name} />
      ) : (
        <>
          <div className="flex flex-col items-center gap-1 py-2">
            <CountUpMoney value={bigTotal} />
            <p className="text-sm text-muted">
              จ่ายล่วงหน้า ฿{summary.prepaidTHB.toLocaleString()} · หน้างาน ฿{summary.onsiteTHB.toLocaleString()}{" "}
              <span className="text-xs">(ทั้งทริป)</span>
            </p>
          </div>

          {mode === "person" ? (
            <PersonSpendList items={allItems} members={members} onPick={pick} />
          ) : (
            <>
              <CategoryDonut data={scoped.byCategory} total={bigTotal} selected={category} onSelect={setCategory} />

              {Object.keys(summary.byPayer).length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="font-heading text-sm font-semibold text-muted">
                    แบ่งตามคนจ่าย <span className="font-normal text-xs">(ทั้งทริป)</span>
                  </h2>
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

              <SpendList items={listItems} days={days} members={members} onPick={pick} />
            </>
          )}
        </>
      )}

      {process.env.NEXT_PUBLIC_SHEET_URL && (
        <a href={process.env.NEXT_PUBLIC_SHEET_URL}>
          <Button variant="ghost" full className="inline-flex items-center justify-center gap-2">
            <ExternalLink size={16} />
            เปิดใน Google Sheets
          </Button>
        </a>
      )}

      <ExpenseEditSheet trip={trip} expense={editing} open={!!editing} onClose={() => setEditing(null)} />
      <QuickExpenseSheet
        trip={trip}
        editing={completingPending}
        open={!!completingPending}
        onClose={() => setCompletingPending(null)}
      />
    </div>
  );
}
