"use client";
import { useEffect, useState } from "react";
import { apiUpdate } from "@/lib/api";
import { daysBetween, shiftDate } from "@/lib/date-shift";
import { optimisticUpdate } from "@/lib/optimistic";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PhotoPicker } from "@/components/PhotoPicker";
import { toast } from "@/components/ui/Toast";
import type { Booking, ItineraryItem, Transport, Trip } from "@/lib/models/types";
import type { Dispatch, SetStateAction } from "react";

export function EditTripSheet({
  trip,
  itinerary,
  transports,
  bookings,
  setTrip,
  setItinerary,
  setTransports,
  setBookings,
  open,
  onClose,
}: {
  trip: Trip;
  itinerary: ItineraryItem[];
  transports: Transport[];
  bookings: Booking[];
  setTrip: Dispatch<SetStateAction<Trip>>;
  setItinerary: Dispatch<SetStateAction<ItineraryItem[]>>;
  setTransports: Dispatch<SetStateAction<Transport[]>>;
  setBookings: Dispatch<SetStateAction<Booking[]>>;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: trip.name, destination: trip.destination, start_date: trip.start_date, end_date: trip.end_date, cover_photo_id: trip.cover_photo_id });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ name: trip.name, destination: trip.destination, start_date: trip.start_date, end_date: trip.end_date, cover_photo_id: trip.cover_photo_id });
  }, [open, trip]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const dateShifted = form.start_date !== trip.start_date;
  const valid = form.name.trim() && form.destination.trim() && form.start_date && form.end_date && form.start_date <= form.end_date;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const delta = daysBetween(trip.start_date, form.start_date);
    const previousTrip = trip;
    const updatedTrip: Trip = {
      ...trip,
      name: form.name.trim(),
      destination: form.destination.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      cover_photo_id: form.cover_photo_id,
    };
    // Trip is a single object, not a list -- optimisticUpdate's list-setter
    // shape doesn't apply here, so update it directly (same pattern as the
    // dashboard's status toggle).
    setTrip(updatedTrip);
    apiUpdate<Trip>("trips", trip.id, updatedTrip).catch(() => {
      setTrip(previousTrip);
      toast("บันทึกไม่สำเร็จ ลองอีกครั้ง", "error");
    });

    // The trip's own dates changed by `delta` days -- every day-scoped row
    // moves with it, so fixing a typo'd start date doesn't mean re-entering
    // the whole plan. apiUpdate is local-first and its Sheets sync is
    // queued through the same outbox every other write already uses, so
    // this is safe even for a few dozen rows.
    if (delta !== 0) {
      itinerary.forEach((it) => {
        const patch = { day_date: shiftDate(it.day_date, delta), moved_to_date: shiftDate(it.moved_to_date, delta) };
        optimisticUpdate(setItinerary, it.id, patch, () => apiUpdate<ItineraryItem>("itinerary", it.id, { ...it, ...patch }));
      });
      transports.forEach((t) => {
        const patch = { day_date: shiftDate(t.day_date, delta) };
        optimisticUpdate(setTransports, t.id, patch, () => apiUpdate<Transport>("transports", t.id, { ...t, ...patch }));
      });
      bookings.forEach((b) => {
        const patch = { date_from: shiftDate(b.date_from, delta), date_to: shiftDate(b.date_to, delta) };
        optimisticUpdate(setBookings, b.id, patch, () => apiUpdate<Booking>("bookings", b.id, { ...b, ...patch }));
      });
    }

    setSaving(false);
    onClose();
    toast(delta !== 0 ? `บันทึกแล้ว ย้ายแผนทั้งหมด ${delta > 0 ? "+" : ""}${delta} วัน` : "บันทึกแล้ว");
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="แก้ไขทริป">
      <div className="flex flex-col gap-3">
        <FormField label="รูปปกทริป">
          <PhotoPicker
            tripName={trip.name}
            kind="photos"
            fileIds={form.cover_photo_id ? [form.cover_photo_id] : []}
            onChange={(ids) => set({ cover_photo_id: ids[ids.length - 1] ?? "" })}
          />
        </FormField>
        <FormField label="ชื่อทริป">
          <input autoFocus className="field" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </FormField>
        <FormField label="จุดหมาย">
          <input className="field" value={form.destination} onChange={(e) => set({ destination: e.target.value })} />
        </FormField>
        <div className="flex gap-2">
          <FormField label="วันที่เริ่ม" className="flex-1">
            <input type="date" className="field" value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />
          </FormField>
          <FormField label="วันที่สิ้นสุด" className="flex-1">
            <input type="date" className="field" value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} />
          </FormField>
        </div>
        {dateShifted && (
          <p className="text-xs text-muted">
            วันที่เริ่มเปลี่ยน — แผนการเดินทาง, การเดินทาง, และการจองทั้งหมดที่ผูกกับวันที่ จะเลื่อนตามไปด้วยอัตโนมัติ
          </p>
        )}
        <Button variant="primary" full disabled={!valid} loading={saving} onClick={save}>
          บันทึก
        </Button>
      </div>
    </BottomSheet>
  );
}
