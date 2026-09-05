"use client";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { useTripData } from "@/lib/use-trip-data";
import { selectPendingExpenses } from "@/lib/pending-expense";

// Visible in the same header icon row on every trip page (not just money),
// so a captured-but-unfilled slip stays a nagging reminder wherever you are
// in the app, not just when you happen to open the money tab.
export function PendingExpenseButton({ tripId }: { tripId: string }) {
  const { expenses } = useTripData();
  const count = selectPendingExpenses(expenses).length;

  return (
    <Link
      href={`/trips/${tripId}/money`}
      aria-label="รายการรอกรอกข้อมูล"
      className="relative h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-primary/8 active:scale-90 transition-transform cursor-pointer"
    >
      <Wallet size={20} />
      {count > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-warning text-white text-[10px] font-semibold flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
