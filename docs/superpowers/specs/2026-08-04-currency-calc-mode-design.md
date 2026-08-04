# Currency calc mode in Quick Expense sheet

## Context

TravelAss's Quick Expense sheet (`components/QuickExpenseSheet.tsx`) is the fast-entry
FAB flow for logging a trip expense: numeric keypad, category dial, payer dial, save.
Users also want a quick currency converter (e.g. haggling at a market, working out a
tip) with the same one-tap access as logging an expense — but without saving anything.

## Decision

Add a segmented toggle at the top of the existing sheet: **"บันทึกรายจ่าย"** (existing
flow, default) ⟷ **"คิดเลขอย่างเดียว"** (calc-only). Same sheet, same FAB, no new button
on screen.

## Calc mode behavior

- Reuses the existing keypad (`KEYS`/`press`) and currency-picker chip row — same
  digit-entry UX as expense mode, not a separate text input.
- Two currency slots instead of one: **from** (default `trip.trip_currency`) and **to**
  (default `THB`). Tapping either slot's chip opens the same currency picker used in
  expense mode. A swap button (⇅) between the two flips from/to.
- Big result readout: `≈ {to} {converted amount}`, styled like the existing `≈ ฿...`
  line but larger (this *is* the primary output in calc mode, not a footnote).
- Rate: fetched the same way as expense mode (`apiRate`, cached per currency pair via
  the existing `fxRate` pattern), with a ✎ affordance to edit it manually for this
  session only — never persisted, resets when the sheet closes or currency changes.
- No category dial, no payer dial, no notes/photo, no save button. Nothing is written
  via `apiCreate`/`optimisticCreate` in this mode.
- Switching back to "บันทึกรายจ่าย" keeps whatever was entered there (separate state);
  switching to calc mode doesn't clear the expense-mode fields either.
- Closing the sheet resets both modes' state, same as today (`reset()`).

## Non-goals

- No history of past conversions (stateless, single-shot per the user's explicit call).
- No persistence of the manually-edited rate.
- No changes to the existing "บันทึกรายจ่าย" flow's fields or behavior.

## Implementation sketch

- `mode: "expense" | "calc"` state in `QuickExpenseSheet`, defaulting to `"expense"`.
- Calc mode needs its own small piece of state: `toCurrency` (default `"THB"`), and
  reuses `digits`/`currency`/`fxRate`/`press`/`currencyOptions` from the existing
  expense-mode state (same keypad drives both — the toggle just changes what's
  rendered below the readout, not a second parallel form).
- `convertToTHB`/rate-fetch logic already exists in `lib/fx.ts` for THB conversion;
  calc mode's from→to conversion when `toCurrency !== "THB"` needs a second rate leg
  (from→THB→to, using two `apiRate` calls) since `lib/fx.ts` only knows about THB today.
