"use client";
/* Hallmark · component: bottom-sheet form · genre: playful · mood: fast/fluid
 * redesign v3: payer becomes a required field, pulled out of the details
 * drawer into the primary flow — a colored-dot avatar row that echoes the
 * category dial's visual language (same dot-in-ring construction, same
 * selected-state ring treatment) instead of PayerChips' pill style, so the
 * "who paid" decision reads as the same kind of choice as "what category."
 * PayerChips itself stays untouched (still used by the other 3 forms);
 * this sheet fetches members locally instead.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Delete, Plus, Minus, ArrowLeftRight, Pencil, Wallet, Calculator, Users, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { PhotoPicker } from "@/components/PhotoPicker";
import { toast } from "@/components/ui/Toast";
import { apiCreate, apiList, apiRate } from "@/lib/api";
import { useTripData } from "@/lib/use-trip-data";
import { optimisticCreate } from "@/lib/optimistic";
import { convertToTHB, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { CATS } from "@/lib/categories";
import type { Trip, Expense, Category, Member, ExpenseSplit } from "@/lib/models/types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
const ceil2 = (n: number) => Math.ceil(n * 100) / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;

interface ItemRow { id: string; label: string; amount: string; name: string; }

const MODE_TABS = [
  { key: "expense" as const, label: "บันทึกรายจ่าย", Icon: Wallet, color: "var(--color-primary)" },
  { key: "calc" as const, label: "คิดเลขอย่างเดียว", Icon: Calculator, color: "var(--color-accent)" },
];

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
  const { expenses, setExpenses } = useTripData();
  const [mode, setMode] = useState<"expense" | "calc">("expense");
  const [digits, setDigits] = useState("");
  const [currency, setCurrency] = useState(trip.trip_currency);
  const [currencyPicking, setCurrencyPicking] = useState(false);
  const [fxRate, setFxRate] = useState(0);
  const [toCurrency, setToCurrency] = useState("THB");
  const [toCurrencyPicking, setToCurrencyPicking] = useState(false);
  const [toRate, setToRate] = useState(1);
  const [manualRate, setManualRate] = useState<number | null>(null);
  const [editingRate, setEditingRate] = useState(false);
  const toRateRef = useRef({ toCurrency, toRate });
  useEffect(() => {
    toRateRef.current = { toCurrency, toRate };
  });
  const [category, setCategory] = useState<Category>("อาหาร");
  const [members, setMembers] = useState<Member[]>([]);
  const [payer, setPayer] = useState("");
  const [payerCustom, setPayerCustom] = useState(false);
  const [description, setDescription] = useState("");
  const [slips, setSlips] = useState<string[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<"none" | "equal" | "itemized">("none");
  const [equalParticipants, setEqualParticipants] = useState<Set<string>>(new Set());
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const rateRef = useRef({ currency, fxRate });
  rateRef.current = { currency, fxRate };

  const isTHB = currency === "THB";
  const amount = parseFloat(digits) || 0;
  const amountTHB = isTHB ? amount : convertToTHB(amount, fxRate);
  const activeColor = CATS.find((c) => c.name === category)?.color ?? "var(--color-primary)";

  // Splits never store the payer's own share — it's always the remainder, so
  // it can't drift out of sync with amountTHB. See docs/superpowers/specs/
  // 2026-08-05-expense-splitting-design.md for the full split/settlement design.
  const itemsTotal = r2(itemRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0));
  const itemsOverBudget = splitMode === "itemized" && itemsTotal > amountTHB + 0.001;
  const computedSplits: ExpenseSplit[] =
    splitMode === "equal"
      ? (() => {
          const others = [...equalParticipants].filter((n) => n !== payer);
          if (others.length === 0) return [];
          const share = ceil2(amountTHB / (others.length + 1));
          return others.map((name) => ({ name, amount_thb: share }));
        })()
      : splitMode === "itemized"
        ? itemRows.filter((r) => r.name && parseFloat(r.amount) > 0).map((r) => ({ name: r.name, amount_thb: r2(parseFloat(r.amount)) }))
        : [];
  const payerOwnShare = computedSplits.length > 0 ? r2(amountTHB - computedSplits.reduce((s, sp) => s + sp.amount_thb, 0)) : amountTHB;

  // calc mode: from-currency -> THB -> to-currency, two rate legs so any
  // pair works (not just X -> THB like the expense-mode readout above).
  const fromRateTHB = currency === "THB" ? 1 : fxRate;
  const toRateTHB = toCurrency === "THB" ? 1 : toRate;
  const autoRate = toRateTHB > 0 ? fromRateTHB / toRateTHB : 0;
  const effectiveRate = manualRate ?? autoRate;
  const convertedAmount = Math.round(amount * effectiveRate * 100) / 100;

  // Most-used currency first: count this trip's past expenses per currency,
  // then stable-sort the base list by that count descending. Array.sort is
  // stable, so currencies tied at 0 uses keep the original fallback order
  // (trip currency, then THB, then the rest) instead of shuffling randomly.
  const currencyOptions = (() => {
    const counts = new Map<string, number>();
    for (const e of expenses) counts.set(e.currency, (counts.get(e.currency) ?? 0) + 1);
    const base = [...new Set([trip.trip_currency, "THB", ...SUPPORTED_CURRENCIES])];
    return base.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  })();

  useEffect(() => {
    let alive = true;
    const load = () => apiList<Member>("members", trip.id).then((m) => { if (alive) setMembers(m); });
    load();
    window.addEventListener("members-changed", load);
    return () => { alive = false; window.removeEventListener("members-changed", load); };
  }, [trip.id]);

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

  useEffect(() => {
    if (mode !== "calc" || toCurrency === "THB") return;
    let cancelled = false;
    (async () => {
      try {
        const { rate } = await apiRate(toCurrency);
        if (!cancelled && toRateRef.current.toCurrency === toCurrency) setToRate(rate);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [mode, toCurrency]);

  const press = (k: string) => {
    if (k === "⌫") return setDigits((d) => d.slice(0, -1));
    if (k === "." && (digits.includes(".") || digits === "")) return setDigits((d) => (d === "" ? "0." : d));
    if (digits.replace(".", "").length >= 9) return;
    setDigits((d) => (d === "0" ? k : d + k));
  };

  const reset = () => {
    setDigits(""); setCurrency(trip.trip_currency); setFxRate(0); setCategory("อาหาร");
    setPayer(""); setPayerCustom(false); setDescription(""); setSlips([]); setDetailsOpen(false); setCurrencyPicking(false);
    setMode("expense"); setToCurrency("THB"); setToRate(1); setManualRate(null); setEditingRate(false); setToCurrencyPicking(false);
    setSplitOpen(false); setSplitMode("none"); setEqualParticipants(new Set()); setItemRows([]);
    onClose();
  };

  const swapCalcCurrencies = () => {
    const prevCurrency = currency;
    const prevFxRate = fxRate;
    setCurrency(toCurrency);
    setFxRate(toRate);
    setToCurrency(prevCurrency);
    setToRate(prevFxRate);
    setManualRate(null);
  };

  const knownPayers: { name: string; color: string }[] = members.length
    ? members.map((m) => ({ name: m.name, color: m.color }))
    : [{ name: "ฉัน", color: "var(--color-primary)" }];

  const canSave = amount > 0 && payer.trim() !== "" && !itemsOverBudget;

  const save = () => {
    if (!canSave) return;
    const exp: Expense = {
      id: crypto.randomUUID(), trip_id: trip.id, datetime: new Date().toISOString(),
      category, description, amount, currency,
      fx_rate: isTHB ? 1 : fxRate, amount_thb: amountTHB,
      payer, slip_photo_ids: slips, splits: computedSplits,
    };
    optimisticCreate(setExpenses, exp, () => apiCreate("expenses", exp));
    toast(`บันทึกแล้ว ฿${exp.amount_thb.toLocaleString()}`);
    reset();
  };

  return (
    <BottomSheet open={open} onClose={reset} title="จดค่าใช้จ่าย">
      <div className="flex flex-col gap-4">
        {/* Mode toggle — same sheet, same FAB, two purposes: log a real
            expense (writes to Sheets) or just convert a number (never
            writes anything, resets on close). Each side keeps its own hue
            (teal wallet / coral converter) whether active or not, and the
            active pill is solid-filled with a sliding highlight — so which
            mode you're in reads from color + icon alone, not just label
            text position. */}
        <div className="relative flex h-14 rounded-2xl bg-muted/10 p-1 gap-1">
          {MODE_TABS.map((tab) => {
            const active = mode === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMode(tab.key)}
                aria-pressed={active}
                className="press relative flex-1 rounded-xl cursor-pointer overflow-hidden"
              >
                {active && (
                  <motion.span
                    layoutId="expense-mode-fill"
                    className="absolute inset-0 rounded-xl"
                    style={{ backgroundColor: tab.color }}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span
                  className="relative z-10 flex flex-col items-center justify-center gap-0.5 h-full"
                  style={{ color: active ? "white" : tab.color }}
                >
                  <tab.Icon size={18} strokeWidth={2.25} />
                  <span className="text-xs font-semibold">{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Readout — the number is the whole reason this sheet exists.
            Tinted by category so the color decision reads as "painting"
            the receipt, not a separate form field. */}
        {mode === "expense" && (
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
        )}

        <AnimatePresence initial={false}>
          {mode === "expense" && currencyPicking && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
            >
              <div className="flex gap-2 overflow-x-auto pb-1">
                {currencyOptions.map((c) => (
                  <button key={c} type="button"
                    onClick={() => { setCurrency(c); setFxRate(c === "THB" ? 1 : 0); setCurrencyPicking(false); setManualRate(null); }}
                    className={`press h-9 px-4 rounded-full text-sm shrink-0 cursor-pointer ${c === currency ? "bg-primary text-white" : "bg-muted/10 text-muted"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calc mode — the answer is the hero: solid accent card on top,
            everything white-on-accent. The swap button straddles the seam
            between it and the (demoted, tinted-not-solid) input card below,
            reading as the hinge that flips one into the other. Input's own
            currency picker lives with the input; the result's with the
            result — no field appears twice. */}
        {mode === "calc" && (
          <div className="flex flex-col">
            <div
              className="rounded-3xl px-5 pt-6 pb-8 flex flex-col items-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 75%, black)" }}
            >
              <button
                type="button"
                onClick={() => setToCurrencyPicking((v) => !v)}
                className="press h-7 px-3 rounded-full bg-white/20 text-xs font-semibold text-white cursor-pointer mb-2"
              >
                {toCurrency} ▾
              </button>
              <p className="money text-6xl text-white leading-none tabular-nums">
                ≈ {convertedAmount.toLocaleString()}
              </p>
              {editingRate ? (
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  className="field h-9 w-32 text-center text-sm mt-2"
                  value={manualRate ?? effectiveRate}
                  onChange={(e) => setManualRate(parseFloat(e.target.value) || 0)}
                  onBlur={() => setEditingRate(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingRate(true)}
                  className="press inline-flex items-center gap-1 text-xs text-white/80 mt-2 cursor-pointer"
                >
                  rate {effectiveRate || 0} <Pencil size={11} />
                </button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {toCurrencyPicking && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
                >
                  <div className="flex gap-2 overflow-x-auto py-2 justify-center">
                    {currencyOptions.map((c) => (
                      <button key={c} type="button"
                        onClick={() => { setToCurrency(c); setToRate(c === "THB" ? 1 : 0); setToCurrencyPicking(false); setManualRate(null); }}
                        className={`press h-9 px-4 rounded-full text-sm shrink-0 cursor-pointer ${c === toCurrency ? "bg-accent text-white" : "bg-muted/10 text-muted"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-center -my-4 relative z-10">
              <button
                type="button"
                onClick={swapCalcCurrencies}
                aria-label="สลับสกุลเงิน"
                className="press h-10 w-10 rounded-full text-white ring-4 flex items-center justify-center cursor-pointer shadow-card"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-accent) 75%, black)",
                  ["--tw-ring-color" as string]: "var(--color-surface)",
                }}
              >
                <ArrowLeftRight size={18} />
              </button>
            </div>

            <div
              className="rounded-3xl px-5 pt-8 pb-4 flex flex-col items-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))" }}
            >
              <button
                type="button"
                onClick={() => setCurrencyPicking((v) => !v)}
                className="press h-7 px-3 rounded-full bg-surface text-xs font-semibold text-muted cursor-pointer mb-2"
              >
                {currency} ▾
              </button>
              <div className="money text-3xl text-muted leading-none tabular-nums">
                {digits === "" ? <span className="text-muted/40">0</span> : digits}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {currencyPicking && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
                >
                  <div className="flex gap-2 overflow-x-auto pt-2 justify-center">
                    {currencyOptions.map((c) => (
                      <button key={c} type="button"
                        onClick={() => { setCurrency(c); setFxRate(c === "THB" ? 1 : 0); setCurrencyPicking(false); setManualRate(null); }}
                        className={`press h-9 px-4 rounded-full text-sm shrink-0 cursor-pointer ${c === currency ? "bg-accent text-white" : "bg-muted/10 text-muted"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {mode === "expense" && (
          <>
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

            {/* Payer — required. Same dot-in-ring construction as the category
                dial above (colored circle, ring on select) so "who paid" reads
                as the same kind of decision, not a separate bolted-on field. */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted">ใครจ่าย</span>
                <span className="text-xs text-danger">*</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {knownPayers.map((p) => {
                  const selected = !payerCustom && payer === p.name;
                  return (
                    <button key={p.name} type="button"
                      onClick={() => { setPayerCustom(false); setPayer(p.name); }}
                      className="press flex flex-col items-center gap-1 shrink-0 cursor-pointer">
                      <span
                        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold"
                        style={{
                          backgroundColor: selected ? p.color : `color-mix(in srgb, ${p.color} 18%, transparent)`,
                          color: selected ? "white" : p.color,
                          boxShadow: selected ? `0 0 0 3px color-mix(in srgb, ${p.color} 30%, transparent)` : undefined,
                        }}
                      >
                        {p.name.slice(0, 1)}
                      </span>
                      <span className={`text-xs ${selected ? "font-semibold text-text" : "text-muted"}`}>{p.name}</span>
                    </button>
                  );
                })}
                <button type="button" onClick={() => { setPayerCustom(true); setPayer(""); }}
                  className="press flex flex-col items-center gap-1 shrink-0 cursor-pointer">
                  <span
                    className="h-10 w-10 rounded-full flex items-center justify-center text-muted"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--color-muted) 14%, transparent)",
                      boxShadow: payerCustom ? "0 0 0 3px color-mix(in srgb, var(--color-muted) 30%, transparent)" : undefined,
                    }}
                  >
                    <Plus size={16} />
                  </span>
                  <span className={`text-xs ${payerCustom ? "font-semibold text-text" : "text-muted"}`}>อื่นๆ</span>
                </button>
              </div>
              {payerCustom && (
                <input autoFocus className="field h-11" placeholder="ชื่อคนจ่าย"
                  value={payer} onChange={(e) => setPayer(e.target.value)} />
              )}
            </div>

            {/* Split — off by default (splits: []), exactly today's behavior.
                Opening it doesn't touch payer (who fronted the cash); it only
                decides who owes payer back, settled once at trip's end (see
                the money page's สรุปหนี้ tab). */}
            <button
              type="button"
              onClick={() => setSplitOpen((v) => !v)}
              className="press inline-flex items-center gap-1.5 self-start h-9 px-3 rounded-full border cursor-pointer text-sm font-medium"
              style={
                splitMode !== "none"
                  ? { backgroundColor: "color-mix(in srgb, var(--color-accent) 14%, transparent)", borderColor: "color-mix(in srgb, var(--color-accent) 35%, transparent)", color: "var(--color-accent)" }
                  : { borderColor: "color-mix(in srgb, var(--color-muted) 30%, transparent)", color: "var(--color-muted)" }
              }
            >
              <Users size={14} />
              หารเงิน
              {computedSplits.length > 0 && ` (${computedSplits.length})`}
            </button>

            <AnimatePresence initial={false}>
              {splitOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
                >
                  <div className="flex flex-col gap-3 rounded-2xl bg-muted/5 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 rounded-full bg-muted/10 p-0.5 flex-1">
                        {(["equal", "itemized"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSplitMode(m)}
                            className={`press flex-1 rounded-full text-xs font-semibold cursor-pointer ${splitMode === m ? "bg-accent text-white" : "text-muted"}`}
                          >
                            {m === "equal" ? "หารเท่า" : "หารตามรายการ"}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="ปิดการหารเงิน"
                        onClick={() => { setSplitOpen(false); setSplitMode("none"); setEqualParticipants(new Set()); setItemRows([]); }}
                        className="press h-9 w-9 rounded-full flex items-center justify-center text-muted cursor-pointer shrink-0"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {splitMode === "equal" && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 flex-wrap">
                          {knownPayers.filter((p) => p.name !== payer).map((p) => {
                            const selected = equalParticipants.has(p.name);
                            return (
                              <button
                                key={p.name}
                                type="button"
                                onClick={() =>
                                  setEqualParticipants((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(p.name)) next.delete(p.name);
                                    else next.add(p.name);
                                    return next;
                                  })
                                }
                                className="press h-9 px-3 rounded-full text-sm font-medium cursor-pointer"
                                style={{
                                  backgroundColor: selected ? p.color : `color-mix(in srgb, ${p.color} 16%, transparent)`,
                                  color: selected ? "white" : p.color,
                                }}
                              >
                                {p.name}
                              </button>
                            );
                          })}
                        </div>
                        {computedSplits.length > 0 && (
                          <div className="flex flex-col gap-1 text-xs text-muted">
                            {computedSplits.map((s) => (
                              <p key={s.name}>{s.name} เป็นหนี้ {payer || "คนจ่าย"} ฿{s.amount_thb.toLocaleString()}</p>
                            ))}
                            <p>{payer || "คนจ่าย"} เอง ฿{payerOwnShare.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {splitMode === "itemized" && (
                      <div className="flex flex-col gap-2">
                        {itemRows.map((row) => (
                          <div key={row.id} className="flex items-center gap-1.5">
                            <input
                              className="field h-9 min-w-0 flex-1 text-sm"
                              placeholder="ชื่อของ"
                              value={row.label}
                              onChange={(e) => setItemRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r)))}
                            />
                            <input
                              className="field h-9 shrink-0 text-sm text-right"
                              style={{ width: "5rem" }}
                              placeholder="0"
                              inputMode="decimal"
                              value={row.amount}
                              onChange={(e) => setItemRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, amount: e.target.value } : r)))}
                            />
                            <select
                              className="field h-9 shrink-0 text-sm"
                              style={{ width: "5rem" }}
                              value={row.name}
                              onChange={(e) => setItemRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))}
                            >
                              <option value="">ของใคร</option>
                              {knownPayers.filter((p) => p.name !== payer).map((p) => (
                                <option key={p.name} value={p.name}>{p.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              aria-label="ลบรายการ"
                              onClick={() => setItemRows((rows) => rows.filter((r) => r.id !== row.id))}
                              className="press h-9 w-9 flex items-center justify-center text-muted cursor-pointer shrink-0"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setItemRows((rows) => [...rows, { id: crypto.randomUUID(), label: "", amount: "", name: "" }])}
                          className="press h-9 rounded-xl border border-dashed text-muted text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Plus size={14} /> เพิ่มรายการ
                        </button>
                        <div className="flex justify-between text-xs text-muted">
                          <span>รวมรายการ ฿{itemsTotal.toLocaleString()}</span>
                          <span>{payer || "คนจ่าย"} เอง ฿{payerOwnShare.toLocaleString()}</span>
                        </div>
                        {itemsOverBudget && (
                          <p className="text-xs text-danger font-medium">ยอดรวมรายการเกินยอดที่พิมพ์ไว้ (฿{amountTHB.toLocaleString()})</p>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Keypad — replaces the native number input + on-screen keyboard,
            which used to cover half the sheet on a phone. */}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => <Key key={k} label={k} onPress={() => press(k)} />)}
        </div>

        {mode === "expense" && (
          <>
            <button type="button" onClick={() => setDetailsOpen((v) => !v)}
              className="press inline-flex items-center gap-1.5 self-start text-sm text-muted cursor-pointer">
              {detailsOpen ? <Minus size={14} /> : <Plus size={14} />}
              โน้ต / รูป (ไม่บังคับ)
            </button>

            <AnimatePresence initial={false}>
              {detailsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
                >
                  <div className="flex flex-col gap-3 pt-1">
                    <input className="field h-11" placeholder="โน๊ตสั้นๆ"
                      value={description} onChange={(e) => setDescription(e.target.value)} />
                    <PhotoPicker tripName={trip.name} kind="slips" fileIds={slips} onChange={setSlips} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button variant="primary" full onClick={save} disabled={!canSave}>
              {amount > 0 ? `บันทึก ฿${amountTHB.toLocaleString()}` : "บันทึก"}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
