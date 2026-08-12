# PromptPay repayment + per-line settle tracking

## Context

`docs/superpowers/specs/2026-08-05-expense-splitting-design.md` added splits and a
read-only "สรุปหนี้" (settle summary) tab — it computes who owes whom but has no way to
record that a debt was actually paid. The user wants the settle-up step itself in the
app: tap a debt line, scan a PromptPay QR to transfer, upload the transfer slip, and
mark it paid — with a clear paid/unpaid visual state per line.

## Data model

Add to `Member` (`lib/models/types.ts`):

```ts
export interface Member { id: string; trip_id: string; name: string; color: string; promptpay_id: string; }
```

`promptpay_id` is free-text (phone number or citizen ID, however the user types it) —
`lib/promptpay.ts` (new) normalizes it before generating a QR payload. Mapper
(`lib/models/mappers.ts`) gains one column: `["promptpay_id","s"]`.

Add to `ExpenseSplit`:

```ts
export interface ExpenseSplit { name: string; amount_thb: number; paid: boolean; paid_slip_photo_ids: string[]; }
```

`splits` is already stored as an opaque JSON blob (`Kind: "j"`) — no mapper change
needed. Existing splits have no `paid`/`paid_slip_photo_ids`; read as `paid: false` /
`paid_slip_photo_ids: []` (backward compatible, same pattern the original splits field
used against pre-split expenses).

**Shared slip, no new entity.** Marking several lines paid together in one PromptPay
transfer writes the *same* `paid_slip_photo_ids` array (by value) onto every split
involved — there's no separate "payment" or "settlement" record. "Which other lines
does this slip cover" is answered by scanning every expense's splits for another
`paid: true` entry whose `paid_slip_photo_ids` intersects the current line's.

## Balance computation changes (`lib/settle.ts`)

`netBalances` currently sums every split regardless of paid state. Change: skip splits
where `paid === true`. This is the only change needed for the rest of the settle-summary
math (`simplifyDebts`, the settlement-pair list, the money-page total) to correctly
reflect partial payment — a pair with some lines paid just shows a smaller `amount`; a
pair with every line paid drops out of the settlement list entirely, with no special
"fully settled" state to track separately.

`expensesBetween` (drives the drill-down under each settlement row) starts returning
**every** line for the pair, paid or not — today it implicitly only matters for unpaid
debt; now paid lines need to render too (struck through, badge). Add `paid`, `paid_slip_photo_ids`, and a `key` field (`` `${expense_id}:${split_index}` ``
— unique within a trip, stable across re-renders since split order within an expense
never changes) to `SettlementLine` so the UI can address one specific split for
selection and for the paid-mutation below.

## UI — Members: setting a PromptPay ID

`MembersCard` currently only supports add/delete. Add an edit affordance: tapping an
existing member chip (not the delete X) opens a small `BottomSheet` with one field —
PromptPay ID — pre-filled if already set, save via `apiUpdate("members", ...)`.

## UI — settle summary: selecting and paying lines

In `SettleSummary`'s expanded drill-down (currently a plain read-only list from
`expensesBetween`):

- **Unpaid lines** get a leading checkbox. Tapping the row (not just the checkbox)
  toggles selection — same big-hit-target lesson as the equal-split chip fix from the
  QuickExpenseSheet bug fixed just before this feature (unambiguous selected state:
  filled checkbox + accent border, not a tint that could pass for "already selected").
- **Paid lines** render with a green checkmark badge and a strikethrough on the
  description/amount — not selectable, not part of any new selection.
- When ≥1 unpaid line is checked, a bar appears (sticky within the expanded section)
  showing the running total of just the checked lines and a button:
  **"จ่ายแล้ว N รายการ (฿total)"**.
- Tapping it opens `PayLineSheet` (new component), scoped to the checked lines:
  - PromptPay QR of the **creditor** (the `to` person for this pair — same person for
    every line in the selection, since selection is scoped to one settlement pair's
    drill-down) for the summed amount. Generated client-side (`promptpay-qr` builds the
    EMV payload, `qrcode` renders it to a data URL) — nothing sent over the network for
    this step.
  - If that member has no `promptpay_id` set: no QR, a line of text instead —
    "ยังไม่มีเลข PromptPay ของ {name} — ไปตั้งค่าที่หน้าสมาชิกก่อน" — and the rest of the
    sheet (upload + confirm) still works, since paying doesn't strictly require the QR
    (cash, bank transfer by hand-typed number, etc. are all valid outside the app).
  - Upload slip — reuses `PhotoPicker`, optional, single photo.
  - Confirm button: sets `paid: true` and `paid_slip_photo_ids` (the uploaded photo's id
    in an array, or `[]` if skipped) on every selected split, in place inside each
    owning expense's `splits` array, persisted via `apiUpdate("expenses", ...)` per
    affected expense (usually 1-2 calls, matching how few lines a real trip has between
    one pair). Closes the sheet, toasts "บันทึกแล้ว N รายการ".

## UI — viewing a paid line's shared slip

Tapping an already-paid line (instead of toggling a checkbox — there isn't one) opens a
small read-only popup: the slip photo (if any) and, if other splits share the same
`paid_slip_photo_ids`, a list of them ("จ่ายรวมกับอีก N รายการ: ...") so a slip covering
two debts is traceable from either one.

## Non-goals

- No edit/undo on a marked-paid line (no "unmark paid") — matches the app's existing
  stance of not building undo flows for low-stakes mistakes elsewhere; fixing a wrong
  mark means editing the underlying expense's amount/payer instead, same as today.
- No selecting lines across *different* settlement pairs into one slip — one PromptPay
  transfer is between two specific people, and selection is already scoped to one pair's
  drill-down, so this is a non-issue rather than a restriction to enforce.
- No server-side PromptPay validation or real payment initiation — this only generates a
  QR for the user to scan with their own banking app; TravelAss never touches money
  directly, matching the "no money moves mid-trip" non-goal from the original
  split-expense spec.
