"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { PhotoPicker } from "@/components/PhotoPicker";
import type { QuickInfo } from "@/lib/models/types";

export interface QuickInfoFormValues {
  label: string;
  value: string;
  photo_ids: string[];
  pinned: boolean;
}

function emptyValues(): QuickInfoFormValues {
  return { label: "", value: "", photo_ids: [], pinned: false };
}

function fromQuickInfo(q: QuickInfo): QuickInfoFormValues {
  return { label: q.label, value: q.value, photo_ids: q.photo_ids, pinned: q.pinned };
}

export function QuickInfoFormSheet({
  open,
  onClose,
  tripName,
  quickInfo,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  tripName: string;
  quickInfo: QuickInfo | null;
  onSave: (values: QuickInfoFormValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [values, setValues] = useState<QuickInfoFormValues>(emptyValues());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(quickInfo ? fromQuickInfo(quickInfo) : emptyValues());
    }
  }, [open, quickInfo]);

  const set = (patch: Partial<QuickInfoFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const save = async () => {
    if (!values.label.trim()) return;
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={quickInfo ? "แก้ไขข้อมูลด่วน" : "เพิ่มข้อมูลด่วน"}>
      <div className="flex flex-col gap-3">
        <FormField label="ป้ายชื่อ">
          <input
            autoFocus
            value={values.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="เช่น เบอร์ฉุกเฉิน, เลขที่ห้อง"
            className="field"
          />
        </FormField>

        <FormField label="ข้อมูล">
          <textarea
            value={values.value}
            onChange={(e) => set({ value: e.target.value })}
            rows={3}
            placeholder="รายละเอียด"
            className="field"
          />
        </FormField>

        <FormField label="รูป">
          <PhotoPicker
            tripName={tripName}
            kind="photos"
            fileIds={values.photo_ids}
            onChange={(ids) => set({ photo_ids: ids })}
          />
        </FormField>

        <ToggleRow checked={values.pinned} onChange={(pinned) => set({ pinned })} label="ปักหมุด" />

        <div className="flex gap-2 mt-2">
          {quickInfo && onDelete && (
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
