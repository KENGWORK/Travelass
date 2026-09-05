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
import { useTripData } from "@/lib/use-trip-data";
import { optimisticUpdate, optimisticDelete } from "@/lib/optimistic";
import { CATS } from "@/lib/categories";
import { reconcileSplitsOnEdit } from "@/lib/settle";
import type { Trip, Expense, Category } from "@/lib/models/types";

export function ExpenseEditSheet({
  trip,
  expense,
  open,
  onClose,
}: {
  trip: Trip;
  expense: Expense | null;
  open: boolean;
  onClose: () => void;
}) {
  const { setExpenses } = useTripData();
  const [money, setMoney] = useState<MoneyValue>({ amount: 0, currency: trip.trip_currency, fx_rate: 1, amount_thb: 0 });
  const [category, setCategory] = useState<Category>("อาหาร");
  const [payer, setPayer] = useState("เรา");
  const [description, setDescription] = useState("");
  const [slips, setSlips] = useState<string[]>([]);

  useEffect(() => {
    if (open && expense) {
      setMoney({ amount: expense.amount, currency: expense.currency, fx_rate: expense.fx_rate, amount_thb: expense.amount_thb });
      setCategory(expense.category);
      setPayer(expense.payer);
      setDescription(expense.description);
      setSlips(expense.slip_photo_ids);
    }
  }, [open, expense]);

  const save = () => {
    if (!expense) return;
    const isTHB = money.currency === "THB";
    const newAmountThb = isTHB ? money.amount : money.amount_thb;
    const payerChanged = payer !== expense.payer;
    const { splits, blocked } = reconcileSplitsOnEdit(expense.splits, expense.amount_thb, newAmountThb, payerChanged);
    if (blocked) {
      toast("แก้ไขไม่ได้ เพราะมีการหารเงินที่จ่ายแล้วบางส่วน — ไปดูที่หน้าสรุปหนี้ก่อน", "error");
      return;
    }
    const patch: Expense = {
      ...expense,
      category,
      description,
      amount: money.amount,
      currency: money.currency,
      fx_rate: isTHB ? 1 : money.fx_rate,
      amount_thb: newAmountThb,
      payer,
      slip_photo_ids: slips,
      splits,
      pending: false,
    };
    optimisticUpdate(setExpenses, expense.id, patch, () => apiUpdate<Expense>("expenses", expense.id, patch));
    toast(
      payerChanged && expense.splits.length > 0
        ? "บันทึกแล้ว — ล้างการหารเงินเดิมเพราะเปลี่ยนคนจ่าย ตั้งหารใหม่ได้ที่ปุ่มจดค่าใช้จ่าย"
        : `บันทึกแล้ว ฿${patch.amount_thb.toLocaleString()}`,
    );
    onClose();
  };

  const del = () => {
    if (!expense) return;
    optimisticDelete(setExpenses, expense.id, () => apiDelete("expenses", expense.id));
    toast("ลบแล้ว");
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={expense?.pending ? "เพิ่มรายละเอียดค่าใช้จ่าย" : "แก้ไขค่าใช้จ่าย"}>
      <div className="flex flex-col gap-4">
        {expense?.pending && (
          <p className="text-xs text-warning bg-warning/10 rounded-xl px-3 py-2">
            รายการนี้ยังไม่ได้กรอกรายละเอียด — ใส่ยอด หมวด และคนจ่ายให้ครบแล้วกดบันทึก
          </p>
        )}
        {expense?.splits.some((s) => s.paid) && (
          <p className="text-xs text-warning bg-warning/10 rounded-xl px-3 py-2">
            มีการหารเงินที่จ่ายแล้วบางส่วน — แก้ไขยอดหรือคนจ่ายไม่ได้ (ลบได้ แต่ประวัติสลิปที่จ่ายไปจะหายไปด้วย)
          </p>
        )}
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
          <Button variant="secondary" className="text-danger" onClick={del}>
            ลบ
          </Button>
          <Button variant="primary" full onClick={save} disabled={money.amount <= 0 || payer.trim() === ""}>
            บันทึก
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
