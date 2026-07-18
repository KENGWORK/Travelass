"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTrip } from "@/lib/trip-context";
import { useTripData } from "@/lib/use-trip-data";
import { apiList } from "@/lib/api";
import { QuickInfoSection } from "@/components/QuickInfoSection";
import { DiarySection } from "@/components/DiarySection";
import { InfoListSection, type InfoField } from "@/components/InfoListSection";
import { PhraseSection } from "@/components/PhraseSection";
import { Skeleton } from "@/components/ui/Skeleton";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { SearchButton } from "@/components/ui/SearchButton";
import type { Note, QuickInfo } from "@/lib/models/types";

const TABS = [
  { key: "quickinfo", label: "ข้อมูลด่วน" },
  { key: "restaurants", label: "ร้านอาหาร" },
  { key: "wishlist", label: "ที่อยากไป" },
  { key: "apps", label: "แอพ" },
  { key: "links", label: "ลิงก์" },
  { key: "shopping", label: "ของฝาก" },
  { key: "phrases", label: "ภาษา" },
  { key: "diary", label: "ไดอารี่" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const FIELDS: Record<string, InfoField[]> = {
  restaurants: [
    { key: "name", label: "ชื่อร้าน", type: "text", primary: true, placeholder: "เช่น ร้านปิ้งย่าง" },
    { key: "area", label: "โซน / ย่าน", type: "text", placeholder: "เช่น มยองดง" },
    { key: "maps_link", label: "ลิงก์แผนที่", type: "url", placeholder: "https://maps.google.com/..." },
    { key: "note", label: "โน้ต", type: "textarea", placeholder: "เมนูเด็ด, เวลาเปิด" },
    { key: "must_try", label: "ต้องลอง", type: "bool" },
    { key: "price_level", label: "ระดับราคา", type: "price" },
    { key: "visited", label: "ไปแล้ว", type: "bool" },
  ],
  wishlist: [
    { key: "name", label: "ชื่อสถานที่", type: "text", primary: true, placeholder: "เช่น พระราชวัง" },
    { key: "area", label: "โซน / ย่าน", type: "text" },
    { key: "maps_link", label: "ลิงก์แผนที่", type: "url", placeholder: "https://maps.google.com/..." },
    { key: "note", label: "โน้ต", type: "textarea" },
    { key: "star", label: "อยากไปมาก", type: "bool" },
    { key: "visited", label: "ไปแล้ว", type: "bool" },
  ],
  apps: [
    { key: "name", label: "ชื่อแอพ", type: "text", primary: true, placeholder: "เช่น Naver Map" },
    { key: "purpose", label: "ใช้ทำอะไร", type: "text", placeholder: "เช่น แผนที่, แปลภาษา" },
    { key: "url", label: "ลิงก์ดาวน์โหลด", type: "url", placeholder: "https://" },
  ],
  links: [
    { key: "title", label: "หัวข้อ", type: "text", primary: true, placeholder: "เช่น รีวิวเที่ยวโซล" },
    { key: "url", label: "ลิงก์", type: "url", placeholder: "https://" },
    { key: "note", label: "โน้ต", type: "textarea" },
  ],
  shopping: [
    { key: "item", label: "ของ", type: "text", primary: true, placeholder: "เช่น ครีมกันแดด" },
    { key: "for_whom", label: "ให้ใคร", type: "text", placeholder: "เช่น แม่" },
    { key: "price", label: "ราคา", type: "text", placeholder: "~500 บาท" },
    { key: "bought", label: "ซื้อแล้ว", type: "bool" },
  ],
};

const EMPTY_TEXT: Record<string, string> = {
  restaurants: "ยังไม่มีร้าน — เพิ่มร้านที่อยากลอง",
  wishlist: "ยังไม่มีสถานที่ — เพิ่มที่อยากไป",
  apps: "ยังไม่มีแอพ — เพิ่มแอพที่ควรโหลดก่อนไป",
  links: "ยังไม่มีลิงก์ — เก็บรีวิว/แผนที่/คลิปไว้ที่นี่",
  shopping: "ยังไม่มีของฝาก — เพิ่มรายการที่ต้องซื้อ",
};

export default function InfoPage() {
  const { trip } = useTrip();
  const { bookings, transports, loading: tripDataLoading, reload: reloadTripData } = useTripData(trip.id);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "quickinfo",
  );

  // Search results deep-link here with ?tab=..., which can change after this
  // page is already mounted (Next keeps the layout/page instance alive
  // across nav within the same route segment).
  useEffect(() => {
    if (TABS.some((t) => t.key === tabParam)) setTab(tabParam as TabKey);
  }, [tabParam]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [quickInfo, setQuickInfo] = useState<QuickInfo[]>([]);
  const [quickInfoLoading, setQuickInfoLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Refreshes whichever tab-owned data isn't covered by useTripData: quick
  // info + notes here, and a key bump so InfoListSection/DiarySection (which
  // fetch their own tab's entity internally) remount and refetch too.
  const refreshActive = async () => {
    const notesPromise = apiList<Note>("notes", trip.id).then(setNotes);
    await Promise.all([reloadTripData(), reloadQuickInfo(), notesPromise]);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-4 pt-4 flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">ข้อมูล</h1>
        <div className="flex items-center">
          <SearchButton />
          <RefreshButton onRefresh={refreshActive} />
        </div>
      </div>
      <div className="sticky top-12 z-20 bg-bg">
        <div className="flex gap-2 overflow-x-auto px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`h-9 px-4 rounded-full text-sm shrink-0 whitespace-nowrap cursor-pointer ${
                tab === t.key ? "bg-primary text-white" : "bg-muted/10 text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        {tab === "quickinfo" && (
          <QuickInfoSection
            trip={trip}
            bookings={bookings}
            transports={transports}
            quickInfo={quickInfo}
            setQuickInfo={setQuickInfo}
            loading={quickInfoLoading || tripDataLoading}
          />
        )}
        {(["restaurants", "wishlist", "apps", "links", "shopping"] as const).includes(tab as never) && (
          <InfoListSection key={refreshKey} tripId={trip.id} entity={tab as never} fields={FIELDS[tab]} emptyText={EMPTY_TEXT[tab]} />
        )}
        {tab === "phrases" && <PhraseSection key={refreshKey} tripId={trip.id} />}
        {tab === "diary" &&
          (notesLoaded ? (
            <DiarySection key={refreshKey} trip={trip} initialNotes={notes} />
          ) : (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ))}
      </div>
    </div>
  );
}
