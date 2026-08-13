import type { Expense, ExpenseSplit } from "./models/types";

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

// Direct pairwise net, computed straight from each pair's own raw unpaid
// splits -- never through a third person. This is what actually backs the
// settle-summary list now (not simplifyDebts below): a settlement row here
// is *by construction* the same number expensesBetween/applyPayment would
// compute for that exact pair, so the QR amount can never diverge from the
// raw line items under it.
//
// simplifyDebts's whole-group minimum-transaction netting is mathematically
// elegant but synthesizes edges between people who may never have directly
// transacted (e.g. A owes B, B owes C -> "simplified" to A owes C) -- fine
// for an abstract "who owes whom" summary, wrong for a feature that
// generates a real PromptPay QR and marks real line items paid, because
// there's no real transaction to point the QR or the paid-lines at. Kept
// below for callers that only need the abstract net, not real payment.
export function pairSettlements(expenses: Expense[]): Settlement[] {
  const EPS = 0.01;
  const pairs = new Map<string, { a: string; b: string; aOwesB: number; bOwesA: number }>();

  for (const e of expenses) {
    if (!e.splits) continue;
    for (const split of e.splits) {
      if (split.name === e.payer || split.paid) continue;
      const debtor = split.name;
      const creditor = e.payer;
      const [a, b] = [debtor, creditor].sort();
      // JSON.stringify, not a joined string -- names are free text and can
      // contain spaces (e.g. "John Smith"), so a plain `${a} ${b}` key can
      // collide between two genuinely different pairs and silently merge
      // their balances.
      const key = JSON.stringify([a, b]);
      const entry = pairs.get(key) ?? { a, b, aOwesB: 0, bOwesA: 0 };
      if (debtor === a) entry.aOwesB += split.amount_thb;
      else entry.bOwesA += split.amount_thb;
      pairs.set(key, entry);
    }
  }

  const settlements: Settlement[] = [];
  for (const { a, b, aOwesB, bOwesA } of pairs.values()) {
    const net = r2(aOwesB - bOwesA);
    if (net > EPS) settlements.push({ from: a, to: b, amount: net });
    else if (net < -EPS) settlements.push({ from: b, to: a, amount: -net });
  }
  return settlements;
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
// Settlement. Backs pairSettlements directly -- summing this pair's own
// unpaid lines is exactly how pairSettlements computes that row's amount,
// so the two are always consistent by construction, including with 3+
// people in the trip.
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
        id: e.id, description: e.description, category: e.category,
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

// Called when an already-split expense's amount or payer is about to be
// edited. A split's amount_thb and its "owes the payer" meaning both go
// stale the moment either changes, and now that a split can be `paid` with
// a real PromptPay transfer behind it, that staleness isn't just cosmetic:
//
// - Any split already paid blocks the edit outright (`blocked: true`) --
//   there's no safe way to silently rewrite the amount or recipient of a
//   transfer that already happened.
// - A payer change clears all splits (`owes the payer` has no meaning
//   under a different payer) -- the caller re-splits the expense fresh.
// - An amount-only change rescales every unpaid split proportionally, so
//   e.g. a 50/50 split stays 50/50 against the new total instead of
//   silently drifting the payer's own (unstored, computed) share.
export function reconcileSplitsOnEdit(
  splits: ExpenseSplit[],
  oldAmountThb: number,
  newAmountThb: number,
  payerChanged: boolean,
): { splits: ExpenseSplit[]; blocked: boolean } {
  if (splits.length === 0) return { splits, blocked: false };
  if (splits.some((s) => s.paid)) return { splits, blocked: true };
  if (payerChanged) return { splits: [], blocked: false };
  if (oldAmountThb <= 0 || newAmountThb === oldAmountThb) return { splits, blocked: false };
  const scale = newAmountThb / oldAmountThb;
  return { splits: splits.map((s) => ({ ...s, amount_thb: r2(s.amount_thb * scale) })), blocked: false };
}
