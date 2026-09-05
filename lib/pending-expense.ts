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
  // Who captured the slip -- shown as a colored highlight on the pending
  // queue's thumbnail so a shared trip can tell whose draft is whose at a
  // glance. Optional: capturing a slip shouldn't be blocked on picking a
  // name, so this stays "" (uncolored) until set.
  payer?: string;
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
    payer: params.payer ?? "",
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
