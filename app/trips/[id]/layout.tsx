"use client";
import { use, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { TripProvider, useTrip } from "@/lib/trip-context";
import { TripDataProvider } from "@/lib/use-trip-data";
import { TabBar } from "@/components/TabBar";
import { QuickExpenseSheet } from "@/components/QuickExpenseSheet";
import { Toaster } from "@/components/ui/Toast";

function TripLayoutInner({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const { trip } = useTrip();
  const [fabOpen, setFabOpen] = useState(false);
  const path = usePathname();

  // Mounted here (not per-page) so it survives tab switches within a trip —
  // switching itinerary/transport/money/info no longer refetches from
  // Google Sheets, every page just reads this same already-loaded state.
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
      <AnimatePresence mode="wait">
        <motion.main
          key={path}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="pb-24"
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <TabBar tripId={tripId} onFab={() => setFabOpen(true)} />
      <QuickExpenseSheet trip={trip} open={fabOpen} onClose={() => setFabOpen(false)} />
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
      <TripLayoutInner tripId={id}>{children}</TripLayoutInner>
    </TripProvider>
  );
}
