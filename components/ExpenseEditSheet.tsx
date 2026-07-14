"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MoneyInput, type MoneyValue } from "@/components/ui/MoneyInput";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PayerChips } from "@/components/PayerChips";
import { toast } from "@/components/ui/Toast";
import { apiUpdate, apiDelete } from "@/lib/api";
import { notifyTripDataChanged } from "@/lib/use-trip-data";
import { CATS } from "@/lib/categories";
import type { Trip, Expense, Category } from "@/lib/models/types";

export function ExpenseEditSheet({
  trip,
  expense,
  open,
  onClose,
  onSaved,
}: {
  trip: Trip;
  expense: Expense | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [money, setMoney] = useState<MoneyValue>({ amount: 0, currency: trip.trip_currency, fx_rate: 1, amount_thb: 0 });
  const [category, setCategory] = useState<Category>("อาหาร");
  const [payer, setPayer] = useState("เรา");
  const [description, setDescription] = useState("");
  const [slips, setSlips] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open && expense) {
      setMoney({ amount: expense.amount, currency: expense.currency, fx_rate: expense.fx_rate, amount_thb: expense.amount_thb });
      setCategory(expense.category);
      setPayer(expense.payer);
      setDescription(expense.description);
      setSlips(expense.slip_photo_ids);
    }
  }, [open, expense]);

  const save = async () => {
    if (!expense) return;
    setSaving(true);
    const isTHB = money.currency === "THB";
    const patch: Expense = {
      ...expense,
      category,
      description,
      amount: money.amount,
      currency: money.currency,
      fx_rate: isTHB ? 1 : money.fx_rate,
      amount_thb: isTHB ? money.amount : money.amount_thb,
      payer,
      slip_photo_ids: slips,
    };
    try {
      await apiUpdate<Expense>("expenses", expense.id, patch);
      notifyTripDataChanged();
      onSaved();
      onClose();
      toast(`บันทึกแล้ว ฿${patch.amount_thb.toLocaleString()}`);
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!expense) return;
    setDeleting(true);
    try {
      await apiDelete("expenses", expense.id);
      notifyTripDataChanged();
      onSaved();
      onClose();
      toast("ลบแล้ว");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="แก้ไขค่าใช้จ่าย">
      <div className="flex flex-col gap-4">
        <MoneyInput value={money} onChange={setMoney} tripCurrency={trip.trip_currency} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATS.map((c) => (
            <Chip key={c.name} selected={category === c.name} color={c.color} onClick={() => setCategory(c.name)}>
              {c.name}
            </Chip>
          ))}
        </div>
        <PayerChips tripId={trip.id} value={payer} onChange={setPayer} />
        <input
          className="field"
          placeholder="โน๊ตสั้นๆ (ไม่บังคับ)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <PhotoPicker tripName={trip.name} kind="slips" fileIds={slips} onChange={setSlips} />
        <div className="flex gap-2 mt-2">
          <Button variant="secondary" className="text-danger" loading={deleting} onClick={del}>
            ลบ
          </Button>
          <Button variant="primary" full loading={saving} onClick={save} disabled={money.amount <= 0}>
            บันทึก
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
