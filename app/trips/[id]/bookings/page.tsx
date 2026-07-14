"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Plane, BedDouble, Car, Ticket, Plus, type LucideIcon } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiCreate, apiUpdate, apiDelete } from "@/lib/api";
import { PlanBookSegment } from "@/components/PlanBookSegment";
import { BookingCard } from "@/components/BookingCard";
import { BookingFormSheet, type BookingFormValues } from "@/components/BookingFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import type { Booking, BookingType } from "@/lib/models/types";

const SECTIONS: { type: BookingType; label: string; icon: LucideIcon }[] = [
  { type: "flight", label: "เที่ยวบิน", icon: Plane },
  { type: "hotel", label: "ที่พัก", icon: BedDouble },
  { type: "car", label: "รถ", icon: Car },
  { type: "activity", label: "กิจกรรม", icon: Ticket },
];

export default function BookingsPage() {
  const { trip } = useTrip();
  const { bookings, loading, reload } = useTripData(trip.id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [createType, setCreateType] = useState<BookingType>("flight");

  const total = bookings.length;
  const booked = bookings.filter((b) => b.paid || b.ref_no !== "").length;
  const progressPct = total > 0 ? (booked / total) * 100 : 0;

  const openCreate = (type: BookingType) => {
    setEditingBooking(null);
    setCreateType(type);
    setSheetOpen(true);
  };

  const openEdit = (booking: Booking) => {
    setEditingBooking(booking);
    setSheetOpen(true);
  };

  const handleSave = async (values: BookingFormValues) => {
    const { money, ...rest } = values;
    const payload = {
      ...rest,
      amount: money.amount,
      currency: money.currency,
      fx_rate: money.fx_rate,
      amount_thb: money.amount_thb,
    };
    if (editingBooking) {
      await apiUpdate<Booking>("bookings", editingBooking.id, { ...editingBooking, ...payload });
    } else {
      const newBooking: Booking = {
        id: crypto.randomUUID(),
        trip_id: trip.id,
        ...payload,
      };
      await apiCreate<Booking>("bookings", newBooking);
    }
    await reload();
  };

  const handleDelete = async () => {
    if (!editingBooking) return;
    await apiDelete("bookings", editingBooking.id);
    setSheetOpen(false);
    toast("ลบแล้ว");
    await reload();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-4 pt-4 flex flex-col gap-3">
        <h1 className="font-heading text-xl font-semibold">จอง</h1>
        <PlanBookSegment tripId={trip.id} active="bookings" />
        {!loading && total > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 rounded-full bg-muted/10 overflow-hidden">
              <motion.div
                className="bg-primary h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <p className="text-sm text-muted">
              จองแล้ว {booked}/{total}
            </p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex flex-col gap-6">
        {loading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          SECTIONS.map((section) => {
            const sectionBookings = bookings.filter((b) => b.type === section.type);
            const Icon = section.icon;
            return (
              <section key={section.type} className="flex flex-col gap-3">
                <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
                  <Icon size={18} className="text-primary" />
                  {section.label}
                  <span className="text-sm font-normal text-muted">({sectionBookings.length})</span>
                </h2>
                {sectionBookings.length === 0 ? (
                  <p className="text-muted text-sm py-2">ยังไม่มีข้อมูลการจอง</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sectionBookings.map((b) => (
                      <BookingCard key={b.id} booking={b} onEdit={() => openEdit(b)} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openCreate(section.type)}
                  className="h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus size={18} />
                  เพิ่มการจอง
                </button>
              </section>
            );
          })
        )}
      </div>

      <BookingFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        booking={editingBooking}
        defaultType={createType}
        tripId={trip.id}
        tripName={trip.name}
        tripCurrency={trip.trip_currency}
        onSave={handleSave}
        onDelete={editingBooking ? handleDelete : undefined}
      />
    </div>
  );
}
