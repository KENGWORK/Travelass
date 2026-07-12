"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { TimeInput } from "@/components/ui/TimeInput";
import type { ItineraryItem } from "@/lib/models/types";

export interface ItineraryFormValues {
  time: string;
  end_time: string;
  title: string;
  place: string;
  maps_link: string;
  notes: string;
}

const EMPTY: ItineraryFormValues = { time: "", end_time: "", title: "", place: "", maps_link: "", notes: "" };

export function ItineraryFormSheet({
  open,
  onClose,
  item,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  item: ItineraryItem | null;
  onSave: (values: ItineraryFormValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [values, setValues] = useState<ItineraryFormValues>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(
        item
          ? { time: item.time, end_time: item.end_time ?? "", title: item.title, place: item.place, maps_link: item.maps_link, notes: item.notes }
          : EMPTY
      );
    }
  }, [open, item]);

  const set = (patch: Partial<ItineraryFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const canSave = values.title.trim() !== "" && values.time.trim() !== "";

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={item ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรม"}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-sm text-muted">เวลาเริ่ม *</label>
            <TimeInput
              value={values.time}
              onChange={(time) => set({ time })}
              className="w-full mt-1"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm text-muted">เวลาจบ (ไม่บังคับ)</label>
            <TimeInput
              value={values.end_time}
              onChange={(end_time) => set({ end_time })}
              className="w-full mt-1"
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted">ชื่อกิจกรรม</label>
          <input
            autoFocus
            value={values.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="เช่น เดินเที่ยววัด"
            className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
          />
        </div>
        <div>
          <label className="text-sm text-muted">สถานที่</label>
          <input
            value={values.place}
            onChange={(e) => set({ place: e.target.value })}
            placeholder="ชื่อสถานที่"
            className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
          />
        </div>
        <div>
          <label className="text-sm text-muted">ลิงก์แผนที่</label>
          <input
            value={values.maps_link}
            onChange={(e) => set({ maps_link: e.target.value })}
            placeholder="https://maps.google.com/..."
            className="w-full h-12 rounded-2xl border border-muted/30 bg-surface px-4 mt-1"
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
          {item && onDelete && (
            <Button variant="secondary" className="text-red-600" onClick={onDelete}>
              ลบ
            </Button>
          )}
          <Button full variant="primary" loading={saving} disabled={!canSave} onClick={save}>
            บันทึก
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
