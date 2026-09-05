"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plane, BedDouble, Car, Ticket, Plus, ChevronDown, type LucideIcon } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiCreate, apiUpdate, apiDelete } from "@/lib/api";
import { PlanBookSegment } from "@/components/PlanBookSegment";
import { BookingCard } from "@/components/BookingCard";
import { BookingFormSheet, type BookingFormValues } from "@/components/BookingFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { DashboardButton } from "@/components/ui/DashboardButton";
import { PendingExpenseButton } from "@/components/ui/PendingExpenseButton";
import { SearchButton } from "@/components/ui/SearchButton";
import { UploadButton } from "@/components/ui/UploadButton";
import { optimisticCreate, optimisticUpdate, optimisticDelete } from "@/lib/optimistic";
import type { Booking, BookingType } from "@/lib/models/types";

const SECTIONS: { type: BookingType; label: string; icon: LucideIcon }[] = [
  { type: "flight", label: "เที่ยวบิน", icon: Plane },
  { type: "hotel", label: "ที่พัก", icon: BedDouble },
  { type: "car", label: "รถ", icon: Car },
  { type: "activity", label: "กิจกรรม", icon: Ticket },
];

export default function BookingsPage() {
  const { trip } = useTrip();
  const { bookings, loading, setBookings } = useTripData(trip.id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [createType, setCreateType] = useState<BookingType>("flight");
  const [openTypes, setOpenTypes] = useState<Set<BookingType>>(() => new Set());

  const toggleType = (type: BookingType) => {
    setOpenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const total = bookings.length;
  const booked = bookings.filter((b) => b.paid || b.ref_no !== "").length;
  const progressPct = total > 0 ? (booked / total) * 100 : 0;

  const openCreate = (type: BookingType) => {
    setEditingBooking(null);
    setCreateType(type);
    setSheetOpen(true);
    setOpenTypes((prev) => new Set(prev).add(type));
  };

  const openEdit = (booking: Booking) => {
    setEditingBooking(booking);
    setSheetOpen(true);
  };

  const handleSave = (values: BookingFormValues) => {
    const { money, ...rest } = values;
    const payload = {
      ...rest,
      amount: money.amount,
      currency: money.currency,
      fx_rate: money.fx_rate,
      amount_thb: money.amount_thb,
    };
    if (editingBooking) {
      const patch = { ...editingBooking, ...payload };
      optimisticUpdate(setBookings, editingBooking.id, patch, () => apiUpdate<Booking>("bookings", editingBooking.id, patch));
    } else {
      const newBooking: Booking = {
        id: crypto.randomUUID(),
        trip_id: trip.id,
        ...payload,
      };
      optimisticCreate(setBookings, newBooking, () => apiCreate<Booking>("bookings", newBooking));
    }
    setSheetOpen(false);
  };

  const handleDelete = () => {
    if (!editingBooking) return;
    optimisticDelete(setBookings, editingBooking.id, () => apiDelete("bookings", editingBooking.id));
    setSheetOpen(false);
    toast("ลบแล้ว");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-4 pt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-xl font-semibold">จอง</h1>
          <div className="flex items-center">
            <SearchButton />
            <UploadButton />
            <PendingExpenseButton tripId={trip.id} />
            <DashboardButton tripId={trip.id} />
          </div>
        </div>
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

      <div className="px-4 py-3 flex flex-col gap-3">
        {loading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : (
          SECTIONS.map((section) => {
            const sectionBookings = bookings.filter((b) => b.type === section.type);
            const Icon = section.icon;
            const isOpen = openTypes.has(section.type);
            const bookedCount = sectionBookings.filter((b) => b.paid || b.ref_no !== "").length;

            return (
              <section key={section.type} className="rounded-2xl bg-surface shadow-card overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleType(section.type)}
                  className="press w-full min-h-16 px-4 py-3 flex items-center gap-3 cursor-pointer"
                >
                  <span className="h-8 w-8 rounded-full bg-primary-soft grid place-items-center shrink-0">
                    <Icon size={16} className="text-primary" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="font-heading text-base font-semibold block truncate">{section.label}</span>
                    {sectionBookings.length > 0 && (
                      <span className="text-xs text-muted">
                        {sectionBookings.length} รายการ · จองแล้ว {bookedCount}/{sectionBookings.length}
                      </span>
                    )}
                  </span>
                  {sectionBookings.length === 0 && (
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
                        {sectionBookings.length === 0 ? (
                          <p className="text-muted text-sm py-2">ยังไม่มีข้อมูลการจอง</p>
                        ) : (
                          sectionBookings.map((b) => (
                            <BookingCard key={b.id} booking={b} onEdit={() => openEdit(b)} />
                          ))
                        )}
                        <button
                          type="button"
                          onClick={() => openCreate(section.type)}
                          className="h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Plus size={18} />
                          เพิ่มการจอง
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
