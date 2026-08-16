"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  CalendarDays,
  Navigation,
  Briefcase,
  Wallet,
  CheckSquare,
  BookOpen,
  Info,
  UtensilsCrossed,
  Star,
  Smartphone,
  Link2,
  ShoppingBag,
  Languages,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { apiList } from "@/lib/api";
import type {
  ItineraryItem,
  Transport,
  Booking,
  Expense,
  ChecklistItem,
  Note,
  QuickInfo,
  Restaurant,
  WishItem,
  TripApp,
  LinkItem,
  ShopItem,
  Phrase,
  QuickNote,
} from "@/lib/models/types";

interface Result {
  id: string;
  typeLabel: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  path: string;
}

const TYPE_ORDER = [
  "แผนเดินทาง",
  "การเดินทาง",
  "การจอง",
  "ค่าใช้จ่าย",
  "เช็คลิสต์",
  "ข้อมูลด่วน",
  "ไดอารี่",
  "โน้ต",
  "ร้านอาหาร",
  "ที่อยากไป",
  "แอพ",
  "ลิงก์",
  "ของฝาก",
  "ภาษา",
];

function norm(s: string): string {
  return s.toLowerCase();
}

function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const q = norm(query);
  return fields.some((f) => f && norm(f).includes(q));
}

export function SearchSheet({ open, onClose, tripId }: { open: boolean; onClose: () => void; tripId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{
    itinerary: ItineraryItem[];
    transports: Transport[];
    bookings: Booking[];
    expenses: Expense[];
    checklist: ChecklistItem[];
    notes: Note[];
    quickinfo: QuickInfo[];
    restaurants: Restaurant[];
    wishlist: WishItem[];
    apps: TripApp[];
    links: LinkItem[];
    shopping: ShopItem[];
    phrases: Phrase[];
    quicknotes: QuickNote[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLoaded(false);
    Promise.all([
      apiList<ItineraryItem>("itinerary", tripId),
      apiList<Transport>("transports", tripId),
      apiList<Booking>("bookings", tripId),
      apiList<Expense>("expenses", tripId),
      apiList<ChecklistItem>("checklist", tripId),
      apiList<Note>("notes", tripId),
      apiList<QuickInfo>("quickinfo", tripId),
      apiList<Restaurant>("restaurants", tripId),
      apiList<WishItem>("wishlist", tripId),
      apiList<TripApp>("apps", tripId),
      apiList<LinkItem>("links", tripId),
      apiList<ShopItem>("shopping", tripId),
      apiList<Phrase>("phrases", tripId),
      apiList<QuickNote>("quicknotes", tripId),
    ]).then(([itinerary, transports, bookings, expenses, checklist, notes, quickinfo, restaurants, wishlist, apps, links, shopping, phrases, quicknotes]) => {
      setData({ itinerary, transports, bookings, expenses, checklist, notes, quickinfo, restaurants, wishlist, apps, links, shopping, phrases, quicknotes });
      setLoaded(true);
    });
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, tripId]);

  if (!open) return null;

  const results: Result[] = [];
  if (data && query.trim()) {
    data.itinerary.forEach((it) => {
      if (matches(query, it.title, it.place, it.notes)) {
        results.push({
          id: it.id,
          typeLabel: "แผนเดินทาง",
          icon: CalendarDays,
          title: it.title,
          subtitle: it.place,
          path: `/trips/${tripId}/itinerary?day=${it.day_date}`,
        });
      }
    });
    data.transports.forEach((t) => {
      if (matches(query, t.from, t.to, t.mode, t.notes, t.alt_option)) {
        results.push({
          id: t.id,
          typeLabel: "การเดินทาง",
          icon: Navigation,
          title: `${t.from} → ${t.to}`,
          subtitle: t.mode,
          path: `/trips/${tripId}/transport`,
        });
      }
    });
    data.bookings.forEach((b) => {
      if (matches(query, b.vendor, b.ref_no, b.detail, b.notes)) {
        results.push({
          id: b.id,
          typeLabel: "การจอง",
          icon: Briefcase,
          title: b.vendor,
          subtitle: b.ref_no || b.detail,
          path: `/trips/${tripId}/bookings`,
        });
      }
    });
    data.expenses.forEach((e) => {
      if (matches(query, e.description, e.category)) {
        results.push({
          id: e.id,
          typeLabel: "ค่าใช้จ่าย",
          icon: Wallet,
          title: e.description || e.category,
          subtitle: e.category,
          path: `/trips/${tripId}/money`,
        });
      }
    });
    data.checklist.forEach((c) => {
      if (matches(query, c.item, c.group)) {
        results.push({
          id: c.id,
          typeLabel: "เช็คลิสต์",
          icon: CheckSquare,
          title: c.item,
          subtitle: c.group,
          path: `/trips/${tripId}/checklist`,
        });
      }
    });
    data.quickinfo.forEach((q) => {
      if (matches(query, q.label, q.value)) {
        results.push({
          id: q.id,
          typeLabel: "ข้อมูลด่วน",
          icon: Info,
          title: q.label,
          subtitle: q.value,
          path: `/trips/${tripId}/info?tab=quickinfo`,
        });
      }
    });
    data.notes.forEach((n) => {
      if (matches(query, n.text)) {
        results.push({
          id: n.id,
          typeLabel: "ไดอารี่",
          icon: BookOpen,
          title: n.text.slice(0, 40),
          subtitle: n.date,
          path: `/trips/${tripId}/info?tab=diary`,
        });
      }
    });
    data.quicknotes.forEach((n) => {
      if (matches(query, n.title, n.content)) {
        results.push({
          id: n.id,
          typeLabel: "โน้ต",
          icon: StickyNote,
          title: n.title || n.content.slice(0, 40),
          subtitle: n.title ? n.content.slice(0, 60) : "",
          path: `/trips/${tripId}/info?tab=quicknotes`,
        });
      }
    });
    data.restaurants.forEach((r) => {
      if (matches(query, r.name, r.area, r.note)) {
        results.push({
          id: r.id,
          typeLabel: "ร้านอาหาร",
          icon: UtensilsCrossed,
          title: r.name,
          subtitle: r.area,
          path: `/trips/${tripId}/info?tab=restaurants`,
        });
      }
    });
    data.wishlist.forEach((w) => {
      if (matches(query, w.name, w.area, w.note)) {
        results.push({
          id: w.id,
          typeLabel: "ที่อยากไป",
          icon: Star,
          title: w.name,
          subtitle: w.area,
          path: `/trips/${tripId}/info?tab=wishlist`,
        });
      }
    });
    data.apps.forEach((a) => {
      if (matches(query, a.name, a.purpose)) {
        results.push({
          id: a.id,
          typeLabel: "แอพ",
          icon: Smartphone,
          title: a.name,
          subtitle: a.purpose,
          path: `/trips/${tripId}/info?tab=apps`,
        });
      }
    });
    data.links.forEach((l) => {
      if (matches(query, l.title, l.note)) {
        results.push({
          id: l.id,
          typeLabel: "ลิงก์",
          icon: Link2,
          title: l.title,
          subtitle: l.note,
          path: `/trips/${tripId}/info?tab=links`,
        });
      }
    });
    data.shopping.forEach((s) => {
      if (matches(query, s.item, s.for_whom)) {
        results.push({
          id: s.id,
          typeLabel: "ของฝาก",
          icon: ShoppingBag,
          title: s.item,
          subtitle: s.for_whom,
          path: `/trips/${tripId}/info?tab=shopping`,
        });
      }
    });
    data.phrases.forEach((p) => {
      if (matches(query, p.text, p.pronunciation, p.meaning)) {
        results.push({
          id: p.id,
          typeLabel: "ภาษา",
          icon: Languages,
          title: p.text,
          subtitle: p.meaning,
          path: `/trips/${tripId}/info?tab=phrases`,
        });
      }
    });
  }

  const grouped = TYPE_ORDER.map((label) => ({ label, items: results.filter((r) => r.typeLabel === label) })).filter(
    (g) => g.items.length > 0,
  );

  const go = (path: string) => {
    onClose();
    router.push(path);
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col">
      <div className="shrink-0 flex items-center gap-2 h-14 px-3 border-b border-muted/15">
        <Search size={18} className="text-muted shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาทุกอย่างในทริปนี้..."
          className="flex-1 bg-transparent outline-none text-base"
        />
        <button
          type="button"
          aria-label="ปิด"
          onClick={onClose}
          className="h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!query.trim() && <p className="text-sm text-muted text-center mt-8">พิมพ์เพื่อค้นหาแผน, การจอง, ค่าใช้จ่าย, เช็คลิสต์ ฯลฯ</p>}
        {query.trim() && !loaded && <p className="text-sm text-muted text-center mt-8">กำลังค้นหา...</p>}
        {query.trim() && loaded && grouped.length === 0 && (
          <p className="text-sm text-muted text-center mt-8">ไม่พบผลลัพธ์สำหรับ &quot;{query}&quot;</p>
        )}
        <div className="flex flex-col gap-4">
          {grouped.map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <p className="text-xs text-muted font-medium px-1">{g.label}</p>
              <div className="flex flex-col gap-2">
                {g.items.map((r) => {
                  const Icon = r.icon;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => go(r.path)}
                      className="press w-full text-left rounded-2xl bg-surface shadow-card p-3 flex items-center gap-3 cursor-pointer"
                    >
                      <span className="h-9 w-9 shrink-0 rounded-full bg-primary-soft text-primary grid place-items-center">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium truncate">{r.title || "(ไม่มีชื่อ)"}</span>
                        {r.subtitle && <span className="block text-sm text-muted truncate">{r.subtitle}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
