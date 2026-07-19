"use client";
import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Reorder } from "framer-motion";
import { MapPin, Plus, Download, CalendarDays } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiCreate, apiUpdate, apiDelete } from "@/lib/api";
import { tripDays } from "@/lib/days";
import { computeDurationMin, formatDuration } from "@/lib/time";
import { photoUrl } from "@/lib/photo-url";
import { dayColor } from "@/lib/day-color";
import { sessionOf } from "@/lib/day-session";
import { DayChips } from "@/components/DayChips";
import { ItineraryFormSheet, type ItineraryFormValues } from "@/components/ItineraryFormSheet";
import { PullIntoPlanSheet } from "@/components/PullIntoPlanSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { SearchButton } from "@/components/ui/SearchButton";
import { UploadButton } from "@/components/ui/UploadButton";
import { optimisticCreate, optimisticUpdate, optimisticDelete } from "@/lib/optimistic";
import { transportIcon } from "@/lib/transport-icon";
import type { ItineraryItem } from "@/lib/models/types";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initialSelectedDate(startDate: string, endDate: string): string {
  const today = todayISO();
  if (today >= startDate && today <= endDate) return today;
  return startDate;
}

export default function ItineraryPage() {
  const { trip } = useTrip();
  const { itinerary, transports, loading, reload, setItinerary } = useTripData(trip.id);
  const searchParams = useSearchParams();
  const dayParam = searchParams.get("day");

  const [selectedDate, setSelectedDate] = useState(
    () => dayParam || initialSelectedDate(trip.start_date, trip.end_date),
  );

  // Search results deep-link here with ?day=..., which can arrive after
  // this page is already mounted (layout stays alive across in-trip nav).
  useEffect(() => {
    if (dayParam) setSelectedDate(dayParam);
  }, [dayParam]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);

  useEffect(() => {
    const dayItems = itinerary
      .filter((it) => it.day_date === selectedDate && it.status !== "moved")
      .sort((a, b) => a.sort_order - b.sort_order);
    setItems(dayItems);
  }, [itinerary, selectedDate]);

  // Drag reorder: apply the new sort_order values to the shared itinerary
  // state immediately (so it survives day-tab switches, which re-derive
  // `items` from `itinerary`), then persist in the background. A batch of
  // N writes doesn't get a full rollback on partial failure — reorder is
  // low-stakes and a stuck order is fixed by the refresh button.
  const persistOrder = (newItems: ItineraryItem[]) => {
    const changed = newItems.filter((it, idx) => it.sort_order !== idx);
    if (changed.length === 0) return;
    const reordered = newItems.map((it, idx) => ({ ...it, sort_order: idx }));
    setItinerary((prev) => prev.map((it) => reordered.find((r) => r.id === it.id) ?? it));
    Promise.all(
      reordered
        .filter((it) => changed.some((c) => c.id === it.id))
        .map((it) => apiUpdate<ItineraryItem>("itinerary", it.id, it)),
    ).catch(() => toast("บันทึกลำดับไม่สำเร็จ ลองอีกครั้ง", "error"));
  };

  const openCreate = () => {
    setEditingItem(null);
    setSheetOpen(true);
  };

  const openEdit = (item: ItineraryItem) => {
    setEditingItem(item);
    setSheetOpen(true);
  };

  const handleSave = (values: ItineraryFormValues) => {
    if (editingItem) {
      const patch = { ...editingItem, ...values };
      optimisticUpdate(setItinerary, editingItem.id, patch, () => apiUpdate<ItineraryItem>("itinerary", editingItem.id, patch));
    } else {
      const newItem: ItineraryItem = {
        id: crypto.randomUUID(),
        trip_id: trip.id,
        day_date: selectedDate,
        status: "planned",
        moved_to_date: "",
        linked_transport_id: "",
        linked_booking_id: "",
        sort_order: items.length,
        ...values,
      };
      optimisticCreate(setItinerary, newItem, () => apiCreate<ItineraryItem>("itinerary", newItem));
    }
    setSheetOpen(false);
  };

  const handleDelete = () => {
    if (!editingItem) return;
    optimisticDelete(setItinerary, editingItem.id, () => apiDelete("itinerary", editingItem.id));
    setSheetOpen(false);
    toast("ลบแล้ว");
  };

  const handlePull = (item: ItineraryItem) => {
    const newItem: ItineraryItem = { ...item, day_date: selectedDate, sort_order: items.length };
    optimisticCreate(setItinerary, newItem, () => apiCreate<ItineraryItem>("itinerary", newItem));
    toast("เพิ่มเข้าแผนแล้ว");
  };

  const days = tripDays(trip.start_date, trip.end_date);
  const selectedDayIndex = Math.max(0, days.findIndex((d) => d.date === selectedDate));
  const accent = dayColor(selectedDayIndex);
  const isToday = selectedDate === todayISO();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-4 pt-4 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">แผนการเดินทาง</h1>
          {days.length > 0 && (
            <p className="text-xs text-muted mt-0.5">
              วันที่ {selectedDayIndex + 1} จาก {days.length}
              {items.length > 0 && ` · ${items.length} กิจกรรม`}
              {isToday && (
                <span
                  className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold"
                  style={{ backgroundColor: accent, color: "#fff" }}
                >
                  วันนี้
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center">
          <SearchButton />
          <UploadButton />
          <RefreshButton onRefresh={reload} />
        </div>
      </div>

      <div className="px-4">
        <DayChips
          startDate={trip.start_date}
          endDate={trip.end_date}
          selected={selectedDate}
          onSelect={setSelectedDate}
        />
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {loading ? (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        ) : items.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="ยังไม่มีแผนสำหรับวันนี้"
            subtitle={days.length === 0 ? "ทริปนี้ยังไม่มีวันที่เริ่ม-สิ้นสุด ไปตั้งค่าที่หน้าแก้ไขทริปก่อน" : "เพิ่มกิจกรรมหรือดึงจากการเดินทาง/ที่อยากไป"}
          />
        ) : (
          <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col gap-3 list-none">
            {items.map((item, i) => {
              const transport = item.linked_transport_id
                ? transports.find((t) => t.id === item.linked_transport_id)
                : undefined;
              const Icon = transport ? transportIcon(transport.mode) : null;
              const durationMin = item.time && item.end_time ? computeDurationMin(item.time, item.end_time) : 0;
              const session = sessionOf(item.time);
              const prevSession = i > 0 ? sessionOf(items[i - 1].time) : null;
              const showDivider = session.key !== prevSession?.key;
              const SessionIcon = session.icon;

              return (
                <Fragment key={item.id}>
                  {showDivider && (
                    <div className="flex items-center gap-2 pl-1 pb-1 pt-1 first:pt-0">
                      <span
                        className="h-6 w-6 rounded-full grid place-items-center shrink-0"
                        style={{ backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
                      >
                        <SessionIcon size={13} />
                      </span>
                      <span className="text-xs font-semibold tracking-wide" style={{ color: accent }}>
                        {session.label}
                      </span>
                      <span className="h-px flex-1" style={{ backgroundColor: `color-mix(in srgb, ${accent} 22%, transparent)` }} />
                    </div>
                  )}
                  <Reorder.Item value={item} onDragEnd={() => persistOrder(items)} className="list-none">
                  <div className="relative pl-7 cursor-grab active:cursor-grabbing">
                    {i < items.length - 1 && (
                      <span
                        className="absolute left-[9px] top-6 w-0.5"
                        style={{ backgroundColor: accent, opacity: 0.3, bottom: "-12px" }}
                      />
                    )}
                    <span
                      className="absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 border-bg"
                      style={{ backgroundColor: accent }}
                    />
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="press w-full text-left rounded-2xl bg-surface shadow-card p-3 flex items-start justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <p className="font-heading text-base font-medium">{item.title}</p>
                        {item.place && (
                          <p className="text-sm text-muted flex items-center gap-1">
                            {item.place}
                            {item.maps_link && (
                              <a
                                href={item.maps_link}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="relative text-primary inline-flex items-center justify-center p-2.5 before:absolute before:inset-[-5px] before:content-['']"
                              >
                                <MapPin size={14} />
                              </a>
                            )}
                          </p>
                        )}
                        {transport && Icon && (
                          <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary-soft rounded-full px-2 py-1 w-fit mt-1">
                            <Icon size={12} />
                            {transport.duration_min} นาที
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        {item.time && (
                          <div
                            className="flex flex-col items-end tabular-nums rounded-xl px-2 py-1"
                            style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` }}
                          >
                            <span className="text-xl font-semibold leading-tight">{item.time}</span>
                            {item.end_time && <span className="text-xs text-muted leading-tight">{item.end_time}</span>}
                            {durationMin > 0 && (
                              <span className="text-[11px] leading-tight mt-0.5" style={{ color: accent }}>
                                {formatDuration(durationMin)}
                              </span>
                            )}
                          </div>
                        )}
                        {item.photo_ids.length > 0 && (
                          <div className="relative h-11 w-11">
                            <img src={photoUrl(item.photo_ids[0])} alt="" className="h-11 w-11 rounded-lg object-cover" />
                            {item.photo_ids.length > 1 && (
                              <span className="absolute -bottom-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-primary text-white text-[10px] font-medium flex items-center justify-center">
                                +{item.photo_ids.length - 1}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                  </Reorder.Item>
                </Fragment>
              );
            })}
          </Reorder.Group>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="flex-1 h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus size={18} />
            เพิ่มกิจกรรม
          </button>
          <button
            type="button"
            onClick={() => setPullOpen(true)}
            className="h-14 px-4 rounded-2xl bg-primary-soft text-primary font-medium flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Download size={18} />
            ดึงเข้าแผน
          </button>
        </div>
      </div>

      <PullIntoPlanSheet
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        tripId={trip.id}
        day={selectedDate}
        onPick={handlePull}
      />

      <ItineraryFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        item={editingItem}
        tripName={trip.name}
        onSave={handleSave}
        onDelete={editingItem ? handleDelete : undefined}
      />
    </div>
  );
}
