"use client";
import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { apiCreate } from "@/lib/api";
import { useTripData } from "@/lib/use-trip-data";
import { optimisticCreate } from "@/lib/optimistic";
import { uploadPhoto } from "@/lib/upload-photo";
import { buildPendingExpense } from "@/lib/pending-expense";
import type { Trip, Expense } from "@/lib/models/types";

// Same "follow whatever was used last" rule QuickExpenseSheet uses -- a
// pending expense's currency shouldn't reset to the trip default either.
function lastUsedCurrency(expenses: Expense[], tripCurrency: string): string {
  if (expenses.length === 0) return tripCurrency;
  return expenses.reduce((latest, e) => (e.datetime > latest.datetime ? e : latest)).currency;
}

// FAB alternative to QuickExpenseSheet's digit pad: snap the slip now,
// figure out the amount/category/payer later. Reachable from every trip
// page (mounted once in the trip layout), not just the money tab -- the
// whole point is capturing the photo the instant it happens.
export function SlipCaptureMenu({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const { expenses, setExpenses } = useTripData();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const photoId = await uploadPhoto(file, trip.name, "slips");
      const exp = buildPendingExpense({
        id: crypto.randomUUID(),
        tripId: trip.id,
        photoId,
        currency: lastUsedCurrency(expenses, trip.trip_currency),
        now: new Date().toISOString(),
      });
      optimisticCreate(setExpenses, exp, () => apiCreate<Expense>("expenses", exp));
      toast("บันทึกสลิปแล้ว — กรอกรายละเอียดทีหลังได้ที่หน้าเงิน");
      onClose();
    } catch {
      toast("อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] flex flex-col gap-2"
      >
        <div className="flex items-center justify-between px-1">
          <p className="font-heading text-base font-semibold">ถ่ายสลิปด่วน</p>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-full text-muted cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted px-1 -mt-1">กรอกยอด/หมวด/คนจ่ายทีหลังได้ที่หน้าเงิน</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraInputRef.current?.click()}
          className="press h-14 rounded-2xl bg-primary-soft text-primary font-medium flex items-center gap-3 px-4 cursor-pointer disabled:opacity-50"
        >
          <Camera size={20} /> ถ่ายรูป
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => albumInputRef.current?.click()}
          className="press h-14 rounded-2xl bg-muted/10 text-text font-medium flex items-center gap-3 px-4 cursor-pointer disabled:opacity-50"
        >
          <ImageIcon size={20} /> เลือกจากอัลบั้ม
        </button>
      </div>
    </div>
  );
}
