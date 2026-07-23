"use client";
/* Hallmark · component: bottom-sheet form · genre: playful · mood: fast/fluid
 * redesign: hero amount panel tinted by category, secondary fields grouped
 * tighter, note+photo folded behind a disclosure to keep the common path fast
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MoneyInput, type MoneyValue } from "@/components/ui/MoneyInput";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PayerChips } from "@/components/PayerChips";
import { toast } from "@/components/ui/Toast";
import { apiCreate } from "@/lib/api";
import { useTripData } from "@/lib/use-trip-data";
import { optimisticCreate } from "@/lib/optimistic";
import { CATS } from "@/lib/categories";
import type { Trip, Expense, Category } from "@/lib/models/types";

export function QuickExpenseSheet({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const { setExpenses } = useTripData();
  const blank = (): MoneyValue => ({ amount: 0, currency: trip.trip_currency, fx_rate: 0, amount_thb: 0 });
  const [money, setMoney] = useState<MoneyValue>(blank);
  const [category, setCategory] = useState<Category>("อาหาร");
  const [payer, setPayer] = useState("ฉัน");
  const [description, setDescription] = useState("");
  const [slips, setSlips] = useState<string[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const activeColor = CATS.find((c) => c.name === category)?.color ?? "var(--color-primary)";

  const save = () => {
    const isTHB = money.currency === "THB";
    const exp: Expense = { id: crypto.randomUUID(), trip_id: trip.id, datetime: new Date().toISOString(),
      category, description, amount: money.amount, currency: money.currency,
      fx_rate: isTHB ? 1 : money.fx_rate, amount_thb: isTHB ? money.amount : money.amount_thb,
      payer, slip_photo_ids: slips };

    optimisticCreate(setExpenses, exp, () => apiCreate("expenses", exp));
    toast(`บันทึกแล้ว ฿${exp.amount_thb.toLocaleString()}`);
    setMoney(blank()); setDescription(""); setSlips([]); setDetailsOpen(false);
    onClose();
  };

  const reset = () => {
    setMoney(blank()); setCategory("อาหาร"); setPayer("ฉัน"); setDescription(""); setSlips([]); setDetailsOpen(false);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={reset} title="จดค่าใช้จ่าย">
      <div className="flex flex-col gap-5">
        {/* Hero — the number is the whole point of this sheet. Tinted by the
            active category so picking a category reads as "coloring in" the
            amount you just typed, not a separate decision. */}
        <div
          className="rounded-3xl p-4 transition-colors duration-200"
          style={{ backgroundColor: `color-mix(in srgb, ${activeColor} 14%, var(--color-surface))` }}
        >
          <MoneyInput value={money} onChange={setMoney} tripCurrency={trip.trip_currency} size="lg" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {CATS.map((c) => (
            <Chip key={c.name} selected={category === c.name} color={c.color} onClick={() => setCategory(c.name)}>
              {c.name}
            </Chip>
          ))}
        </div>

        <PayerChips tripId={trip.id} value={payer} onChange={setPayer} />

        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="press inline-flex items-center gap-1.5 self-start text-sm text-muted cursor-pointer"
        >
          {detailsOpen ? <Minus size={14} /> : <Plus size={14} />}
          รายละเอียดเพิ่มเติม (ไม่บังคับ)
        </button>

        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 pt-1">
                <input className="field h-11" placeholder="โน๊ตสั้นๆ"
                  value={description} onChange={(e) => setDescription(e.target.value)} />
                <PhotoPicker tripName={trip.name} kind="slips" fileIds={slips} onChange={setSlips} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button variant="primary" full onClick={save} disabled={money.amount <= 0}>
          {money.amount > 0 ? `บันทึก ฿${money.amount_thb.toLocaleString()}` : "บันทึก"}
        </Button>
      </div>
    </BottomSheet>
  );
}
