import type { Expense, Booking, Transport } from "./models/types";

export interface TripSummary {
  totalTHB: number; prepaidTHB: number; onsiteTHB: number;
  byCategory: Record<string, number>;
  byPayer: Record<string, number>;
  byDay: Record<string, number>;
}

const add = (rec: Record<string, number>, key: string, v: number) => { rec[key] = (rec[key] ?? 0) + v; };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(expenses: Expense[], bookings: Booking[], transports: Transport[]): TripSummary {
  const s: TripSummary = { totalTHB: 0, prepaidTHB: 0, onsiteTHB: 0, byCategory: {}, byPayer: {}, byDay: {} };
  for (const x of expenses) {
    s.totalTHB += x.amount_thb; s.onsiteTHB += x.amount_thb;
    add(s.byCategory, x.category, x.amount_thb);
    add(s.byPayer, x.payer, x.amount_thb);
    add(s.byDay, x.datetime.slice(0, 10), x.amount_thb);
  }
  for (const x of bookings) {
    if (!x.paid) continue;
    s.totalTHB += x.amount_thb;
    x.pay_timing === "prepaid" ? (s.prepaidTHB += x.amount_thb) : (s.onsiteTHB += x.amount_thb);
    add(s.byPayer, x.payer, x.amount_thb);
  }
  for (const x of transports) {
    if (!x.paid) continue;
    s.totalTHB += x.price_thb;
    x.pay_timing === "prepaid" ? (s.prepaidTHB += x.price_thb) : (s.onsiteTHB += x.price_thb);
    add(s.byPayer, x.payer, x.price_thb);
  }
  s.totalTHB = r2(s.totalTHB); s.prepaidTHB = r2(s.prepaidTHB); s.onsiteTHB = r2(s.onsiteTHB);
  return s;
}
