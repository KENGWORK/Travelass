"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, TrainFront, ChevronDown } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiCreate, apiUpdate, apiDelete } from "@/lib/api";
import { tripDays } from "@/lib/days";
import { dayColor } from "@/lib/day-color";
import { PlanBookSegment } from "@/components/PlanBookSegment";
import { TransportCard } from "@/components/TransportCard";
import { TransportFormSheet, type TransportFormValues } from "@/components/TransportFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { DashboardButton } from "@/components/ui/DashboardButton";
import { SearchButton } from "@/components/ui/SearchButton";
import { UploadButton } from "@/components/ui/UploadButton";
import { optimisticCreate, optimisticUpdate, optimisticDelete } from "@/lib/optimistic";
import type { Transport } from "@/lib/models/types";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TransportPage() {
  const { trip } = useTrip();
  const { transports, loading, setTransports } = useTripData(trip.id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTransport, setEditingTransport] = useState<Transport | null>(null);
  const [createDay, setCreateDay] = useState<string>(trip.start_date);

  const days = tripDays(trip.start_date, trip.end_date);
  const today = todayISO();
  const defaultOpenDay = days.find((d) => d.date === today)?.date ?? days[0]?.date;
  const [openDays, setOpenDays] = useState<Set<string>>(() => new Set(defaultOpenDay ? [defaultOpenDay] : []));

  const toggleDay = (date: string) => {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const openCreate = (dayDate: string) => {
    setEditingTransport(null);
    setCreateDay(dayDate);
    setSheetOpen(true);
    setOpenDays((prev) => new Set(prev).add(dayDate));
  };

  const openEdit = (transport: Transport) => {
    setEditingTransport(transport);
    setSheetOpen(true);
  };

  const handleSave = (values: TransportFormValues) => {
    const { money, ...rest } = values;
    const payload = {
      ...rest,
      price_amount: money.amount,
      price_currency: money.currency,
      fx_rate: money.fx_rate,
      price_thb: money.amount_thb,
    };
    if (editingTransport) {
      const patch = { ...editingTransport, ...payload };
      optimisticUpdate(setTransports, editingTransport.id, patch, () => apiUpdate<Transport>("transports", editingTransport.id, patch));
    } else {
      const newTransport: Transport = {
        id: crypto.randomUUID(),
        trip_id: trip.id,
        day_date: createDay,
        ...payload,
      };
      optimisticCreate(setTransports, newTransport, () => apiCreate<Transport>("transports", newTransport));
    }
    setSheetOpen(false);
  };

  const handleDelete = () => {
    if (!editingTransport) return;
    optimisticDelete(setTransports, editingTransport.id, () => apiDelete("transports", editingTransport.id));
    setSheetOpen(false);
    toast("ลบแล้ว");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-4 pt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-xl font-semibold">เดินทาง</h1>
          <div className="flex items-center">
            <SearchButton />
            <UploadButton />
            <DashboardButton tripId={trip.id} />
          </div>
        </div>
        <PlanBookSegment tripId={trip.id} active="transport" />
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {loading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : (
          days.map((day, i) => {
            const dayTransports = transports.filter((t) => t.day_date === day.date);
            const accent = dayColor(i);
            const isOpen = openDays.has(day.date);
            const paidCount = dayTransports.filter((t) => t.paid).length;

            return (
              <section key={day.date} className="rounded-2xl bg-surface shadow-card overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleDay(day.date)}
                  className="press w-full min-h-16 px-4 py-3 flex items-center gap-3 cursor-pointer"
                >
                  <span
                    className="h-8 w-8 rounded-full grid place-items-center shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
                  >
                    <TrainFront size={16} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="font-heading text-base font-semibold block truncate">{day.label}</span>
                    {dayTransports.length > 0 && (
                      <span className="text-xs text-muted">
                        {dayTransports.length} รายการ
                        {paidCount > 0 && ` · จ่ายแล้ว ${paidCount}/${dayTransports.length}`}
                      </span>
                    )}
                  </span>
                  {dayTransports.length === 0 && (
                    <span className="text-xs text-muted shrink-0">ว่าง</span>
                  )}
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-muted shrink-0"
                  >
                    <ChevronDown size={18} />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 flex flex-col gap-3 border-t border-muted/10 pt-3">
                        {dayTransports.length === 0 ? (
                          <EmptyState icon={TrainFront} title="ยังไม่มีข้อมูลการเดินทาง" />
                        ) : (
                          dayTransports.map((t) => (
                            <TransportCard key={t.id} transport={t} onEdit={() => openEdit(t)} />
                          ))
                        )}
                        <button
                          type="button"
                          onClick={() => openCreate(day.date)}
                          className="h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Plus size={18} />
                          เพิ่มการเดินทาง
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            );
          })
        )}
      </div>

      <TransportFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        transport={editingTransport}
        tripId={trip.id}
        tripName={trip.name}
        tripCurrency={trip.trip_currency}
        onSave={handleSave}
        onDelete={editingTransport ? handleDelete : undefined}
      />
    </div>
  );
}
