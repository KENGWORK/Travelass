"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiList } from "@/lib/api";
import { QuickInfoSection } from "@/components/QuickInfoSection";
import { DiarySection } from "@/components/DiarySection";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Note, QuickInfo } from "@/lib/models/types";

const TABS = [
  { key: "quickinfo", label: "ข้อมูลด่วน" },
  { key: "diary", label: "ไดอารี่" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function InfoPage() {
  const { trip } = useTrip();
  const { bookings, transports, loading: tripDataLoading } = useTripData(trip.id);
  const [tab, setTab] = useState<TabKey>("quickinfo");

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);

  const [quickInfo, setQuickInfo] = useState<QuickInfo[]>([]);
  const [quickInfoLoading, setQuickInfoLoading] = useState(true);

  // Notes are fetched once and handed off to DiarySection, which owns all further
  // reads/writes for the diary text itself (see DiarySection for why: refetching here on
  // every quick-info save would risk clobbering in-progress typing state).
  useEffect(() => {
    let cancelled = false;
    apiList<Note>("notes", trip.id).then((list) => {
      if (!cancelled) {
        setNotes(list);
        setNotesLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const reloadQuickInfo = async () => {
    setQuickInfoLoading(true);
    const list = await apiList<QuickInfo>("quickinfo", trip.id);
    setQuickInfo(list);
    setQuickInfoLoading(false);
  };

  useEffect(() => {
    reloadQuickInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const activeIndex = TABS.findIndex((t) => t.key === tab);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-4 pt-4 flex flex-col gap-3">
        <h1 className="font-heading text-xl font-semibold">ข้อมูล</h1>
        <div className="relative h-11 grid grid-cols-2 rounded-full bg-muted/10 p-0.5">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="relative h-full rounded-full text-sm font-medium cursor-pointer flex items-center justify-center"
            >
              {activeIndex === i && (
                <motion.div
                  layoutId="info-segment"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: "spring", duration: 0.2 }}
                />
              )}
              <span className={`relative z-10 ${activeIndex === i ? "text-white" : "text-muted"}`}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        {tab === "quickinfo" ? (
          <QuickInfoSection
            trip={trip}
            bookings={bookings}
            transports={transports}
            quickInfo={quickInfo}
            loading={quickInfoLoading || tripDataLoading}
            reload={reloadQuickInfo}
          />
        ) : notesLoaded ? (
          <DiarySection trip={trip} initialNotes={notes} />
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        )}
      </div>
    </div>
  );
}
