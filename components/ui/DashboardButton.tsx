"use client";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

export function DashboardButton({ tripId }: { tripId: string }) {
  return (
    <Link
      href={`/trips/${tripId}`}
      aria-label="ไปหน้า Dashboard ทริป"
      className="relative h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-primary/8 active:scale-90 transition-transform cursor-pointer"
    >
      <LayoutDashboard size={20} />
    </Link>
  );
}
