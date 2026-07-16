"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FormField } from "@/components/ui/FormField";
import { MoneyInput, type MoneyValue } from "@/components/ui/MoneyInput";
import { TimeInput } from "@/components/ui/TimeInput";
import { Disclosure } from "@/components/ui/Disclosure";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PayerChips } from "@/components/PayerChips";
import { toast } from "@/components/ui/Toast";
import { computeDurationMin } from "@/lib/time";
import { X } from "lucide-react";
import type { Transport, PayTiming } from "@/lib/models/types";

const MODES = ["รถไฟ", "บัส", "เครื่องบิน", "เรือ", "เดิน"];
const TIMINGS: { value: PayTiming; label: string }[] = [
  { value: "prepaid", label: "จ่ายล่วงหน้า" },
  { value: "pay_before", label: "จ่ายก่อน" },
  { value: "pay_after", label: "จ่ายหลัง" },
];

export interface TransportFormValues {
  from: string;
  to: string;
  mode: string;
  pickup_point: string;
  pickup_photo_ids: string[];
  departure_times: string[];
  depart_time: string;
  arrive_time: string;
  duration_min: number;
  money: MoneyValue;
  payer: string;
  pay_timing: PayTiming;
  paid: boolean;
  slip_photo_ids: string[];
  alt_option: string;
  notes: string;
}

function emptyValues(tripCurrency: string): TransportFormValues {
  return {
    from: "",
    to: "",
    mode: MODES[0],
    pickup_point: "",
    pickup_photo_ids: [],
    departure_times: [],
    depart_time: "",
    arrive_time: "",
    duration_min: 0,
    money: { amount: 0, currency: tripCurrency, fx_rate: 0, amount_thb: 0 },
    payer: "ฉัน",
    pay_timing: "pay_before",
    paid: false,
    slip_photo_ids: [],
    alt_option: "",
    notes: "",
  };
}

function fromTransport(t: Transport): TransportFormValues {
  return {
    from: t.from,
    to: t.to,
    mode: t.mode || MODES[0],
    pickup_point: t.pickup_point,
    pickup_photo_ids: t.pickup_photo_ids,
    departure_times: t.departure_times,
    depart_time: t.depart_time ?? "",
    arrive_time: t.arrive_time ?? "",
    duration_min: t.duration_min,
    money: { amount: t.price_amount, currency: t.price_currency, fx_rate: t.fx_rate, amount_thb: t.price_thb },
    payer: t.payer,
    pay_timing: t.pay_timing,
    paid: t.paid,
    slip_photo_ids: t.slip_photo_ids,
    alt_option: t.alt_option,
    notes: t.notes,
  };
}

export function TransportFormSheet({
  open,
  onClose,
  transport,
  tripId,
  tripName,
  tripCurrency,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  transport: Transport | null;
  tripId: string;
  tripName: string;
  tripCurrency: string;
  onSave: (values: TransportFormValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [values, setValues] = useState<TransportFormValues>(() => emptyValues(tripCurrency));
  const [timeInput, setTimeInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(transport ? fromTransport(transport) : emptyValues(tripCurrency));
      setTimeInput("");
    }
  }, [open, transport, tripCurrency]);

  const set = (patch: Partial<TransportFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const addTime = () => {
    if (!timeInput) return;
    if (values.departure_times.includes(timeInput)) return;
    set({ departure_times: [...values.departure_times, timeInput] });
    setTimeInput("");
  };

  const removeTime = (t: string) => set({ departure_times: values.departure_times.filter((x) => x !== t) });

  const autoDuration = computeDurationMin(values.depart_time, values.arrive_time);

  const hasSecondaryContent =
    !!transport &&
    (values.pickup_point !== "" ||
      values.pickup_photo_ids.length > 0 ||
      values.departure_times.length > 0 ||
      values.slip_photo_ids.length > 0 ||
      values.alt_option !== "" ||
      values.notes !== "");

  const save = async () => {
    if (!values.from.trim() || !values.to.trim()) {
      toast("กรอกต้นทางกับปลายทางก่อน");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...values, duration_min: autoDuration || values.duration_min });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={transport ? "แก้ไขการเดินทาง" : "เพิ่มการเดินทาง"}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <FormField label="จาก" className="flex-1">
            <input
              autoFocus
              value={values.from}
              onChange={(e) => set({ from: e.target.value })}
              placeholder="ต้นทาง"
              className="field"
            />
          </FormField>
          <FormField label="ไป" className="flex-1">
            <input
              value={values.to}
              onChange={(e) => set({ to: e.target.value })}
              placeholder="ปลายทาง"
              className="field"
            />
          </FormField>
        </div>

        <FormField label="รูปแบบการเดินทาง">
          <div className="flex gap-2 flex-wrap">
            {MODES.map((m) => (
              <Chip key={m} selected={values.mode === m} onClick={() => set({ mode: m })}>
                {m}
              </Chip>
            ))}
          </div>
        </FormField>

        <div className="flex gap-2">
          <FormField label="เวลาออก *" className="flex-1">
            <TimeInput value={values.depart_time} onChange={(depart_time) => set({ depart_time })} className="w-full" />
          </FormField>
          <FormField label="เวลาถึง" className="flex-1">
            <TimeInput value={values.arrive_time} onChange={(arrive_time) => set({ arrive_time })} className="w-full" />
          </FormField>
        </div>
        {autoDuration > 0 && <p className="text-sm text-muted -mt-1">ใช้เวลา ~{autoDuration} นาที</p>}

        <FormField label="ราคา">
          <MoneyInput value={values.money} onChange={(money) => set({ money })} tripCurrency={tripCurrency} />
        </FormField>

        <FormField label="ใครจ่าย">
          <PayerChips tripId={tripId} value={values.payer} onChange={(payer) => set({ payer })} />
        </FormField>

        {/* Visible up here (not in the collapsed disclosure) — unpaid items
            don't count toward spend, so this toggle must be seen to be used. */}
        <ToggleRow checked={values.paid} onChange={(paid) => set({ paid })} label="จ่ายแล้ว" />

        <Disclosure label="รายละเอียดเพิ่มเติม" defaultOpen={hasSecondaryContent}>
          <FormField label="จุดนัดพบ">
            <input
              value={values.pickup_point}
              onChange={(e) => set({ pickup_point: e.target.value })}
              placeholder="เช่น หน้าล็อบบี้โรงแรม"
              className="field"
            />
            <div className="mt-2">
              <PhotoPicker
                tripName={tripName}
                kind="photos"
                fileIds={values.pickup_photo_ids}
                onChange={(ids) => set({ pickup_photo_ids: ids })}
              />
            </div>
          </FormField>

          <FormField label="รอบรถ (ทางเลือก)">
            <div className="flex gap-2">
              <TimeInput value={timeInput} onChange={setTimeInput} className="flex-1" />
              <Button variant="secondary" onClick={addTime} className="shrink-0">
                เพิ่มรอบ
              </Button>
            </div>
            {values.departure_times.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {values.departure_times.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => removeTime(t)}
                    className="relative h-9 pl-3 pr-2 rounded-full bg-primary-soft text-primary text-sm cursor-pointer inline-flex items-center gap-1 before:absolute before:inset-[-4px] before:content-['']"
                  >
                    {t}
                    <X size={14} />
                  </button>
                ))}
              </div>
            )}
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

          <FormField label="สลิปการโอน">
            <PhotoPicker
              tripName={tripName}
              kind="slips"
              fileIds={values.slip_photo_ids}
              onChange={(ids) => set({ slip_photo_ids: ids })}
            />
          </FormField>

          <FormField label="ตัวเลือกสำรอง">
            <textarea
              value={values.alt_option}
              onChange={(e) => set({ alt_option: e.target.value })}
              rows={2}
              placeholder="แผนสำรองถ้าแผนนี้ไม่ได้"
              className="field"
            />
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
          {transport && onDelete && (
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
