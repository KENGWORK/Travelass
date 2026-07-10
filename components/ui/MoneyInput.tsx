"use client";
import { useState } from "react";
import { convertToTHB, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { apiRate } from "@/lib/api";

export interface MoneyValue { amount: number; currency: string; fx_rate: number; amount_thb: number; }

export function MoneyInput({ value, onChange, tripCurrency }: { value: MoneyValue; onChange: (v: MoneyValue) => void; tripCurrency: string }) {
  const [editingRate, setEditingRate] = useState(false);

  const emit = (patch: Partial<MoneyValue>) => {
    const next = { ...value, ...patch };
    next.amount_thb = convertToTHB(next.amount, next.fx_rate);
    onChange(next);
  };

  const setCurrency = async (currency: string) => {
    if (currency === "THB") return emit({ currency, fx_rate: 1 });
    emit({ currency });
    try { const { rate } = await apiRate(currency); emit({ currency, fx_rate: rate }); } catch {}
  };

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
