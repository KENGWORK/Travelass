# Split expenses + settlement summary

## Context

TravelAss's `Expense` currently has one `payer` field — whoever fronted the money.
There's no way to record that a purchase should be split, or that the payer covered
part of it on someone else's behalf. Two real scenarios from the user:

1. **Even split** — a shared cost (e.g. a meal for two) that divides cleanly.
2. **Uneven split** — one person pays for a purchase containing items that belong to
   different people at different prices (e.g. two different toys at Miniso), and needs
   to get reimbursed the exact uneven amount later — no separate mental math outside
   the app.

No money moves mid-trip. This only needs to produce an accurate "who owes whom, how
much" summary, settled once at the end of the trip.

## Data model

Add to `Expense` (`lib/models/types.ts`):

```ts
export interface ExpenseSplit { name: string; amount_thb: number; }
export interface Expense {
  ...
  splits: ExpenseSplit[]; // empty = not split, payer bore 100% (today's behavior)
}
```

`name` matches the same free-text convention `payer` already uses everywhere in this
codebase (no member-id foreign keys elsewhere) — a split entry means that person owes
`payer` `amount_thb` for this expense. The payer's own share is never stored — it's
always `expense.amount_thb - sum(splits)`, so the numbers can't drift out of sync.

Existing expenses have no `splits` field; treated as `[]` (fully backward compatible,
zero data migration).

Scope: **`Expense` only.** `Booking`/`Transport` keep their single `payer`, unchanged.

## Entry UI — QuickExpenseSheet, "บันทึกรายจ่าย" mode

Type the total on the keypad as today. A new **"หารเงิน"** toggle button appears below
the readout. Off by default (`splits: []`, current behavior exactly). Tapping it opens
a choice between two split modes:

### หารเท่า (equal)
- Member chips (multi-select, from the trip's `Member` list) — pick who's *in* the
  split. Not required to be everyone.
- Each selected person's share = `amount_thb / N`, **rounded up** to the nearest satang.
- The payer is never in this chip list — their share is the remainder:
  `amount_thb - sum(others rounded up)`. This is where the rounding "loses" money,
  intentionally onto the payer, never onto anyone being asked to pay back more than a
  clean number.

### หารตามรายการ (itemized)
- List-builder: add unlimited rows, each `{ label, amount, owner }` where owner is
  picked from the Member list (never the payer — the payer's row doesn't exist, see
  below).
- Running total of rows shown live.
- Save is **blocked** (red inline error) if `sum(rows) > amount_thb` — the total on the
  keypad is the source of truth here and acts as a built-in recheck: if the items you
  itemized add up to more than what you actually paid, something's mis-entered.
- The payer's own share = `amount_thb - sum(rows)`, computed, never typed.

Either mode produces the same `ExpenseSplit[]` shape on save. The existing payer dial
is untouched — it answers "who fronted the cash," independent of who the split says
owes what.

## Settlement summary — money page

Fourth tab on the segmented control (`รายคน` / `รายวัน` / `ทั้งทริป` / **`สรุปหนี้`**).
Always whole-trip scope (debt is not a per-day concept) — selecting it hides the
day/all date-scoped content (donut, category chips, spend list, big total) entirely
and shows only the settlement view.

**Computation** (`lib/settle.ts`, new file):
1. `netBalances(expenses)` — walk every expense with `splits.length > 0`; for each
   split entry, the payer's net balance increases by that amount and the named
   person's net balance decreases by it. Everything else nets to 0 automatically
   (expenses with no splits don't touch balances at all).
2. `simplifyDebts(balances)` — greedy minimum-transaction settlement: repeatedly match
   the largest creditor against the largest debtor, settle the smaller of the two
   amounts, repeat until all balances are ~0. Returns `{ from, to, amount }[]`. This
   generalizes past 2 people — a 3+ person trip gets a real minimum-transaction
   settlement, not just "everyone's raw net."

**Display**: one row per settlement pair — "โอควรโอนให้เก่ง ฿300" — money-styled amount,
member-colored initials (same avatar treatment as `PersonSpendList`). Empty state
("ไม่มีรายจ่ายที่ต้องหารกัน") when no expense has splits yet.

## Non-goals

- No "mark as settled" / repayment-tracking flow — this is a read-only summary
  computed from existing data, not a new ledger.
- No splitting for Booking/Transport.
- No changes to how `payer`, `amount_thb`, or any existing expense field behaves when
  `splits` is empty — this is additive only.
