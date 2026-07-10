"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiCreate, apiUpdate, apiDelete } from "@/lib/api";
import { tripDays } from "@/lib/days";
import { PlanBookSegment } from "@/components/PlanBookSegment";
import { TransportCard } from "@/components/TransportCard";
import { TransportFormSheet, type TransportFormValues } from "@/components/TransportFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import type { Transport } from "@/lib/models/types";

export default function TransportPage() {
  const { trip } = useTrip();
  const { transports, loading, reload } = useTripData(trip.id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTransport, setEditingTransport] = useState<Transport | null>(null);
  const [createDay, setCreateDay] = useState<string>(trip.start_date);

  const days = tripDays(trip.start_date, trip.end_date);

  const openCreate = (dayDate: string) => {
    setEditingTransport(null);
    setCreateDay(dayDate);
    setSheetOpen(true);
  };

  const openEdit = (transport: Transport) => {
    setEditingTransport(transport);
    setSheetOpen(true);
  };

  const handleSave = async (values: TransportFormValues) => {
    const { money, ...rest } = values;
    const payload = {
      ...rest,
      price_amount: money.amount,
      price_currency: money.currency,
      fx_rate: money.fx_rate,
      price_thb: money.amount_thb,
    };
    if (editingTransport) {
      await apiUpdate<Transport>("transports", editingTransport.id, { ...editingTransport, ...payload });
    } else {
      const newTransport: Transport = {
        id: crypto.randomUUID(),
        trip_id: trip.id,
        day_date: createDay,
        ...payload,
      };
      await apiCreate<Transport>("transports", newTransport);
    }
    await reload();
  };

  const handleDelete = async () => {
    if (!editingTransport) return;
    await apiDelete("transports", editingTransport.id);
    setSheetOpen(false);
    toast("ลบแล้ว");
    await reload();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-4 pt-4 flex flex-col gap-3">
        <h1 className="font-heading text-xl font-semibold">เดินทาง</h1>
        <PlanBookSegment tripId={trip.id} active="transport" />
      </div>

      <div className="px-4 py-3 flex flex-col gap-6">
        {loading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          days.map((day) => {
            const dayTransports = transports.filter((t) => t.day_date === day.date);
            return (
              <section key={day.date} className="flex flex-col gap-3">
                <h2 className="font-heading text-lg font-semibold">{day.label}</h2>
                {dayTransports.length === 0 ? (
                  <p className="text-muted text-sm py-2">ยังไม่มีข้อมูลการเดินทาง</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {dayTransports.map((t) => (
                      <TransportCard key={t.id} transport={t} onEdit={() => openEdit(t)} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openCreate(day.date)}
                  className="h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus size={18} />
                  เพิ่มการเดินทาง
                </button>
              </section>
            );
          })
        )}
      </div>

      <TransportFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        transport={editingTransport}
        tripName={trip.name}
        tripCurrency={trip.trip_currency}
        onSave={handleSave}
        onDelete={editingTransport ? handleDelete : undefined}
      />
    </div>
  );
}
