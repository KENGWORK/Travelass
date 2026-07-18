"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TripProvider, useTrip } from "@/lib/trip-context";
import { TripDataProvider } from "@/lib/use-trip-data";
import { SearchProvider, useSearch } from "@/lib/search-context";
import { TabBar } from "@/components/TabBar";
import { QuickExpenseSheet } from "@/components/QuickExpenseSheet";
import { SearchSheet } from "@/components/SearchSheet";
import { Toaster } from "@/components/ui/Toast";

function TripLayoutInner({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const { trip } = useTrip();
  const { open: searchOpen, closeSearch } = useSearch();
  const [fabOpen, setFabOpen] = useState(false);

  // TripDataProvider is mounted here (not per-page) so it survives tab
  // switches within a trip — switching itinerary/transport/money/info no
  // longer refetches from Google Sheets, every page reads this cached state.
  // The per-nav enter animation lives in template.tsx (not here) so the
  // router isn't blocked on an exit-wait — see the note there.
  return (
    <TripDataProvider tripId={tripId}>
      <div className="sticky top-0 z-20 flex items-center h-12 px-2 bg-bg/80 backdrop-blur">
        <Link
          href="/"
          aria-label="กลับหน้าทริปทั้งหมด"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text cursor-pointer transition active:scale-95"
        >
          <ArrowLeft size={24} />
        </Link>
      </div>
      {children}
      <TabBar tripId={tripId} onFab={() => setFabOpen(true)} />
      <QuickExpenseSheet trip={trip} open={fabOpen} onClose={() => setFabOpen(false)} />
      <SearchSheet open={searchOpen} onClose={closeSearch} tripId={tripId} />
      <Toaster />
    </TripDataProvider>
  );
}

export default function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <TripProvider tripId={id}>
      <SearchProvider>
        <TripLayoutInner tripId={id}>{children}</TripLayoutInner>
      </SearchProvider>
    </TripProvider>
  );
}
