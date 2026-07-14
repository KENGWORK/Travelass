"use client";
import { useState } from "react";
import { BedDouble, MoreHorizontal, Navigation, Pin, Plus, Info } from "lucide-react";
import { apiCreate, apiDelete, apiUpdate } from "@/lib/api";
import { PhotoViewer } from "@/components/PhotoViewer";
import { QuickInfoFormSheet, type QuickInfoFormValues } from "@/components/QuickInfoFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import type { Booking, QuickInfo, Transport, Trip } from "@/lib/models/types";

function PhotoStrip({ fileIds }: { fileIds: string[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (fileIds.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
      {fileIds.map((id, i) => (
        <button
          key={id}
          type="button"
          aria-label="ดูรูป"
          onClick={() => setViewerIndex(i)}
          className="h-24 w-24 rounded-xl overflow-hidden shrink-0 cursor-pointer"
        >
          <img src={id} alt="" className="w-full h-full object-cover" />
        </button>
      ))}
      {viewerIndex !== null && (
        <PhotoViewer fileIds={fileIds} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  );
}

export function QuickInfoSection({
  trip,
  bookings,
  transports,
  quickInfo,
  loading,
  reload,
}: {
  trip: Trip;
  bookings: Booking[];
  transports: Transport[];
  quickInfo: QuickInfo[];
  loading: boolean;
  reload: () => Promise<void>;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<QuickInfo | null>(null);

  const hotelBookings = bookings.filter((b) => b.type === "hotel");
  const pickupTransports = transports.filter((t) => t.pickup_photo_ids.length > 0);
  const rows = quickInfo.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (item: QuickInfo) => {
    setEditing(item);
    setSheetOpen(true);
  };

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("คัดลอกแล้ว");
    } catch {
      toast("คัดลอกไม่สำเร็จ");
    }
  };

  const handleSave = async (values: QuickInfoFormValues) => {
    if (editing) {
      await apiUpdate<QuickInfo>("quickinfo", editing.id, { ...editing, ...values });
    } else {
      const newItem: QuickInfo = { id: crypto.randomUUID(), trip_id: trip.id, ...values };
      await apiCreate<QuickInfo>("quickinfo", newItem);
    }
    await reload();
  };

  const handleDelete = async () => {
    if (!editing) return;
    await apiDelete("quickinfo", editing.id);
    setSheetOpen(false);
    toast("ลบแล้ว");
    await reload();
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hotelBookings.map((b) => (
        <div key={b.id} className="rounded-2xl bg-surface shadow-card p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <BedDouble size={14} />
            <span>ที่พัก</span>
          </div>
          <p className="text-base font-medium">{b.vendor}</p>
          {b.detail && <p className="text-sm text-muted whitespace-pre-wrap">{b.detail}</p>}
          {b.ref_no && <p className="font-mono text-xs text-muted">{b.ref_no}</p>}
        </div>
      ))}

      {pickupTransports.map((t) => (
        <div key={t.id} className="rounded-2xl bg-surface shadow-card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Navigation size={14} />
            <span>จุดนัดพบ</span>
          </div>
          <p className="text-base font-medium">
            {t.from} → {t.to}
          </p>
          <PhotoStrip fileIds={t.pickup_photo_ids} />
        </div>
      ))}

      {rows.length === 0 && hotelBookings.length === 0 && pickupTransports.length === 0 && (
        <EmptyState icon={Info} title="ยังไม่มีข้อมูลด่วน" subtitle="เก็บที่อยู่โรงแรม, เบอร์ฉุกเฉิน, wifi ไว้ที่นี่" />
      )}

      {rows.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => copyValue(item.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              copyValue(item.value);
            }
          }}
          className="press rounded-2xl bg-surface shadow-card p-4 flex flex-col gap-2 relative cursor-pointer"
        >
          <div className="flex items-center gap-1.5 pr-9">
            {item.pinned && <Pin size={12} className="text-primary shrink-0" />}
            <span className="text-xs text-muted truncate">{item.label}</span>
          </div>
          <p className="text-base whitespace-pre-wrap break-words">{item.value}</p>
          <PhotoStrip fileIds={item.photo_ids} />
          <button
            type="button"
            aria-label="ตัวเลือกเพิ่มเติม"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(item);
            }}
            className="absolute top-0.5 right-0.5 h-11 w-11 flex items-center justify-center text-muted cursor-pointer"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      ))}

      <button
        type="button"
        aria-label="เพิ่มข้อมูลด่วน"
        onClick={openCreate}
        className="h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer"
      >
        <Plus size={18} />
        เพิ่มข้อมูลด่วน
      </button>

      <QuickInfoFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        tripName={trip.name}
        quickInfo={editing}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined}
      />
    </div>
  );
}
