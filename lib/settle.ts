import type { Expense } from "./models/types";

export interface Settlement { from: string; to: string; amount: number; }
export interface SettlementLine { id: string; description: string; category: string; datetime: string; amount_thb: number; from: string; to: string; }

const r2 = (n: number) => Math.round(n * 100) / 100;

// Positive balance = owed money (net creditor), negative = owes money (net debtor).
// Only expenses with splits touch balances at all — everything else nets to 0 and
// stays out of settlement entirely, matching "no split unless explicitly tagged."
export function netBalances(expenses: Expense[]): Record<string, number> {
  const balances: Record<string, number> = {};
  const add = (name: string, delta: number) => { balances[name] = r2((balances[name] ?? 0) + delta); };

  for (const e of expenses) {
    if (!e.splits || e.splits.length === 0) continue;
    for (const split of e.splits) {
      if (split.name === e.payer) continue;
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
export function expensesBetween(expenses: Expense[], a: string, b: string): SettlementLine[] {
  const lines: SettlementLine[] = [];
  for (const e of expenses) {
    if (!e.splits || e.splits.length === 0) continue;
    for (const split of e.splits) {
      if (split.name === e.payer) continue;
      const isAB = e.payer === a && split.name === b;
      const isBA = e.payer === b && split.name === a;
      if (!isAB && !isBA) continue;
      lines.push({
        id: e.id, description: e.description || e.category, category: e.category,
        datetime: e.datetime, amount_thb: split.amount_thb,
        from: isAB ? b : a, to: isAB ? a : b,
      });
    }
  }
  return lines.sort((x, y) => x.datetime.localeCompare(y.datetime));
}
