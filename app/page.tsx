"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { apiList } from "@/lib/api";
import type { Trip } from "@/lib/models/types";
import { TripCard } from "@/components/TripCard";
import { TripFormSheet } from "@/components/TripFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";

export default function TripListPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => apiList<Trip>("trips").then((t) => setTrips(
    [...t].sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : b.start_date.localeCompare(a.start_date)))));
  useEffect(() => { load(); }, []);

  return (
    <main className="p-4 max-w-3xl mx-auto">
      <header className="flex items-center justify-between h-14">
        <h1 className="font-heading text-[28px] font-bold">ทริปของเรา</h1>
        <button aria-label="สร้างทริป" onClick={() => setOpen(true)}
          className="w-11 h-11 rounded-full bg-primary text-white grid place-items-center cursor-pointer active:scale-[0.92] transition">
          <Plus size={24} />
        </button>
      </header>
      <div className="flex flex-col gap-3 mt-2">
        {trips === null && [1, 2].map((i) => <Skeleton key={i} className="h-[120px]" />)}
        {trips?.map((t) => <TripCard key={t.id} trip={t} />)}
        {trips?.length === 0 && <p className="text-muted text-center py-16">ยังไม่มีทริป — กด + เพื่อเริ่มวางแผน</p>}
      </div>
      <TripFormSheet open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />
    </main>
  );
}
