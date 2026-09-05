"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Plus } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { apiList, apiCreate, apiUpdate } from "@/lib/api";
import { CHECKLIST_TEMPLATE } from "@/lib/checklist-template";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { DashboardButton } from "@/components/ui/DashboardButton";
import { PendingExpenseButton } from "@/components/ui/PendingExpenseButton";
import { SearchButton } from "@/components/ui/SearchButton";
import { UploadButton } from "@/components/ui/UploadButton";
import { optimisticCreate, optimisticUpdate } from "@/lib/optimistic";
import type { ChecklistItem } from "@/lib/models/types";

const GROUPS: string[] = ["เอกสาร", "ของใช้", "to-do"];

export default function ChecklistPage() {
  const { trip } = useTrip();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(GROUPS.map((g) => [g, true]))
  );
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const reload = async () => {
    setLoading(true);
    const list = await apiList<ChecklistItem>("checklist", trip.id);
    setItems(list);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const toggleDone = (item: ChecklistItem) => {
    const patch = { ...item, done: !item.done };
    optimisticUpdate(setItems, item.id, patch, () => apiUpdate<ChecklistItem>("checklist", item.id, patch));
  };

  const addItem = (group: string) => {
    const text = (inputs[group] ?? "").trim();
    if (!text) return;
    setInputs((prev) => ({ ...prev, [group]: "" }));
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      trip_id: trip.id,
      group,
      item: text,
      done: false,
      from_template: false,
    };
    optimisticCreate(setItems, newItem, () => apiCreate<ChecklistItem>("checklist", newItem));
  };

  const applyTemplate = () => {
    const newItems: ChecklistItem[] = CHECKLIST_TEMPLATE.map((t) => ({
      id: crypto.randomUUID(),
      trip_id: trip.id,
      group: t.group,
      item: t.item,
      done: false,
      from_template: true,
    }));
    setItems((prev) => [...prev, ...newItems]);
    Promise.all(newItems.map((it) => apiCreate<ChecklistItem>("checklist", it))).catch(() => {
      const ids = new Set(newItems.map((it) => it.id));
      setItems((prev) => prev.filter((it) => !ids.has(it.id)));
      toast("เพิ่มรายการมาตรฐานไม่สำเร็จ ลองอีกครั้ง", "error");
    });
    toast("เพิ่มรายการมาตรฐานแล้ว");
  };

  const toggleGroup = (g: string) => setOpenGroups((prev) => ({ ...prev, [g]: !prev[g] }));

  return (
    <div className="p-4 max-w-3xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">เช็คลิสต์</h1>
        <div className="flex items-center">
          <SearchButton />
          <UploadButton />
          <PendingExpenseButton tripId={trip.id} />
          <DashboardButton tripId={trip.id} />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-muted text-sm">ยังไม่มีรายการเช็คลิสต์</p>
          <Button variant="primary" onClick={applyTemplate}>
            ใช้ template มาตรฐาน
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {GROUPS.map((group) => {
            const groupItems = items
              .filter((it) => it.group === group)
              .slice()
              .sort((a, b) => Number(a.done) - Number(b.done));
            const doneCount = groupItems.filter((it) => it.done).length;
            const open = openGroups[group] ?? true;

            return (
              <div key={group} className="rounded-2xl bg-surface shadow-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="w-full h-12 px-4 flex items-center justify-between cursor-pointer"
                >
                  <span className="font-medium">{group}</span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    {doneCount}/{groupItems.length}
                    <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown size={18} />
                    </motion.span>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2 flex flex-col">
                        {groupItems.map((item) => (
                          <motion.div
                            key={item.id}
                            layout
                            transition={{ type: "spring", duration: 0.3 }}
                            className="h-12 flex items-center gap-3 px-2 cursor-pointer"
                            onClick={() => toggleDone(item)}
                          >
                            <span onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={item.done} onChange={() => toggleDone(item)} aria-label={item.item} />
                            </span>
                            <span className={`text-sm flex-1 ${item.done ? "line-through text-muted" : ""}`}>
                              {item.item}
                            </span>
                          </motion.div>
                        ))}
                        <div className="flex items-center gap-2 px-2 pt-2">
                          <input
                            value={inputs[group] ?? ""}
                            onChange={(e) => setInputs((prev) => ({ ...prev, [group]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addItem(group);
                            }}
                            placeholder="เพิ่มรายการ"
                            className="flex-1 h-11 rounded-xl border border-muted/30 bg-bg px-3 text-sm"
                          />
                          <button
                            type="button"
                            aria-label="เพิ่มรายการ"
                            onClick={() => addItem(group)}
                            className="relative h-11 w-11 flex items-center justify-center rounded-xl bg-primary-soft text-primary cursor-pointer"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
