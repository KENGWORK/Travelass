"use client";
import { useEffect, useState } from "react";
import { Check, Layers, Plus } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { DayPlan } from "@/lib/models/types";

export const CURRENT_PLAN_SENTINEL = "__current__";
export const MAX_DAY_PLANS = 4;

// Tapping an already-selected day chip opens this instead of a no-op, so the
// gesture that picks a plan doesn't need a new UI element competing with the
// day chips themselves. A day with no DayPlan rows yet shows a single
// implicit "แผนหลัก" row wrapping whatever's already planned -- it only
// becomes a real row (and stops being the sole option) once the user creates
// an alternate.
export function DayPlanSheet({
  open,
  onClose,
  dayLabel,
  plans,
  currentItemCount,
  itemCounts,
  onSwitch,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  dayLabel: string;
  plans: DayPlan[];
  currentItemCount: number;
  itemCounts: Record<string, number>;
  onSwitch: (planId: string) => void;
  onCreate: (name: string, copyFromId: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setName("");
      setCopyFrom("");
    }
  }, [open]);

  const planCount = plans.length === 0 ? 1 : plans.length;
  const atMax = planCount >= MAX_DAY_PLANS;

  const copyOptions =
    plans.length === 0
      ? [{ id: CURRENT_PLAN_SENTINEL, name: "แผนหลัก" }]
      : plans.map((p) => ({ id: p.id, name: p.name }));

  const submit = () => {
    onCreate(name.trim(), copyFrom || null);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`แผนของ ${dayLabel}`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {plans.length === 0 ? (
            <div className="w-full rounded-2xl bg-primary-soft border border-primary/30 p-3 flex items-center gap-3">
              <span className="h-9 w-9 rounded-full bg-primary text-white grid place-items-center shrink-0">
                <Check size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-primary">แผนหลัก</span>
                <span className="block text-xs text-muted">{currentItemCount} กิจกรรม · ใช้อยู่</span>
              </span>
            </div>
          ) : (
            plans.map((p) => {
              const active = p.is_active;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => !active && onSwitch(p.id)}
                  className={[
                    "w-full text-left rounded-2xl border p-3 flex items-center gap-3 cursor-pointer",
                    active ? "bg-primary-soft border-primary/30" : "bg-bg border-muted/20",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-9 w-9 rounded-full grid place-items-center shrink-0",
                      active ? "bg-primary text-white" : "bg-muted/10 text-muted",
                    ].join(" ")}
                  >
                    {active ? <Check size={16} /> : <Layers size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-medium ${active ? "text-primary" : ""}`}>{p.name}</span>
                    <span className="block text-xs text-muted">
                      {itemCounts[p.id] ?? 0} กิจกรรม{active && " · ใช้อยู่"}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {creating ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-bg border border-muted/20 p-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อแผน เช่น แผนฝนตก"
              className="field h-11 text-sm"
            />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted font-medium">คัดลอกกิจกรรมจาก</span>
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                className="field h-11 text-sm"
              >
                <option value="">เริ่มว่างเปล่า</option>
                {copyOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="flex-1 h-11 rounded-full text-sm font-medium text-muted cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submit}
                className="flex-1 h-11 rounded-full bg-primary text-white text-sm font-medium cursor-pointer"
              >
                สร้างแผน
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={atMax}
            onClick={() => setCreating(true)}
            className="h-12 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={18} />
            {atMax ? `สร้างแผนได้สูงสุด ${MAX_DAY_PLANS} แผนต่อวัน` : "สร้างแผนใหม่"}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
