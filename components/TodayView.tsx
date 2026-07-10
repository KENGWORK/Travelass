"use client";
import { useState } from "react";
import { MapPin, Camera, Clock, Navigation, MoreHorizontal } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiUpdate, apiCreate } from "@/lib/api";
import { tripDays } from "@/lib/days";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { PhotoViewer } from "@/components/PhotoViewer";
import { toast } from "@/components/ui/Toast";
import type { ItineraryItem, Transport } from "@/lib/models/types";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ItineraryCard({
  item,
  expanded,
  transport,
  onToggleDone,
  onOpenMenu,
}: {
  item: ItineraryItem;
  expanded: boolean;
  transport: Transport | undefined;
  onToggleDone: () => void;
  onOpenMenu: () => void;
}) {
  const [photosOpen, setPhotosOpen] = useState(false);
  const [timesOpen, setTimesOpen] = useState(false);

  const finished = item.status === "done" || item.status === "skipped";
  const hasPickupPhotos = !!transport && transport.pickup_photo_ids.length > 0;
  const hasDepartureTimes = !!transport && transport.departure_times.length > 0;

  return (
    <div
      className={[
        "rounded-2xl bg-surface border border-muted/20 p-3 flex flex-col gap-2",
        expanded ? "ring-2 ring-primary" : "",
        finished ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          onClick={onToggleDone}
          className="relative inline-flex before:absolute before:inset-[-10px] before:content-['']"
        >
          <Checkbox checked={item.status === "done"} onChange={() => {}} />
        </span>
        <div className="min-w-0 flex-1">
          {item.time && <p className="text-xs text-muted">{item.time}</p>}
          <p className={`text-base font-medium ${item.status === "done" ? "line-through" : ""}`}>{item.title}</p>
          {item.place && (
            <p className="text-sm text-muted flex items-center gap-1 truncate">
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{item.place}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="ตัวเลือกเพิ่มเติม"
          onClick={onOpenMenu}
          className="h-11 w-11 -mr-2 -mt-1 flex items-center justify-center rounded-full text-muted cursor-pointer shrink-0"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      {expanded && (hasPickupPhotos || hasDepartureTimes || item.maps_link) && (
        <div className="flex gap-2 flex-wrap pt-1">
          {hasPickupPhotos && (
            <button
              type="button"
              onClick={() => setPhotosOpen(true)}
              className="relative h-10 px-3 rounded-full bg-primary-soft text-primary text-sm inline-flex items-center gap-1.5 cursor-pointer before:absolute before:inset-[-4px] before:content-['']"
            >
              <Camera size={14} />
              รูปจุดขึ้นรถ
            </button>
          )}
          {hasDepartureTimes && (
            <button
              type="button"
              onClick={() => setTimesOpen(true)}
              className="relative h-10 px-3 rounded-full bg-primary-soft text-primary text-sm inline-flex items-center gap-1.5 cursor-pointer before:absolute before:inset-[-4px] before:content-['']"
            >
              <Clock size={14} />
              รอบรถ
            </button>
          )}
          {item.maps_link && (
            <button
              type="button"
              onClick={() => window.open(item.maps_link, "_blank", "noreferrer")}
              className="relative h-10 px-3 rounded-full bg-primary-soft text-primary text-sm inline-flex items-center gap-1.5 cursor-pointer before:absolute before:inset-[-4px] before:content-['']"
            >
              <Navigation size={14} />
              นำทาง
            </button>
          )}
        </div>
      )}

      {photosOpen && transport && (
        <PhotoViewer fileIds={transport.pickup_photo_ids} initialIndex={0} onClose={() => setPhotosOpen(false)} />
      )}

      <BottomSheet open={timesOpen} onClose={() => setTimesOpen(false)} title="รอบรถ">
        <div className="flex gap-2 flex-wrap">
          {transport?.departure_times.map((t, i) => (
            <Chip key={i}>{t}</Chip>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

export function TodayView({ tripId }: { tripId: string }) {
  const { trip } = useTrip();
  const { itinerary, transports, summary, loading, reload } = useTripData(tripId);

  const [menuItem, setMenuItem] = useState<ItineraryItem | null>(null);
  const [moveItem, setMoveItem] = useState<ItineraryItem | null>(null);

  const days = tripDays(trip.start_date, trip.end_date);
  const today = todayISO();
  const inRange = today >= trip.start_date && today <= trip.end_date;
  const selectedDate = inRange ? today : days[0]?.date ?? trip.start_date;
  const dayIndex = Math.max(1, days.findIndex((d) => d.date === selectedDate) + 1);
  const dowDate = new Date(`${selectedDate}T00:00:00`).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const dayItems = itinerary
    .filter((it) => it.day_date === selectedDate && it.status !== "moved")
    .sort((a, b) => a.time.localeCompare(b.time));

  const plannedItems = dayItems.filter((it) => it.status === "planned");
  const now = nowHM();
  const nextItem = plannedItems.find((it) => it.time && it.time >= now) ?? plannedItems[0] ?? null;

  const todaySpend = summary.byDay[selectedDate] ?? 0;

  const toggleDone = async (item: ItineraryItem) => {
    const next = item.status === "done" ? "planned" : "done";
    await apiUpdate<ItineraryItem>("itinerary", item.id, { ...item, status: next });
    await reload();
  };

  const skip = async (item: ItineraryItem) => {
    setMenuItem(null);
    await apiUpdate<ItineraryItem>("itinerary", item.id, { ...item, status: "skipped" });
    await reload();
    toast("ข้ามแล้ว");
  };

  const startMove = (item: ItineraryItem) => {
    setMenuItem(null);
    setMoveItem(item);
  };

  const moveTo = async (targetDate: string) => {
    if (!moveItem) return;
    const original = moveItem;
    setMoveItem(null);
    await apiUpdate<ItineraryItem>("itinerary", original.id, {
      ...original,
      status: "moved",
      moved_to_date: targetDate,
    });
    const clone: ItineraryItem = {
      ...original,
      id: crypto.randomUUID(),
      day_date: targetDate,
      status: "planned",
      moved_to_date: "",
      sort_order: 999,
    };
    await apiCreate<ItineraryItem>("itinerary", clone);
    await reload();
    toast("เลื่อนแผนแล้ว");
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">
          วันที่ {dayIndex} · {dowDate}
        </h2>
        <p className="money text-lg font-semibold text-accent">฿{todaySpend.toLocaleString()}</p>
      </div>

      {dayItems.length === 0 ? (
        <p className="text-muted text-sm py-6 text-center">ยังไม่มีแผนสำหรับวันนี้</p>
      ) : (
        <div className="flex flex-col gap-3">
          {dayItems.map((item) => (
            <ItineraryCard
              key={item.id}
              item={item}
              expanded={nextItem?.id === item.id}
              transport={item.linked_transport_id ? transports.find((t) => t.id === item.linked_transport_id) : undefined}
              onToggleDone={() => toggleDone(item)}
              onOpenMenu={() => setMenuItem(item)}
            />
          ))}
        </div>
      )}

      <BottomSheet open={!!menuItem} onClose={() => setMenuItem(null)} title={menuItem?.title}>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => menuItem && skip(menuItem)}
            className="h-12 rounded-2xl bg-muted/10 text-left px-4 cursor-pointer"
          >
            ข้าม
          </button>
          <button
            type="button"
            onClick={() => menuItem && startMove(menuItem)}
            className="h-12 rounded-2xl bg-muted/10 text-left px-4 cursor-pointer"
          >
            เลื่อนไปวันอื่น
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={!!moveItem} onClose={() => setMoveItem(null)} title="เลื่อนไปวันไหน">
        <div className="flex gap-2 flex-wrap">
          {days
            .filter((d) => d.date !== moveItem?.day_date)
            .map((d) => (
              <span key={d.date} onClick={() => moveTo(d.date)} className="relative inline-flex before:absolute before:inset-[-4px] before:content-['']">
                <Chip>{d.label}</Chip>
              </span>
            ))}
        </div>
      </BottomSheet>
    </div>
  );
}
