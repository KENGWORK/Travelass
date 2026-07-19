"use client";
import { useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { BedDouble, GripVertical, MoreHorizontal, Navigation, Pin, Plus, Info } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { apiCreate, apiDelete, apiUpdate } from "@/lib/api";
import { optimisticCreate, optimisticUpdate, optimisticDelete } from "@/lib/optimistic";
import { PhotoViewer } from "@/components/PhotoViewer";
import { QuickInfoFormSheet, type QuickInfoFormValues } from "@/components/QuickInfoFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { photoUrl } from "@/lib/photo-url";
import { getQuickInfoOrder, setQuickInfoOrder } from "@/lib/quickinfo-order";
import type { Booking, QuickInfo, Transport, Trip } from "@/lib/models/types";

type DisplayItem =
  | { kind: "hotel"; id: string; booking: Booking }
  | { kind: "pickup"; id: string; transport: Transport }
  | { kind: "quickinfo"; id: string; item: QuickInfo };

function defaultOrder(hotelBookings: Booking[], pickupTransports: Transport[], quickInfoSorted: QuickInfo[]): DisplayItem[] {
  return [
    ...hotelBookings.map((b): DisplayItem => ({ kind: "hotel", id: b.id, booking: b })),
    ...pickupTransports.map((t): DisplayItem => ({ kind: "pickup", id: t.id, transport: t })),
    ...quickInfoSorted.map((item): DisplayItem => ({ kind: "quickinfo", id: item.id, item })),
  ];
}

function applyStoredOrder(items: DisplayItem[], order: string[]): DisplayItem[] {
  if (order.length === 0) return items;
  const byId = new Map(items.map((it) => [it.id, it]));
  const ordered: DisplayItem[] = [];
  order.forEach((id) => {
    const it = byId.get(id);
    if (it) {
      ordered.push(it);
      byId.delete(id);
    }
  });
  // Anything not in the saved order (new hotel booking, new quickinfo entry) goes last.
  items.forEach((it) => {
    if (byId.has(it.id)) ordered.push(it);
  });
  return ordered;
}

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
          <img src={photoUrl(id)} alt="" className="w-full h-full object-cover" />
        </button>
      ))}
      {viewerIndex !== null && (
        <PhotoViewer fileIds={fileIds} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  );
}

function DragHandle({ dragControls }: { dragControls: ReturnType<typeof useDragControls> }) {
  return (
    <button
      type="button"
      aria-label="ลากจัดลำดับ"
      onPointerDown={(e) => {
        e.stopPropagation();
        dragControls.start(e);
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0.5 right-0.5 h-11 w-11 flex items-center justify-center text-muted/50 cursor-grab active:cursor-grabbing touch-none"
    >
      <GripVertical size={18} />
    </button>
  );
}

// Whole-card dragging fought with the page's own vertical scroll on touch
// (a swipe anywhere on a card reordered instead of scrolling) — same fix as
// the itinerary page: dragListener={false} + a dedicated grip handle, so
// only that corner triggers a drag and the rest of the card scrolls/taps
// normally. useDragControls() must live in its own component instance per
// row (can't call a hook inside the .map() below), hence this component.
function QuickInfoCard({
  row,
  onDragEnd,
  onEdit,
  onCopy,
}: {
  row: DisplayItem;
  onDragEnd: () => void;
  onEdit: (item: QuickInfo) => void;
  onCopy: (value: string) => void;
}) {
  const dragControls = useDragControls();

  if (row.kind === "hotel") {
    const b = row.booking;
    return (
      <Reorder.Item
        value={row}
        dragListener={false}
        dragControls={dragControls}
        onDragEnd={onDragEnd}
        className="relative press rounded-2xl bg-surface shadow-card p-4 pr-11 flex flex-col gap-1"
      >
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <BedDouble size={14} />
          <span>ที่พัก</span>
        </div>
        <p className="text-base font-medium">{b.vendor}</p>
        {b.detail && <p className="text-sm text-muted whitespace-pre-wrap">{b.detail}</p>}
        {b.ref_no && <p className="font-mono text-xs text-muted">{b.ref_no}</p>}
        <DragHandle dragControls={dragControls} />
      </Reorder.Item>
    );
  }

  if (row.kind === "pickup") {
    const t = row.transport;
    return (
      <Reorder.Item
        value={row}
        dragListener={false}
        dragControls={dragControls}
        onDragEnd={onDragEnd}
        className="relative press rounded-2xl bg-surface shadow-card p-4 pr-11 flex flex-col gap-2"
      >
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Navigation size={14} />
          <span>จุดนัดพบ</span>
        </div>
        <p className="text-base font-medium">
          {t.from} → {t.to}
        </p>
        <PhotoStrip fileIds={t.pickup_photo_ids} />
        <DragHandle dragControls={dragControls} />
      </Reorder.Item>
    );
  }

  const item = row.item;
  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onClick={() => onCopy(item.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCopy(item.value);
        }
      }}
      className="press rounded-2xl bg-surface shadow-card p-4 flex flex-col gap-2 relative cursor-pointer"
    >
      <div className="flex items-center gap-1.5 pr-20">
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
          onEdit(item);
        }}
        className="absolute top-0.5 right-11 h-11 w-11 flex items-center justify-center text-muted cursor-pointer"
      >
        <MoreHorizontal size={18} />
      </button>
      <DragHandle dragControls={dragControls} />
    </Reorder.Item>
  );
}

export function QuickInfoSection({
  trip,
  bookings,
  transports,
  quickInfo,
  setQuickInfo,
  loading,
}: {
  trip: Trip;
  bookings: Booking[];
  transports: Transport[];
  quickInfo: QuickInfo[];
  setQuickInfo: Dispatch<SetStateAction<QuickInfo[]>>;
  loading: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<QuickInfo | null>(null);
  const [rows, setRows] = useState<DisplayItem[]>([]);

  const hotelBookings = bookings.filter((b) => b.type === "hotel");
  const pickupTransports = transports.filter((t) => t.pickup_photo_ids.length > 0);

  useEffect(() => {
    const quickInfoSorted = quickInfo.slice().sort((a, b) => a.sort_order - b.sort_order);
    const base = defaultOrder(hotelBookings, pickupTransports, quickInfoSorted);
    setRows(applyStoredOrder(base, getQuickInfoOrder(trip.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickInfo, bookings, transports, trip.id]);

  // Drag reorder covers hotel/pickup auto-cards too, so the whole tab is
  // freely reorderable — those two aren't real QuickInfo rows and have
  // nowhere sane to sync a position to, so the combined order is a
  // per-device local preference instead of a Sheets-synced field.
  const persistOrder = (newRows: DisplayItem[]) => {
    setQuickInfoOrder(trip.id, newRows.map((it) => it.id));
  };

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

  const handleSave = (values: QuickInfoFormValues) => {
    if (editing) {
      const patch = { ...editing, ...values };
      optimisticUpdate(setQuickInfo, editing.id, patch, () => apiUpdate<QuickInfo>("quickinfo", editing.id, patch));
    } else {
      const newItem: QuickInfo = { id: crypto.randomUUID(), trip_id: trip.id, sort_order: rows.length, ...values };
      optimisticCreate(setQuickInfo, newItem, () => apiCreate<QuickInfo>("quickinfo", newItem));
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    optimisticDelete(setQuickInfo, editing.id, () => apiDelete("quickinfo", editing.id));
    setSheetOpen(false);
    toast("ลบแล้ว");
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
      {rows.length === 0 && (
        <EmptyState icon={Info} title="ยังไม่มีข้อมูลด่วน" subtitle="เก็บที่อยู่โรงแรม, เบอร์ฉุกเฉิน, wifi ไว้ที่นี่" />
      )}

      {rows.length > 0 && (
        <Reorder.Group axis="y" values={rows} onReorder={setRows} className="flex flex-col gap-3 list-none">
          {rows.map((row) => (
            <QuickInfoCard key={row.id} row={row} onDragEnd={() => persistOrder(rows)} onEdit={openEdit} onCopy={copyValue} />
          ))}
        </Reorder.Group>
      )}

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
