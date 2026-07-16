import type { Expense, Booking, Transport, BookingType, Category } from "./models/types";

// A booking/transport maps onto one of the expense categories so it can live
// in the same donut / day breakdown / list as manual expenses.
export const BOOKING_CATEGORY: Record<BookingType, Category> = {
  flight: "เดินทาง",
  hotel: "ที่พัก",
  car: "เดินทาง",
  activity: "ตั๋ว",
};
const TRANSPORT_CATEGORY: Category = "เดินทาง";

export type SpendSource = "expense" | "booking" | "transport";

// One normalized money line, whatever it came from. Only PAID bookings/
// transports become spend — an unpaid booking is a plan, not an outlay, so
// it stays out of the spend total (the user asked for exactly this).
export interface SpendItem {
  id: string;
  date: string; // YYYY-MM-DD
  category: Category;
  description: string;
  amount_thb: number;
  payer: string;
  source: SpendSource;
  slip_photo_ids: string[];
}

export function toSpendItems(expenses: Expense[], bookings: Booking[], transports: Transport[]): SpendItem[] {
  const items: SpendItem[] = [];

  for (const e of expenses) {
    items.push({
      id: e.id,
      date: e.datetime.slice(0, 10),
      category: e.category,
      description: e.description || e.category,
      amount_thb: e.amount_thb,
      payer: e.payer,
      source: "expense",
      slip_photo_ids: e.slip_photo_ids,
    });
  }

  for (const b of bookings) {
    if (!b.paid) continue;
    items.push({
      id: b.id,
      date: b.date_from.slice(0, 10),
      category: BOOKING_CATEGORY[b.type],
      description: b.vendor || b.detail || b.type,
      amount_thb: b.amount_thb,
      payer: b.payer,
      source: "booking",
      slip_photo_ids: b.slip_photo_ids,
    });
  }

  for (const t of transports) {
    if (!t.paid) continue;
    items.push({
      id: t.id,
      date: t.day_date,
      category: TRANSPORT_CATEGORY,
      description: t.from && t.to ? `${t.from} → ${t.to}` : t.from || t.to || "เดินทาง",
      amount_thb: t.price_thb,
      payer: t.payer,
      source: "transport",
      slip_photo_ids: t.slip_photo_ids,
    });
  }

  return items;
}
