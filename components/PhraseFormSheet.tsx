"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FormField } from "@/components/ui/FormField";
import { PHRASE_CATEGORIES } from "@/lib/phrase-seed";
import type { Phrase } from "@/lib/models/types";

export interface PhraseFormValues {
  category: string;
  text: string;
  pronunciation: string;
  meaning: string;
}

function emptyValues(): PhraseFormValues {
  return { category: PHRASE_CATEGORIES[0], text: "", pronunciation: "", meaning: "" };
}

function fromPhrase(p: Phrase): PhraseFormValues {
  return { category: p.category, text: p.text, pronunciation: p.pronunciation, meaning: p.meaning };
}

export function PhraseFormSheet({
  open,
  onClose,
  phrase,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  phrase: Phrase | null;
  onSave: (values: PhraseFormValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [values, setValues] = useState<PhraseFormValues>(emptyValues());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValues(phrase ? fromPhrase(phrase) : emptyValues());
  }, [open, phrase]);

  const set = (patch: Partial<PhraseFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const save = async () => {
    if (!values.text.trim()) return;
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={phrase ? "แก้ไขวลี" : "เพิ่มวลี"}>
      <div className="flex flex-col gap-3">
        <FormField label="หมวด">
          <div className="flex gap-2 flex-wrap">
            {PHRASE_CATEGORIES.map((c) => (
              <Chip key={c} selected={values.category === c} onClick={() => set({ category: c })}>
                {c}
              </Chip>
            ))}
          </div>
        </FormField>

        <FormField label="คำ / ประโยค">
          <input
            autoFocus
            value={values.text}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="เช่น 你好"
            className="field"
          />
        </FormField>

        <FormField label="คำอ่าน">
          <input
            value={values.pronunciation}
            onChange={(e) => set({ pronunciation: e.target.value })}
            placeholder="เช่น nǐ hǎo"
            className="field"
          />
        </FormField>

        <FormField label="คำแปล">
          <input
            value={values.meaning}
            onChange={(e) => set({ meaning: e.target.value })}
            placeholder="เช่น สวัสดี"
            className="field"
          />
        </FormField>

        <div className="flex gap-2 mt-2">
          {phrase && onDelete && (
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
