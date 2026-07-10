"use client";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MoneyInput, type MoneyValue } from "@/components/ui/MoneyInput";
import { PhotoPicker } from "@/components/PhotoPicker";
import { toast } from "@/components/ui/Toast";
import { apiCreate } from "@/lib/api";
import type { Trip, Expense, Category } from "@/lib/models/types";

const CATS: { name: Category; color: string }[] = [
  { name: "อาหาร", color: "var(--color-cat-food)" }, { name: "เดินทาง", color: "var(--color-cat-transport)" },
  { name: "ที่พัก", color: "var(--color-cat-lodging)" }, { name: "ช้อป", color: "var(--color-cat-shopping)" },
  { name: "ตั๋ว", color: "var(--color-cat-tickets)" }, { name: "อื่นๆ", color: "var(--color-cat-other)" },
];

export function QuickExpenseSheet({ trip, open, onClose, onSaved }: { trip: Trip; open: boolean; onClose: () => void; onSaved: () => void }) {
  const blank = (): MoneyValue => ({ amount: 0, currency: trip.trip_currency, fx_rate: 0, amount_thb: 0 });
  const [money, setMoney] = useState<MoneyValue>(blank);
  const [category, setCategory] = useState<Category>("อาหาร");
  const [payer, setPayer] = useState("เรา");
  const [description, setDescription] = useState("");
  const [slips, setSlips] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const isTHB = money.currency === "THB";
    const exp: Expense = { id: crypto.randomUUID(), trip_id: trip.id, datetime: new Date().toISOString(),
      category, description, amount: money.amount, currency: money.currency,
      fx_rate: isTHB ? 1 : money.fx_rate, amount_thb: isTHB ? money.amount : money.amount_thb,
      payer, slip_photo_ids: slips };
    try {
      await apiCreate("expenses", exp);
      toast(`บันทึกแล้ว ฿${exp.amount_thb.toLocaleString()}`);
      setMoney(blank()); setDescription(""); setSlips([]);
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="จดค่าใช้จ่าย">
      <div className="flex flex-col gap-4">
        <MoneyInput value={money} onChange={setMoney} tripCurrency={trip.trip_currency} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATS.map((c) => <Chip key={c.name} selected={category === c.name} color={c.color} onClick={() => setCategory(c.name)}>{c.name}</Chip>)}
        </div>
        <div className="flex gap-2">
          {["เรา", "แฟน"].map((p) => <Chip key={p} selected={payer === p} onClick={() => setPayer(p)}>{p}</Chip>)}
        </div>
        <input className="h-11 rounded-2xl border border-muted/30 bg-surface px-4" placeholder="โน๊ตสั้นๆ (ไม่บังคับ)"
          value={description} onChange={(e) => setDescription(e.target.value)} />
        <PhotoPicker tripName={trip.name} kind="slips" fileIds={slips} onChange={setSlips} />
        <Button variant="primary" full loading={saving} onClick={save} disabled={money.amount <= 0}>บันทึก</Button>
      </div>
    </BottomSheet>
  );
}
