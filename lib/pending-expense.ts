import type { Expense } from "./models/types";

// A slip photo captured from the FAB, before anyone has typed an amount --
// saved immediately as a real (if incomplete) expense row so the photo is
// never lost, then completed later from the pending-expense queue via
// ExpenseEditSheet.
export function buildPendingExpense(params: {
  id: string;
  tripId: string;
  photoId: string;
  currency: string;
  now: string;
  description?: string;
}): Expense {
  return {
    id: params.id,
    trip_id: params.tripId,
    datetime: params.now,
    category: "อื่นๆ",
    description: params.description ?? "",
    amount: 0,
    currency: params.currency,
    fx_rate: 1,
    amount_thb: 0,
    payer: "",
    slip_photo_ids: [params.photoId],
    splits: [],
    pending: true,
  };
}

// Newest-captured first, so the most recent slip (the one someone's most
// likely mid-trip about) surfaces at the top of the queue.
export function selectPendingExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => e.pending).sort((a, b) => b.datetime.localeCompare(a.datetime));
}
