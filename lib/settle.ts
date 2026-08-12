import type { Expense } from "./models/types";

export interface Settlement { from: string; to: string; amount: number; }
export interface SettlementLine {
  id: string; description: string; category: string; datetime: string; amount_thb: number;
  from: string; to: string; key: string; paid: boolean; paid_slip_photo_ids: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Positive balance = owed money (net creditor), negative = owes money (net debtor).
// Only expenses with splits touch balances at all — everything else nets to 0 and
// stays out of settlement entirely, matching "no split unless explicitly tagged."
// A split marked paid is done -- it no longer counts toward what's outstanding, so a
// pair with every split paid drops out of the settlement list on its own, no separate
// "fully settled" flag to track.
export function netBalances(expenses: Expense[]): Record<string, number> {
  const balances: Record<string, number> = {};
  const add = (name: string, delta: number) => { balances[name] = r2((balances[name] ?? 0) + delta); };

  for (const e of expenses) {
    if (!e.splits || e.splits.length === 0) continue;
    for (const split of e.splits) {
      if (split.name === e.payer || split.paid) continue;
      add(e.payer, split.amount_thb);
      add(split.name, -split.amount_thb);
    }
  }
  return balances;
}

// Greedy minimum-transaction settlement: repeatedly match the largest creditor
// against the largest debtor, settle the smaller of the two, repeat. Generalizes
// past 2 people instead of just listing everyone's raw net.
export function simplifyDebts(balances: Record<string, number>): Settlement[] {
  const EPS = 0.01;
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > EPS)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -EPS)
    .map(([name, amount]) => ({ name, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = r2(Math.min(c.amount, d.amount));
    if (amount > EPS) settlements.push({ from: d.name, to: c.name, amount });
    c.amount = r2(c.amount - amount);
    d.amount = r2(d.amount - amount);
    if (c.amount <= EPS) ci += 1;
    if (d.amount <= EPS) di += 1;
  }
  return settlements;
}

// Raw underlying transactions between exactly two people, either direction,
// for the "what/when" drill-down under a settlement row. `from` is always
// the debtor and `to` the creditor for that one line, same convention as
// Settlement — direct and correct for 2-person trips; for 3+ it shows every
// expense that actually moved money between this specific pair, which is
// still meaningful even though the settlement total above is netted through
// simplifyDebts.
//
// Includes paid lines too (unlike netBalances, which skips them) -- the
// drill-down needs to render already-settled lines struck through, not just
// what's still outstanding. `key` is stable across re-renders (split order
// within an expense never changes) so the UI can address one specific split
// for selection and for marking paid.
export function expensesBetween(expenses: Expense[], a: string, b: string): SettlementLine[] {
  const lines: SettlementLine[] = [];
  for (const e of expenses) {
    if (!e.splits || e.splits.length === 0) continue;
    e.splits.forEach((split, i) => {
      if (split.name === e.payer) return;
      const isAB = e.payer === a && split.name === b;
      const isBA = e.payer === b && split.name === a;
      if (!isAB && !isBA) return;
      lines.push({
        id: e.id, description: e.description || e.category, category: e.category,
        datetime: e.datetime, amount_thb: split.amount_thb,
        from: isAB ? b : a, to: isAB ? a : b,
        key: `${e.id}:${i}`, paid: split.paid, paid_slip_photo_ids: split.paid_slip_photo_ids,
      });
    });
  }
  return lines.sort((x, y) => x.datetime.localeCompare(y.datetime));
}

// Marks the splits addressed by `keys` (the `expenseId:splitIndex` form from
// expensesBetween) as paid, all sharing the same `photoIds` array -- that
// shared-by-value array is the only thing tying multiple splits to "one
// slip covered these," no separate payment/settlement record. Returns only
// the Expense objects that actually changed, ready for the caller to
// apiUpdate one by one.
export function applyPayment(expenses: Expense[], keys: string[], photoIds: string[]): Expense[] {
  const keySet = new Set(keys);
  const changed: Expense[] = [];
  for (const e of expenses) {
    if (!e.splits || e.splits.length === 0) continue;
    let touched = false;
    const splits = e.splits.map((s, i) => {
      if (!keySet.has(`${e.id}:${i}`)) return s;
      touched = true;
      return { ...s, paid: true, paid_slip_photo_ids: photoIds };
    });
    if (touched) changed.push({ ...e, splits });
  }
  return changed;
}

// Every paid split (trip-wide) whose paid_slip_photo_ids overlaps the given
// photo ids -- "what else did this slip cover." Includes the line the
// caller is already looking at; callers filter that one out by key.
export function splitsSharingSlip(
  expenses: Expense[],
  photoIds: string[],
): { key: string; description: string; amount_thb: number }[] {
  if (photoIds.length === 0) return [];
  const idSet = new Set(photoIds);
  const out: { key: string; description: string; amount_thb: number }[] = [];
  for (const e of expenses) {
    if (!e.splits) continue;
    e.splits.forEach((s, i) => {
      if (!s.paid || !s.paid_slip_photo_ids.some((id) => idSet.has(id))) return;
      out.push({ key: `${e.id}:${i}`, description: e.description || e.category, amount_thb: s.amount_thb });
    });
  }
  return out;
}
