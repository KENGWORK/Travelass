"use client";
import { useEffect, useState } from "react";
import { Reorder } from "framer-motion";
import { MapPin, Plus, Download, CalendarDays } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiCreate, apiUpdate, apiDelete } from "@/lib/api";
import { tripDays } from "@/lib/days";
import { formatTimeRange } from "@/lib/time";
import { DayChips } from "@/components/DayChips";
import { ItineraryFormSheet, type ItineraryFormValues } from "@/components/ItineraryFormSheet";
import { PullIntoPlanSheet } from "@/components/PullIntoPlanSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
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
  const { itinerary, transports, loading, reload } = useTripData(trip.id);

  const [selectedDate, setSelectedDate] = useState(() => initialSelectedDate(trip.start_date, trip.end_date));
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

  const persistOrder = async (newItems: ItineraryItem[]) => {
    const changed = newItems.filter((it, idx) => it.sort_order !== idx);
    if (changed.length === 0) return;
    await Promise.all(
      newItems.map((it, idx) =>
        it.sort_order === idx ? Promise.resolve() : apiUpdate<ItineraryItem>("itinerary", it.id, { ...it, sort_order: idx })
      )
    );
    await reload();
  };

  const openCreate = () => {
    setEditingItem(null);
    setSheetOpen(true);
  };

  const openEdit = (item: ItineraryItem) => {
    setEditingItem(item);
    setSheetOpen(true);
  };

  const handleSave = async (values: ItineraryFormValues) => {
    if (editingItem) {
      await apiUpdate<ItineraryItem>("itinerary", editingItem.id, { ...editingItem, ...values });
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
      await apiCreate<ItineraryItem>("itinerary", newItem);
    }
    await reload();
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    await apiDelete("itinerary", editingItem.id);
    setSheetOpen(false);
    toast("ลบแล้ว");
    await reload();
  };

  const handlePull = async (item: ItineraryItem) => {
    await apiCreate<ItineraryItem>("itinerary", { ...item, day_date: selectedDate, sort_order: items.length });
    toast("เพิ่มเข้าแผนแล้ว");
    await reload();
  };

  const days = tripDays(trip.start_date, trip.end_date);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-4">
        <h1 className="font-heading text-xl font-semibold pt-4">แผนการเดินทาง</h1>
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
          <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col gap-4 list-none">
            {items.map((item) => {
              const transport = item.linked_transport_id
                ? transports.find((t) => t.id === item.linked_transport_id)
                : undefined;
              const Icon = transport ? transportIcon(transport.mode) : null;

              return (
                <Reorder.Item
                  key={item.id}
                  value={item}
                  onDragEnd={() => persistOrder(items)}
                  className="relative pl-6 cursor-grab active:cursor-grabbing before:content-[''] before:absolute before:left-[7px] before:top-5 before:bottom-[-16px] before:w-px before:bg-muted/30 last:before:hidden"
                >
                  <span className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-primary border-2 border-bg" />
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="press w-full text-left rounded-2xl bg-surface shadow-card p-3 flex flex-col gap-1 cursor-pointer"
                  >
                    {item.time && <p className="text-xs text-muted">{formatTimeRange(item.time, item.end_time)}</p>}
                    <p className="text-base font-medium">{item.title}</p>
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
                  </button>
                </Reorder.Item>
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
        onSave={handleSave}
        onDelete={editingItem ? handleDelete : undefined}
      />
    </div>
  );
}
