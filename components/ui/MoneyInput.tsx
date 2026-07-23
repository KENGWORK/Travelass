"use client";
import { useEffect, useRef, useState } from "react";
import { convertToTHB, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { apiRate } from "@/lib/api";

export interface MoneyValue { amount: number; currency: string; fx_rate: number; amount_thb: number; }

export function MoneyInput({ value, onChange, tripCurrency, size = "md" }: { value: MoneyValue; onChange: (v: MoneyValue) => void; tripCurrency: string; size?: "md" | "lg" }) {
  const [editingRate, setEditingRate] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const emit = (patch: Partial<MoneyValue>) => {
    const next = { ...value, ...patch };
    next.amount_thb = convertToTHB(next.amount, next.fx_rate);
    onChange(next);
  };

  const setCurrency = (currency: string) => {
    if (currency === "THB") return emit({ currency, fx_rate: 1 });
    // Switching to a different non-THB currency invalidates the old rate;
    // reset to the placeholder (0) so the fetch effect below picks it up.
    // Re-selecting the same currency keeps the rate already fetched/saved.
    if (currency === value.currency) return emit({ currency });
    emit({ currency, fx_rate: 0 });
  };

  // Fetch the FX rate whenever a non-THB currency is showing and the value
  // still carries the placeholder rate (0), meaning no real rate has been
  // fetched or loaded for it yet. A genuine historical/fetched rate is never
  // exactly 0, so this never re-fetches for an already-correct saved rate
  // (e.g. when editing an existing booking/expense).
  useEffect(() => {
    if (value.currency === "THB" || value.fx_rate > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { rate } = await apiRate(value.currency);
        if (cancelled) return;
        const current = valueRef.current;
        onChange({
          ...current,
          fx_rate: rate,
          amount_thb: convertToTHB(current.amount, rate),
        });
      } catch {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.currency, value.fx_rate]);

  return (
    <div>
      <div className="flex gap-2 items-center">
        <input inputMode="decimal" autoFocus
          className={`money flex-1 rounded-2xl border border-muted/30 bg-surface px-4 ${size === "lg" ? "text-5xl h-20" : "text-2xl h-12"}`}
          value={value.amount || ""} placeholder="0"
          onChange={(e) => emit({ amount: Number(e.target.value) || 0 })} />
        <select className={`rounded-2xl border border-muted/30 bg-surface px-2 cursor-pointer ${size === "lg" ? "h-20 text-lg" : "h-12"}`}
          value={value.currency} onChange={(e) => setCurrency(e.target.value)}>
          {[...new Set([tripCurrency, "THB", ...SUPPORTED_CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {value.currency !== "THB" && (
        <p className="text-sm text-muted mt-1">
          ≈ <span className="money">฿{value.amount_thb.toLocaleString()}</span> · rate{" "}
          {editingRate ? (
            <input autoFocus inputMode="decimal" className="w-20 border-b border-primary bg-transparent"
              defaultValue={value.fx_rate}
              onBlur={(e) => { emit({ fx_rate: Number(e.target.value) || value.fx_rate }); setEditingRate(false); }} />
          ) : (
            <button className="underline cursor-pointer" onClick={() => setEditingRate(true)}>{value.fx_rate} ✎</button>
          )}
        </p>
      )}
    </div>
  );
}
