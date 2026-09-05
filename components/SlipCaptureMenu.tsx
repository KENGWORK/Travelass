"use client";
import { useRef, useState } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PhotoViewer } from "@/components/PhotoViewer";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { apiCreate } from "@/lib/api";
import { useTripData } from "@/lib/use-trip-data";
import { optimisticCreate } from "@/lib/optimistic";
import { uploadPhoto } from "@/lib/upload-photo";
import { photoUrl } from "@/lib/photo-url";
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
// whole point is capturing the photo the instant it happens. After the
// upload lands, a short review step lets you glance at the shot (tap to
// see it full-screen) and jot a one-line note before it's saved.
export function SlipCaptureMenu({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const { expenses, setExpenses } = useTripData();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);

  const reset = () => {
    setPhotoId(null);
    setNote("");
    setViewerOpen(false);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const id = await uploadPhoto(file, trip.name, "slips");
      setPhotoId(id);
    } catch {
      toast("อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    if (!photoId) return;
    const exp = buildPendingExpense({
      id: crypto.randomUUID(),
      tripId: trip.id,
      photoId,
      currency: lastUsedCurrency(expenses, trip.trip_currency),
      now: new Date().toISOString(),
      description: note.trim(),
    });
    optimisticCreate(setExpenses, exp, () => apiCreate<Expense>("expenses", exp));
    toast("บันทึกสลิปแล้ว — กรอกรายละเอียดทีหลังได้ที่หน้าเงิน");
    reset();
    onClose();
  };

  return (
    <>
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
      <BottomSheet
        open={open}
        onClose={() => {
          reset();
          onClose();
        }}
        title="ถ่ายสลิปด่วน"
      >
        {photoId ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              aria-label="ดูรูป"
              onClick={() => setViewerOpen(true)}
              className="press h-24 w-24 rounded-xl overflow-hidden cursor-pointer shadow-card"
            >
              <img src={photoUrl(photoId)} alt="" className="w-full h-full object-cover" />
            </button>
            <input
              autoFocus
              className="field"
              placeholder="โน้ตสั้นๆ (ไม่บังคับ)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button variant="primary" full onClick={save}>
              บันทึก
            </Button>
            {viewerOpen && (
              <PhotoViewer fileIds={[photoId]} initialIndex={0} onClose={() => setViewerOpen(false)} />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted px-1 -mt-2 mb-1">กรอกยอด/หมวด/คนจ่ายทีหลังได้ที่หน้าเงิน</p>
            <button
              type="button"
              disabled={uploading}
              onClick={() => cameraInputRef.current?.click()}
              className="press h-16 rounded-2xl bg-primary-soft text-primary font-medium flex items-center gap-3 px-4 cursor-pointer disabled:opacity-50"
            >
              <Camera size={20} /> ถ่ายรูป
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => albumInputRef.current?.click()}
              className="press h-16 rounded-2xl bg-muted/10 text-text font-medium flex items-center gap-3 px-4 cursor-pointer disabled:opacity-50"
            >
              <ImageIcon size={20} /> เลือกจากอัลบั้ม
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
