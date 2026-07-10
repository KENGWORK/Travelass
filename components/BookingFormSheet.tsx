"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Checkbox } from "@/components/ui/Checkbox";
import { MoneyInput, type MoneyValue } from "@/components/ui/MoneyInput";
import { PhotoPicker } from "@/components/PhotoPicker";
import type { Booking, BookingType, PayTiming } from "@/lib/models/types";

const TYPES: { value: BookingType; label: string }[] = [
  { value: "flight", label: "เที่ยวบิน" },
  { value: "hotel", label: "ที่พัก" },
  { value: "car", label: "รถ" },
  { value: "activity", label: "กิจกรรม" },
];
const PAYERS = ["เรา", "แฟน"];
const TIMINGS: { value: PayTiming; label: string }[] = [
  { value: "prepaid", label: "จ่ายล่วงหน้า" },
  { value: "pay_before", label: "จ่ายก่อน" },
  { value: "pay_after", label: "จ่ายหลัง" },
];

export interface BookingFormValues {
  type: BookingType;
  vendor: string;
  ref_no: string;
  date_from: string;
  date_to: string;
  detail: string;
  money: MoneyValue;
  payer: string;
  pay_timing: PayTiming;
  paid: boolean;
  slip_photo_ids: string[];
  notes: string;
}

function emptyValues(tripCurrency: string, type: BookingType): BookingFormValues {
  return {
    type,
    vendor: "",
    ref_no: "",
    date_from: "",
    date_to: "",
    detail: "",
    money: { amount: 0, currency: tripCurrency, fx_rate: 1, amount_thb: 0 },
    payer: "เรา",
    pay_timing: "pay_before",
    paid: false,
    slip_photo_ids: [],
    notes: "",
  };
}

function fromBooking(b: Booking): BookingFormValues {
  return {
    type: b.type,
    vendor: b.vendor,
    ref_no: b.ref_no,
    date_from: b.date_from,
    date_to: b.date_to,
    detail: b.detail,
    money: { amount: b.amount, currency: b.currency, fx_rate: b.fx_rate, amount_thb: b.amount_thb },
    payer: b.payer,
    pay_timing: b.pay_timing,
    paid: b.paid,
    slip_photo_ids: b.slip_photo_ids,
    notes: b.notes,
  };
}

export function BookingFormSheet({
  open,
  onClose,
  booking,
  defaultType,
  tripName,
  tripCurrency,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
  defaultType: BookingType;
  tripName: string;
  tripCurrency: string;
  onSave: (values: BookingFormValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [values, setValues] = useState<BookingFormValues>(() => emptyValues(tripCurrency, defaultType));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(booking ? fromBooking(booking) : emptyValues(tripCurrency, defaultType));
    }
  }, [open, booking, tripCurrency, defaultType]);

  const set = (patch: Partial<BookingFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const save = async () => {
    if (!values.vendor.trim()) return;
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={booking ? "แก้ไขการจอง" : "เพิ่มการจอง"}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-sm text-muted">ประเภท</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {TYPES.map((t) => (
              <span
                key={t.value}
                onClick={() => set({ type: t.value })}
                className="relative inline-flex before:absolute before:inset-[-4px] before:content-['']"
              >
                <Chip selected={values.type === t.value}>{t.label}</Chip>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">ผู้ให้บริการ</label>
          <input
            autoFocus
            value={values.vendor}
            onChange={(e) => set({ vendor: e.target.value })}
            placeholder="เช่น Thai Airways, Agoda"
            className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
          />
        </div>

        <div>
          <label className="text-sm text-muted">เลขที่อ้างอิง</label>
          <input
            value={values.ref_no}
            onChange={(e) => set({ ref_no: e.target.value })}
            placeholder="เลขที่จอง / booking ref"
            className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1 font-mono"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-sm text-muted">วันที่เริ่ม</label>
            <input
              type="date"
              value={values.date_from}
              onChange={(e) => set({ date_from: e.target.value })}
              className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm text-muted">วันที่สิ้นสุด</label>
            <input
              type="date"
              value={values.date_to}
              onChange={(e) => set({ date_to: e.target.value })}
              className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">รายละเอียด</label>
          <textarea
            value={values.detail}
            onChange={(e) => set({ detail: e.target.value })}
            rows={2}
            placeholder="เช่น เที่ยวบิน เลขที่นั่ง ชั้นห้อง"
            className="w-full rounded-2xl border border-muted/30 bg-surface px-4 py-3 mt-1"
          />
        </div>

        <div>
          <label className="text-sm text-muted">ราคา</label>
          <div className="mt-1">
            <MoneyInput value={values.money} onChange={(money) => set({ money })} tripCurrency={tripCurrency} />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">ใครจ่าย</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {PAYERS.map((p) => (
              <span
                key={p}
                onClick={() => set({ payer: p })}
                className="relative inline-flex before:absolute before:inset-[-4px] before:content-['']"
              >
                <Chip selected={values.payer === p}>{p}</Chip>
              </span>
            ))}
            <input
              value={PAYERS.includes(values.payer) ? "" : values.payer}
              onChange={(e) => set({ payer: e.target.value })}
              placeholder="อื่นๆ"
              className="h-12 w-24 rounded-full border border-muted/30 bg-surface px-3 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">จังหวะจ่ายเงิน</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {TIMINGS.map((t) => (
              <span
                key={t.value}
                onClick={() => set({ pay_timing: t.value })}
                className="relative inline-flex before:absolute before:inset-[-4px] before:content-['']"
              >
                <Chip selected={values.pay_timing === t.value}>{t.label}</Chip>
              </span>
            ))}
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => set({ paid: !values.paid })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              set({ paid: !values.paid });
            }
          }}
          className="flex items-center gap-3 min-h-11 py-1 cursor-pointer select-none"
        >
          <Checkbox checked={values.paid} onChange={(paid) => set({ paid })} />
          <span className="text-sm">จ่ายแล้ว</span>
        </div>

        <div>
          <label className="text-sm text-muted">สลิปการโอน</label>
          <div className="mt-1">
            <PhotoPicker
              tripName={tripName}
              kind="slips"
              fileIds={values.slip_photo_ids}
              onChange={(ids) => set({ slip_photo_ids: ids })}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">โน้ต</label>
          <textarea
            value={values.notes}
            onChange={(e) => set({ notes: e.target.value })}
            rows={3}
            className="w-full rounded-2xl border border-muted/30 bg-surface px-4 py-3 mt-1"
          />
        </div>

        <div className="flex gap-2 mt-2">
          {booking && onDelete && (
            <Button variant="secondary" className="text-danger" onClick={onDelete}>
              ลบ
            </Button>
          )}
          <Button full variant="primary" loading={saving} onClick={save}>
            บันทึก
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
