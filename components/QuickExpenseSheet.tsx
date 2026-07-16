"use client";
import { useState } from "react";
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

  const save = () => {
    const isTHB = money.currency === "THB";
    const exp: Expense = { id: crypto.randomUUID(), trip_id: trip.id, datetime: new Date().toISOString(),
      category, description, amount: money.amount, currency: money.currency,
      fx_rate: isTHB ? 1 : money.fx_rate, amount_thb: isTHB ? money.amount : money.amount_thb,
      payer, slip_photo_ids: slips };

    optimisticCreate(setExpenses, exp, () => apiCreate("expenses", exp));
    toast(`บันทึกแล้ว ฿${exp.amount_thb.toLocaleString()}`);
    setMoney(blank()); setDescription(""); setSlips([]);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="จดค่าใช้จ่าย">
      <div className="flex flex-col gap-4">
        <MoneyInput value={money} onChange={setMoney} tripCurrency={trip.trip_currency} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATS.map((c) => <Chip key={c.name} selected={category === c.name} color={c.color} onClick={() => setCategory(c.name)}>{c.name}</Chip>)}
        </div>
        <PayerChips tripId={trip.id} value={payer} onChange={setPayer} />
        <input className="field h-11" placeholder="โน๊ตสั้นๆ (ไม่บังคับ)"
          value={description} onChange={(e) => setDescription(e.target.value)} />
        <PhotoPicker tripName={trip.name} kind="slips" fileIds={slips} onChange={setSlips} />
        <Button variant="primary" full onClick={save} disabled={money.amount <= 0}>บันทึก</Button>
      </div>
    </BottomSheet>
  );
}
