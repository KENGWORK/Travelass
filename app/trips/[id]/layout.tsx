"use client";
import { use, useState } from "react";
import { TripProvider, useTrip } from "@/lib/trip-context";
import { TabBar } from "@/components/TabBar";
import { QuickExpenseSheet } from "@/components/QuickExpenseSheet";
import { Toaster } from "@/components/ui/Toast";
import { notifyTripDataChanged } from "@/lib/use-trip-data";

function TripLayoutInner({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const { trip } = useTrip();
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <>
      <main className="pb-24">{children}</main>
      <TabBar tripId={tripId} onFab={() => setFabOpen(true)} />
      <QuickExpenseSheet
        trip={trip}
        open={fabOpen}
        onClose={() => setFabOpen(false)}
        onSaved={() => notifyTripDataChanged()}
      />
      <Toaster />
    </>
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
      <TripLayoutInner tripId={id}>{children}</TripLayoutInner>
    </TripProvider>
  );
}
