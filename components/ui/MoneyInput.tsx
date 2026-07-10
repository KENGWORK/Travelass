"use client";
import { useEffect, useRef, useState } from "react";
import { convertToTHB, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { apiRate } from "@/lib/api";

export interface MoneyValue { amount: number; currency: string; fx_rate: number; amount_thb: number; }

export function MoneyInput({ value, onChange, tripCurrency }: { value: MoneyValue; onChange: (v: MoneyValue) => void; tripCurrency: string }) {
  const [editingRate, setEditingRate] = useState(false);
  const lastFetchedCurrency = useRef<string | null>(null);

  const emit = (patch: Partial<MoneyValue>) => {
    const next = { ...value, ...patch };
    next.amount_thb = convertToTHB(next.amount, next.fx_rate);
    onChange(next);
  };

  const setCurrency = (currency: string) => {
    if (currency === "THB") return emit({ currency, fx_rate: 1 });
    emit({ currency });
  };

  // Fetch the FX rate whenever a non-THB currency is showing and we haven't
  // fetched a rate for it yet. This covers both the case where the user
  // actively picks a currency from the dropdown AND the case where a
  // non-THB currency is already selected on mount (e.g. QuickExpenseSheet
  // seeding `currency: trip.trip_currency`), which never fires onChange.
  useEffect(() => {
    if (value.currency === "THB") {
      lastFetchedCurrency.current = null;
      return;
    }
    if (lastFetchedCurrency.current === value.currency) return;
    lastFetchedCurrency.current = value.currency;
    let cancelled = false;
    (async () => {
      try {
        const { rate } = await apiRate(value.currency);
        if (!cancelled) emit({ fx_rate: rate });
      } catch {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.currency]);

  return (
    <div>
      <div className="flex gap-2 items-center">
        <input inputMode="decimal" autoFocus className="money text-2xl flex-1 h-12 rounded-2xl border border-muted/30 bg-surface px-4"
          value={value.amount || ""} placeholder="0"
          onChange={(e) => emit({ amount: Number(e.target.value) || 0 })} />
        <select className="h-12 rounded-2xl border border-muted/30 bg-surface px-2 cursor-pointer"
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
