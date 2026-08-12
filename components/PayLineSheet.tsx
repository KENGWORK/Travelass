"use client";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { PhotoPicker } from "@/components/PhotoPicker";
import { promptPayQrDataUrl } from "@/lib/promptpay";
import type { Member } from "@/lib/models/types";

// Scoped to a single creditor + a set of already-summed lines the user
// checked off in the settle-summary drill-down. Uploading a slip here is
// optional (per the split-expense spec's existing stance: slip is evidence,
// not a gate) -- confirming without one still marks every selected split
// paid, just with an empty paid_slip_photo_ids.
export function PayLineSheet({
  open,
  onClose,
  toMember,
  amount,
  lineCount,
  tripName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  toMember: Member | undefined;
  amount: number;
  lineCount: number;
  tripName: string;
  onConfirm: (slipPhotoIds: string[]) => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [slipIds, setSlipIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setSlipIds([]);
      setQrUrl(null);
      setQrError(false);
      return;
    }
    if (!toMember?.promptpay_id) return;
    let cancelled = false;
    promptPayQrDataUrl(toMember.promptpay_id, amount)
      .then((url) => { if (!cancelled) setQrUrl(url); })
      .catch(() => { if (!cancelled) setQrError(true); });
    return () => { cancelled = true; };
  }, [open, toMember, amount]);

  return (
    <BottomSheet open={open} onClose={onClose} title={`โอนให้ ${toMember?.name ?? ""}`}>
      <div className="flex flex-col items-center gap-4">
        <p className="money text-2xl font-bold">฿{amount.toLocaleString()}</p>
        <p className="text-xs text-muted -mt-2">{lineCount} รายการ</p>

        {!toMember?.promptpay_id ? (
          <p className="text-sm text-muted text-center py-6">
            ยังไม่มีเลข PromptPay ของ {toMember?.name} — ไปตั้งค่าที่หน้าสมาชิกก่อน
          </p>
        ) : qrError ? (
          <p className="text-sm text-danger text-center py-6">สร้าง QR ไม่สำเร็จ ลองใหม่อีกครั้ง</p>
        ) : qrUrl ? (
          <img src={qrUrl} alt="PromptPay QR" className="w-56 h-56 rounded-2xl" />
        ) : (
          <div className="w-56 h-56 rounded-2xl bg-muted/10 animate-pulse" />
        )}

        <div className="w-full flex flex-col gap-1.5">
          <p className="text-sm text-muted">แนบสลิปการโอน (ไม่บังคับ)</p>
          <PhotoPicker tripName={tripName} kind="slips" fileIds={slipIds} onChange={setSlipIds} />
        </div>

        <Button variant="primary" full onClick={() => onConfirm(slipIds)}>
          ติ๊กจ่ายแล้ว
        </Button>
      </div>
    </BottomSheet>
  );
}
