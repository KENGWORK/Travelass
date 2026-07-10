"use client";
import { use } from "react";
import { TripProvider } from "@/lib/trip-context";
import { TabBar } from "@/components/TabBar";
import { Toaster, toast } from "@/components/ui/Toast";

export default function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const handleFab = () => toast("เร็วๆ นี้");

  return (
    <TripProvider tripId={id}>
      <main className="pb-24">{children}</main>
      <TabBar tripId={id} onFab={handleFab} />
      <Toaster />
    </TripProvider>
  );
}
