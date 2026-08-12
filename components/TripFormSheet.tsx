"use client";
import { useState } from "react";
import { apiCreate } from "@/lib/api";
import type { Trip, Member } from "@/lib/models/types";
import { MEMBER_COLORS } from "@/lib/members";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import { TZ_OPTIONS, browserTimezone } from "@/lib/timezones";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";

const EMPTY = { name: "", destination: "", start_date: "", end_date: "", trip_currency: "THB", trip_timezone: "Asia/Bangkok" };

export function TripFormSheet({
  open,
  onClose,
  onOptimisticCreate,
}: {
  open: boolean;
  onClose: () => void;
  onOptimisticCreate: (trip: Trip) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const valid = form.name.trim() && form.destination.trim() && form.start_date && form.end_date && form.start_date <= form.end_date;

  const submit = () => {
    if (!valid || saving) return;
    setSaving(true);
    const trip: Trip = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      destination: form.destination.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      home_currency: "THB",
      trip_currency: form.trip_currency,
      status: "planning",
      cover_photo_id: "",
      home_timezone: browserTimezone(),
      trip_timezone: form.trip_timezone,
    };
    const me: Member = { id: crypto.randomUUID(), trip_id: trip.id, name: "ฉัน", color: MEMBER_COLORS[0], promptpay_id: "" };

    // Instant: drop into the list and close immediately. apiCreate writes to
    // local storage synchronously (and, if Google is configured, queues the
    // Sheets sync in the background) — see lib/api.ts.
    onOptimisticCreate(trip);
    setForm(EMPTY);
    setSaving(false);
    onClose();

    apiCreate("trips", trip);
    apiCreate("members", me);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="สร้างทริปใหม่">
      <div className="flex flex-col gap-3">
        <FormField label="ชื่อทริป">
          <input
            autoFocus
            className="field"
            placeholder="เช่น ทริปโตเกียว"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField label="จุดหมาย">
          <input
            className="field"
            placeholder="เช่น โตเกียว, ญี่ปุ่น"
            value={form.destination}
            onChange={(e) => set({ destination: e.target.value })}
          />
        </FormField>
        <div className="flex gap-2">
          <FormField label="วันที่เริ่ม" className="flex-1">
            <input
              type="date"
              className="field"
              value={form.start_date}
              onChange={(e) => set({ start_date: e.target.value })}
            />
          </FormField>
          <FormField label="วันที่สิ้นสุด" className="flex-1">
            <input
              type="date"
              className="field"
              value={form.end_date}
              onChange={(e) => set({ end_date: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label="สกุลเงินหลักของทริป">
          <select
            className="field cursor-pointer"
            value={form.trip_currency}
            onChange={(e) => set({ trip_currency: e.target.value })}
          >
            {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="โซนเวลาปลายทาง">
          <select
            className="field cursor-pointer"
            value={form.trip_timezone}
            onChange={(e) => set({ trip_timezone: e.target.value })}
          >
            {TZ_OPTIONS.map((o) => (
              <option key={o.tz} value={o.tz}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <Button variant="primary" full disabled={!valid} onClick={submit}>
          สร้างทริป
        </Button>
      </div>
    </BottomSheet>
  );
}
