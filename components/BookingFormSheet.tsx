"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FormField } from "@/components/ui/FormField";
import { MoneyInput, type MoneyValue } from "@/components/ui/MoneyInput";
import { Disclosure } from "@/components/ui/Disclosure";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PayerChips } from "@/components/PayerChips";
import { toast } from "@/components/ui/Toast";
import { defaultEndDate } from "@/lib/dates";
import type { Booking, BookingType, PayTiming } from "@/lib/models/types";

const TYPES: { value: BookingType; label: string }[] = [
  { value: "flight", label: "เที่ยวบิน" },
  { value: "hotel", label: "ที่พัก" },
  { value: "car", label: "รถ" },
  { value: "activity", label: "กิจกรรม" },
];
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
    money: { amount: 0, currency: tripCurrency, fx_rate: 0, amount_thb: 0 },
    payer: "ฉัน",
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
  tripId,
  tripName,
  tripCurrency,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
  defaultType: BookingType;
  tripId: string;
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

  const hasSecondaryContent = !!booking && (values.detail !== "" || values.notes !== "");

  const save = async () => {
    if (!values.vendor.trim()) {
      toast("กรอกผู้ให้บริการก่อน");
      return;
    }
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
        <FormField label="ประเภท">
          <div className="flex gap-2 flex-wrap">
            {TYPES.map((t) => (
              <Chip key={t.value} selected={values.type === t.value} onClick={() => set({ type: t.value })}>
                {t.label}
              </Chip>
            ))}
          </div>
        </FormField>

        <FormField label="ผู้ให้บริการ">
          <input
            autoFocus
            value={values.vendor}
            onChange={(e) => set({ vendor: e.target.value })}
            placeholder="เช่น Thai Airways, Agoda"
            className="field"
          />
        </FormField>

        <FormField label="เลขที่อ้างอิง">
          <input
            value={values.ref_no}
            onChange={(e) => set({ ref_no: e.target.value })}
            placeholder="เลขที่จอง / booking ref"
            className="field font-mono"
          />
        </FormField>

        <div className="flex gap-2">
          <FormField label="วันที่เริ่ม *" className="flex-1">
            <input
              type="date"
              value={values.date_from}
              onChange={(e) => {
                const from = e.target.value;
                setValues((v) => ({ ...v, date_from: from, date_to: defaultEndDate(from, v.date_to) }));
              }}
              className="field"
            />
          </FormField>
          <FormField label="วันที่สิ้นสุด" className="flex-1">
            <input
              type="date"
              value={values.date_to}
              min={values.date_from || undefined}
              onChange={(e) => set({ date_to: e.target.value })}
              className="field"
            />
          </FormField>
        </div>

        <FormField label="ราคา">
          <MoneyInput value={values.money} onChange={(money) => set({ money })} tripCurrency={tripCurrency} />
        </FormField>

        <FormField label="ใครจ่าย">
          <PayerChips tripId={tripId} value={values.payer} onChange={(payer) => set({ payer })} />
        </FormField>

        {/* Visible up here (not in the collapsed disclosure) — unpaid items
            don't count toward spend, so this toggle must be seen to be used. */}
        <ToggleRow checked={values.paid} onChange={(paid) => set({ paid })} label="จ่ายแล้ว" />

        {/* Also visible up here — buried in the collapsed disclosure it was
            easy to miss entirely, and attaching the slip is the whole point
            of tracking a booking. */}
        <FormField label="สลิป / ใบจอง">
          <PhotoPicker
            tripName={tripName}
            kind="slips"
            fileIds={values.slip_photo_ids}
            onChange={(ids) => set({ slip_photo_ids: ids })}
          />
        </FormField>

        <Disclosure label="รายละเอียดเพิ่มเติม" defaultOpen={hasSecondaryContent}>
          <FormField label="รายละเอียด">
            <textarea
              value={values.detail}
              onChange={(e) => set({ detail: e.target.value })}
              rows={2}
              placeholder="เช่น เที่ยวบิน เลขที่นั่ง ชั้นห้อง"
              className="field"
            />
          </FormField>

          <FormField label="จังหวะจ่ายเงิน">
            <div className="flex gap-2 flex-wrap">
              {TIMINGS.map((t) => (
                <Chip key={t.value} selected={values.pay_timing === t.value} onClick={() => set({ pay_timing: t.value })}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </FormField>

          <FormField label="โน้ต">
            <textarea
              value={values.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={3}
              className="field"
            />
          </FormField>
        </Disclosure>

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
