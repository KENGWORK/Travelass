"use client";
import Link from "next/link";
import { useTripData } from "@/lib/use-trip-data";
import { selectPendingExpenses } from "@/lib/pending-expense";

function BasketIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.41442 6H3.75V4.5H6.58558L7.33558 7.5H18.935L17.2321 15.1627L16.5 15.75H8.25L7.51786 15.1627L6.02 8.42233L5.41442 6ZM7.68496 9L8.85163 14.25H15.8984L17.065 9H7.68496ZM10.5 18C10.5 18.8284 9.82843 19.5 9 19.5C8.17157 19.5 7.5 18.8284 7.5 18C7.5 17.1716 8.17157 16.5 9 16.5C9.82843 16.5 10.5 17.1716 10.5 18ZM15 19.5C15.8284 19.5 16.5 18.8284 16.5 18C16.5 17.1716 15.8284 16.5 15 16.5C14.1716 16.5 13.5 17.1716 13.5 18C13.5 18.8284 14.1716 19.5 15 19.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

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
      <BasketIcon />
      {count > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-warning text-white text-[10px] font-semibold flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
