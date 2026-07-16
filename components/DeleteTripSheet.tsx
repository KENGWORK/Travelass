"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { deleteTripCascade } from "@/lib/delete-trip";
import type { Trip } from "@/lib/models/types";

export function DeleteTripSheet({
  trip,
  open,
  onClose,
  onDeleted,
}: {
  trip: Trip;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  const matches = confirmText.trim() === trip.name;

  const confirm = async () => {
    if (!matches || deleting) return;
    setDeleting(true);
    setError(false);
    try {
      await deleteTripCascade(trip.id);
      onDeleted();
    } catch {
      setError(true);
      setDeleting(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={deleting ? () => {} : onClose} title="ลบทริป">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-danger/10 p-4 flex gap-3">
          <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-text">
            การลบไม่สามารถย้อนกลับได้ — ทริป <span className="font-semibold">{trip.name}</span> พร้อมแผน, ค่าใช้จ่าย,
            การจอง, เช็คลิสต์ และข้อมูลอื่นทั้งหมดของทริปนี้จะถูกลบถาวร
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-muted">
            พิมพ์ชื่อทริป <span className="font-semibold text-text">{trip.name}</span> เพื่อยืนยัน
          </label>
          <input
            className="field"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={trip.name}
            autoFocus
            disabled={deleting}
          />
        </div>

        {error && <p className="text-sm text-danger">ลบไม่สำเร็จ ลองอีกครั้ง</p>}

        <Button variant="danger" full disabled={!matches} loading={deleting} onClick={confirm}>
          ลบทริปนี้ถาวร
        </Button>
      </div>
    </BottomSheet>
  );
}
