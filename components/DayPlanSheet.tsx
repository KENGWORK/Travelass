"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
// an alternate. `accent` ties the sheet to the same per-day color already
// shown on the itinerary header's plan badge, instead of a flat primary.
export function DayPlanSheet({
  open,
  onClose,
  dayLabel,
  accent,
  plans,
  currentItemCount,
  itemCounts,
  onSwitch,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  dayLabel: string;
  accent: string;
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

  const rows = plans.length === 0 ? [{ id: "__implicit__", name: "แผนหลัก", isActive: true, count: currentItemCount }] : plans.map((p) => ({ id: p.id, name: p.name, isActive: p.is_active, count: itemCounts[p.id] ?? 0 }));

  return (
    <BottomSheet open={open} onClose={onClose} title={`แผนของ ${dayLabel}`}>
      <div className="flex flex-col gap-4">
        <motion.div layout className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <motion.button
              key={r.id}
              type="button"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 30 }}
              whileTap={r.isActive || plans.length === 0 ? undefined : { scale: 0.97 }}
              onClick={() => !r.isActive && plans.length > 0 && onSwitch(r.id)}
              disabled={r.isActive}
              className={[
                "relative w-full text-left rounded-2xl border p-3 flex items-center gap-3 overflow-hidden",
                r.isActive ? "border-transparent" : "bg-bg border-muted/20 cursor-pointer",
              ].join(" ")}
              style={
                r.isActive
                  ? { backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` }
                  : undefined
              }
            >
              {r.isActive && (
                <motion.span
                  layoutId="plan-active-bar"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: accent }}
                />
              )}
              <motion.span
                animate={r.isActive ? { scale: [0.7, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="h-9 w-9 rounded-full grid place-items-center shrink-0"
                style={
                  r.isActive
                    ? { backgroundColor: accent, color: "#fff" }
                    : { backgroundColor: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }
                }
              >
                {r.isActive ? <Check size={16} /> : <Layers size={16} />}
              </motion.span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium" style={r.isActive ? { color: accent } : undefined}>
                  {r.name}
                </span>
                <span className="block text-xs text-muted">
                  {r.count} กิจกรรม{r.isActive && " · ใช้อยู่"}
                </span>
              </span>
            </motion.button>
          ))}
        </motion.div>

        <AnimatePresence initial={false} mode="wait">
          {creating ? (
            <motion.div
              key="form"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 rounded-2xl bg-bg border border-muted/20 p-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="day-plan-name" className="text-xs text-muted font-medium">
                    ชื่อแผน
                  </label>
                  <input
                    id="day-plan-name"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="เช่น แผนฝนตก"
                    className="field h-11 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="day-plan-copy" className="text-xs text-muted font-medium">
                    คัดลอกกิจกรรมจาก
                  </label>
                  <select
                    id="day-plan-copy"
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
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setCreating(false)}
                    className="flex-1 h-11 rounded-full text-sm font-medium text-muted cursor-pointer"
                  >
                    ยกเลิก
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={submit}
                    className="flex-1 h-11 rounded-full text-white text-sm font-medium cursor-pointer"
                    style={{ backgroundColor: accent }}
                  >
                    สร้างแผน
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="cta"
              type="button"
              disabled={atMax}
              whileTap={atMax ? undefined : { scale: 0.98 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreating(true)}
              className="h-12 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={18} />
              {atMax ? `สร้างแผนได้สูงสุด ${MAX_DAY_PLANS} แผนต่อวัน` : "สร้างแผนใหม่"}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </BottomSheet>
  );
}
