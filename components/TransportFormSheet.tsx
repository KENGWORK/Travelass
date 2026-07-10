"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Checkbox } from "@/components/ui/Checkbox";
import { MoneyInput, type MoneyValue } from "@/components/ui/MoneyInput";
import { PhotoPicker } from "@/components/PhotoPicker";
import { X } from "lucide-react";
import type { Transport, PayTiming } from "@/lib/models/types";

const MODES = ["รถไฟ", "บัส", "เครื่องบิน", "เรือ", "เดิน"];
const PAYERS = ["เรา", "แฟน"];
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
    duration_min: 0,
    money: { amount: 0, currency: tripCurrency, fx_rate: 1, amount_thb: 0 },
    payer: "เรา",
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
  tripName,
  tripCurrency,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  transport: Transport | null;
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

  const save = async () => {
    if (!values.from.trim() || !values.to.trim()) return;
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={transport ? "แก้ไขการเดินทาง" : "เพิ่มการเดินทาง"}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-sm text-muted">จาก</label>
            <input
              autoFocus
              value={values.from}
              onChange={(e) => set({ from: e.target.value })}
              placeholder="ต้นทาง"
              className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm text-muted">ไป</label>
            <input
              value={values.to}
              onChange={(e) => set({ to: e.target.value })}
              placeholder="ปลายทาง"
              className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">รูปแบบการเดินทาง</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {MODES.map((m) => (
              <span
                key={m}
                onClick={() => set({ mode: m })}
                className="relative inline-flex before:absolute before:inset-[-4px] before:content-['']"
              >
                <Chip selected={values.mode === m}>{m}</Chip>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">จุดนัดพบ</label>
          <input
            value={values.pickup_point}
            onChange={(e) => set({ pickup_point: e.target.value })}
            placeholder="เช่น หน้าล็อบบี้โรงแรม"
            className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
          />
          <div className="mt-2">
            <PhotoPicker
              tripName={tripName}
              kind="photos"
              fileIds={values.pickup_photo_ids}
              onChange={(ids) => set({ pickup_photo_ids: ids })}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">เวลาออกเดินทาง</label>
          <div className="flex gap-2 mt-1">
            <input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              className="flex-1 h-12 rounded-2xl border border-muted/30 bg-surface px-4"
            />
            <Button variant="secondary" onClick={addTime} className="shrink-0">
              เพิ่มเวลา
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
        </div>

        <div>
          <label className="text-sm text-muted">ใช้เวลา (นาที)</label>
          <input
            inputMode="numeric"
            type="number"
            value={values.duration_min || ""}
            onChange={(e) => set({ duration_min: Number(e.target.value) || 0 })}
            placeholder="0"
            className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
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
          <label className="text-sm text-muted">ตัวเลือกสำรอง</label>
          <textarea
            value={values.alt_option}
            onChange={(e) => set({ alt_option: e.target.value })}
            rows={2}
            placeholder="แผนสำรองถ้าแผนนี้ไม่ได้"
            className="w-full rounded-2xl border border-muted/30 bg-surface px-4 py-3 mt-1"
          />
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
