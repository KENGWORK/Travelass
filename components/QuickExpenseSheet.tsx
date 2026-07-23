"use client";
/* Hallmark · component: bottom-sheet form · genre: playful · mood: fast/fluid
 * redesign v2: full structural rebuild — calculator-dial macrostructure
 * (giant tap-to-type readout + numeric keypad) replaces the stacked-field
 * form. Category tints the readout; currency is a tap-to-cycle chip, not a
 * <select>; payer/note/photo fold into a details drawer below the fold.
 * MoneyInput/Chip untouched — this sheet no longer uses them for the
 * amount, so the other three MoneyInput call sites are unaffected.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Delete, Plus, Minus } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PayerChips } from "@/components/PayerChips";
import { toast } from "@/components/ui/Toast";
import { apiCreate, apiRate } from "@/lib/api";
import { useTripData } from "@/lib/use-trip-data";
import { optimisticCreate } from "@/lib/optimistic";
import { convertToTHB, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { CATS } from "@/lib/categories";
import type { Trip, Expense, Category } from "@/lib/models/types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

function Key({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92, backgroundColor: "var(--color-primary-soft)" }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      onClick={onPress}
      className="h-14 rounded-2xl bg-surface shadow-card text-xl font-medium flex items-center justify-center cursor-pointer"
    >
      {label === "⌫" ? <Delete size={20} /> : label}
    </motion.button>
  );
}

export function QuickExpenseSheet({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const { setExpenses } = useTripData();
  const [digits, setDigits] = useState("");
  const [currency, setCurrency] = useState(trip.trip_currency);
  const [currencyPicking, setCurrencyPicking] = useState(false);
  const [fxRate, setFxRate] = useState(0);
  const [category, setCategory] = useState<Category>("อาหาร");
  const [payer, setPayer] = useState("ฉัน");
  const [description, setDescription] = useState("");
  const [slips, setSlips] = useState<string[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const rateRef = useRef({ currency, fxRate });
  rateRef.current = { currency, fxRate };

  const isTHB = currency === "THB";
  const amount = parseFloat(digits) || 0;
  const amountTHB = isTHB ? amount : convertToTHB(amount, fxRate);
  const activeColor = CATS.find((c) => c.name === category)?.color ?? "var(--color-primary)";

  // Same auto-fetch shape as MoneyInput's, kept local since this sheet no
  // longer renders MoneyInput at all.
  useEffect(() => {
    if (isTHB || fxRate > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { rate } = await apiRate(currency);
        if (!cancelled && rateRef.current.currency === currency) setFxRate(rate);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [currency, fxRate, isTHB]);

  const press = (k: string) => {
    if (k === "⌫") return setDigits((d) => d.slice(0, -1));
    if (k === "." && (digits.includes(".") || digits === "")) return setDigits((d) => (d === "" ? "0." : d));
    if (digits.replace(".", "").length >= 9) return;
    setDigits((d) => (d === "0" ? k : d + k));
  };

  const reset = () => {
    setDigits(""); setCurrency(trip.trip_currency); setFxRate(0); setCategory("อาหาร");
    setPayer("ฉัน"); setDescription(""); setSlips([]); setDetailsOpen(false); setCurrencyPicking(false);
    onClose();
  };

  const save = () => {
    const exp: Expense = {
      id: crypto.randomUUID(), trip_id: trip.id, datetime: new Date().toISOString(),
      category, description, amount, currency,
      fx_rate: isTHB ? 1 : fxRate, amount_thb: amountTHB,
      payer, slip_photo_ids: slips,
    };
    optimisticCreate(setExpenses, exp, () => apiCreate("expenses", exp));
    toast(`บันทึกแล้ว ฿${exp.amount_thb.toLocaleString()}`);
    reset();
  };

  return (
    <BottomSheet open={open} onClose={reset} title="จดค่าใช้จ่าย">
      <div className="flex flex-col gap-4">
        {/* Readout — the number is the whole reason this sheet exists.
            Tinted by category so the color decision reads as "painting"
            the receipt, not a separate form field. */}
        <div
          className="rounded-3xl px-5 py-6 flex flex-col items-center transition-colors duration-200"
          style={{ backgroundColor: `color-mix(in srgb, ${activeColor} 14%, var(--color-surface))` }}
        >
          <button
            type="button"
            onClick={() => setCurrencyPicking((v) => !v)}
            className="press h-7 px-3 rounded-full bg-surface text-xs font-semibold text-muted cursor-pointer mb-2"
          >
            {currency} ▾
          </button>
          <div className="money text-6xl leading-none tabular-nums">
            {digits === "" ? <span className="text-muted/40">0</span> : digits}
          </div>
          {!isTHB && (
            <p className="text-sm text-muted mt-2">
              ≈ <span className="money">฿{amountTHB.toLocaleString()}</span>
              {fxRate > 0 && <> · rate {fxRate}</>}
            </p>
          )}
        </div>

        <AnimatePresence initial={false}>
          {currencyPicking && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
            >
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[...new Set([trip.trip_currency, "THB", ...SUPPORTED_CURRENCIES])].map((c) => (
                  <button key={c} type="button"
                    onClick={() => { setCurrency(c); setFxRate(c === "THB" ? 1 : 0); setCurrencyPicking(false); }}
                    className={`press h-9 px-4 rounded-full text-sm shrink-0 cursor-pointer ${c === currency ? "bg-primary text-white" : "bg-muted/10 text-muted"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category dial — colored dots, not text chips, so the row reads
            at a glance instead of being read word by word. */}
        <div className="flex gap-3 overflow-x-auto pb-1 justify-center">
          {CATS.map((c) => (
            <button key={c.name} type="button" onClick={() => setCategory(c.name)}
              className="press flex flex-col items-center gap-1 shrink-0 cursor-pointer">
              <span
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: category === c.name ? c.color : `color-mix(in srgb, ${c.color} 18%, transparent)`,
                  boxShadow: category === c.name ? `0 0 0 3px color-mix(in srgb, ${c.color} 30%, transparent)` : undefined,
                }}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category === c.name ? "white" : c.color }} />
              </span>
              <span className={`text-xs ${category === c.name ? "font-semibold text-text" : "text-muted"}`}>{c.name}</span>
            </button>
          ))}
        </div>

        {/* Keypad — replaces the native number input + on-screen keyboard,
            which used to cover half the sheet on a phone. */}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => <Key key={k} label={k} onPress={() => press(k)} />)}
        </div>

        <button type="button" onClick={() => setDetailsOpen((v) => !v)}
          className="press inline-flex items-center gap-1.5 self-start text-sm text-muted cursor-pointer">
          {detailsOpen ? <Minus size={14} /> : <Plus size={14} />}
          ใคร / โน้ต / รูป (ไม่บังคับ)
        </button>

        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 pt-1">
                <PayerChips tripId={trip.id} value={payer} onChange={setPayer} />
                <input className="field h-11" placeholder="โน๊ตสั้นๆ"
                  value={description} onChange={(e) => setDescription(e.target.value)} />
                <PhotoPicker tripName={trip.name} kind="slips" fileIds={slips} onChange={setSlips} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button variant="primary" full onClick={save} disabled={amount <= 0}>
          {amount > 0 ? `บันทึก ฿${amountTHB.toLocaleString()}` : "บันทึก"}
        </Button>
      </div>
    </BottomSheet>
  );
}
