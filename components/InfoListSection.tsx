"use client";
import { useEffect, useState } from "react";
import { Plus, MapPin, ExternalLink, Star, Check, ListPlus } from "lucide-react";
import { apiList, apiCreate, apiUpdate, apiDelete } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { toast } from "@/components/ui/Toast";
import type { EntityName } from "@/lib/models/mappers";

export type FieldType = "text" | "textarea" | "url" | "bool" | "price";
export interface InfoField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  primary?: boolean;
}

type Row = { id: string; trip_id: string; [k: string]: string | number | boolean };

function blankRow(fields: InfoField[]): Record<string, string | number | boolean> {
  const r: Record<string, string | number | boolean> = {};
  for (const f of fields) r[f.key] = f.type === "bool" ? false : f.type === "price" ? 0 : "";
  return r;
}

export function InfoListSection({
  tripId,
  entity,
  fields,
  emptyText,
}: {
  tripId: string;
  entity: EntityName;
  fields: InfoField[];
  emptyText: string;
}) {
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | number | boolean>>(() => blankRow(fields));

  const primary = fields.find((f) => f.primary) ?? fields[0];

  const load = () => apiList<Row>(entity, tripId).then(setItems);
  useEffect(() => {
    load();
  }, [tripId, entity]);

  const openCreate = () => {
    setEditingId(null);
    setForm(blankRow(fields));
    setOpen(true);
  };
  const openEdit = (row: Row) => {
    setEditingId(row.id);
    setForm({ ...blankRow(fields), ...row });
    setOpen(true);
  };

  const set = (patch: Record<string, string | number | boolean>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!String(form[primary.key] ?? "").trim()) {
      toast(`กรอก${primary.label}ก่อน`);
      return;
    }
    if (editingId) {
      await apiUpdate(entity, editingId, form);
    } else {
      await apiCreate(entity, { ...form, id: crypto.randomUUID(), trip_id: tripId });
    }
    setOpen(false);
    await load();
  };

  const remove = async () => {
    if (!editingId) return;
    await apiDelete(entity, editingId);
    setOpen(false);
    toast("ลบแล้ว");
    await load();
  };

  const toggleBool = async (row: Row, key: string) => {
    await apiUpdate(entity, row.id, { ...row, [key]: !row[key] });
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <EmptyState icon={ListPlus} title={emptyText} />}

      {items.map((row) => {
        const subtitle = fields.find((f) => !f.primary && (f.type === "text") && String(row[f.key] ?? "").trim());
        return (
          <div key={row.id} className="rounded-2xl bg-surface shadow-card p-3 flex items-start gap-3">
            <button type="button" onClick={() => openEdit(row)} className="press flex-1 min-w-0 text-left cursor-pointer">
              <div className="flex items-center gap-1.5">
                <span className="font-medium truncate">{String(row[primary.key])}</span>
                {fields.some((f) => f.type === "bool" && f.key === "must_try") && row.must_try && (
                  <Star size={14} className="text-warning shrink-0" fill="currentColor" />
                )}
                {fields.some((f) => f.key === "star") && row.star && (
                  <Star size={14} className="text-warning shrink-0" fill="currentColor" />
                )}
              </div>
              {subtitle && <span className="block text-sm text-muted truncate">{String(row[subtitle.key])}</span>}
              {"price_level" in row && Number(row.price_level) > 0 && (
                <span className="block text-xs text-muted">{"฿".repeat(Number(row.price_level))}</span>
              )}
              {"price" in row && String(row.price).trim() && (
                <span className="block text-xs text-muted">{String(row.price)}</span>
              )}
            </button>

            <div className="flex items-center gap-1 shrink-0">
              {String(row.maps_link ?? "").trim() && (
                <a href={String(row.maps_link)} target="_blank" rel="noreferrer" aria-label="แผนที่" className="w-11 h-11 grid place-items-center text-primary cursor-pointer">
                  <MapPin size={18} />
                </a>
              )}
              {String(row.url ?? "").trim() && (
                <a href={String(row.url)} target="_blank" rel="noreferrer" aria-label="เปิดลิงก์" className="w-11 h-11 grid place-items-center text-primary cursor-pointer">
                  <ExternalLink size={18} />
                </a>
              )}
              {(["visited", "bought"] as const).map((k) =>
                fields.some((f) => f.key === k) ? (
                  <button
                    key={k}
                    type="button"
                    aria-label={k === "visited" ? "ไปแล้ว" : "ซื้อแล้ว"}
                    onClick={() => toggleBool(row, k)}
                    className={`w-11 h-11 grid place-items-center rounded-full cursor-pointer ${row[k] ? "text-success" : "text-muted/50"}`}
                  >
                    <Check size={20} />
                  </button>
                ) : null,
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={openCreate}
        className="h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer"
      >
        <Plus size={18} />
        เพิ่ม
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={editingId ? "แก้ไข" : "เพิ่มรายการ"}>
        <div className="flex flex-col gap-3">
          {fields.map((f) =>
            f.type === "bool" ? (
              <ToggleRow
                key={f.key}
                checked={Boolean(form[f.key])}
                onChange={(v) => set({ [f.key]: v })}
                label={f.label}
              />
            ) : f.type === "price" ? (
              <FormField key={f.key} label={f.label}>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set({ [f.key]: form[f.key] === n ? 0 : n })}
                      className={`h-11 flex-1 rounded-xl border cursor-pointer transition-colors ${Number(form[f.key]) >= n ? "bg-primary-soft border-primary text-primary" : "border-muted/30 text-muted"}`}
                    >
                      {"฿".repeat(n)}
                    </button>
                  ))}
                </div>
              </FormField>
            ) : f.type === "textarea" ? (
              <FormField key={f.key} label={f.label}>
                <textarea
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set({ [f.key]: e.target.value })}
                  rows={2}
                  placeholder={f.placeholder}
                  className="field"
                />
              </FormField>
            ) : (
              <FormField key={f.key} label={f.label}>
                <input
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set({ [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  inputMode={f.type === "url" ? "url" : undefined}
                  className="field"
                />
              </FormField>
            ),
          )}
          <div className="flex gap-2 mt-2">
            {editingId && (
              <Button variant="secondary" className="text-danger" onClick={remove}>
                ลบ
              </Button>
            )}
            <Button full variant="primary" onClick={save}>
              บันทึก
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
