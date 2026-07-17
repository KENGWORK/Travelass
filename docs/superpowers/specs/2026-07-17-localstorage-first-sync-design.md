# localStorage-first + background Google sync — Design

## Context

TravelAss currently has two mutually-exclusive storage modes selected at build time by `NEXT_PUBLIC_BACKEND`:

- **local** (default): everything lives in a single localStorage blob (`lib/local-db.ts`), read/write is synchronous, nothing ever leaves the browser.
- **google**: every read/write is a live round-trip to Google Sheets/Drive via `app/api/resource/[entity]/route.ts`. No local cache — every page load and every tab switch within a trip re-fetches from Sheets (partially mitigated by `TripDataProvider`'s in-memory cache added in an earlier session, but that cache is lost on reload and doesn't survive a fresh tab).

Production runs in `google` mode exclusively. The `local` mode's code path is effectively unused today but shares the same `apiList/apiCreate/apiUpdate/apiDelete` interface (`lib/api.ts`), which is what makes unifying them tractable.

## Goal

Make the app feel instant (the explicit ask: "โหลด/บันทึกทันที ไม่รอ Sheets") without giving up Google Sheets as the durable, shared, inspectable store for the family/couple using this on 2+ devices concurrently. Full offline browsing and multi-device conflict merging are explicitly **not** goals — see Non-Goals.

## Decisions (confirmed with user)

1. **Purpose is speed, not offline support.** The app is assumed to have network most of the time; localStorage exists to make interactions feel instant and to survive brief connectivity gaps, not to support extended offline use.
2. **2+ devices used concurrently** (e.g. both partners' phones). Sync must reconcile against Sheets as the shared source of truth — a device's local cache cannot be trusted indefinitely without revalidation.
3. **Failed Google writes retry automatically, forever, rather than rolling back.** If a sync call fails (network drop, transient error), the local write stays as-is and the app retries automatically when connectivity returns. This *replaces* the rollback-on-failure behavior built in the previous optimistic-UI pass.
4. **On load, show cached data instantly, then silently revalidate from Sheets in the background** (stale-while-revalidate) rather than blocking on a fresh fetch every time.
5. **Photo/slip uploads are unchanged** — still upload to Drive synchronously before the photo appears, exactly as today. Not part of this local-first pass (avoids localStorage quota problems from embedding base64 images).

## Architecture

Collapse the two modes into one: **localStorage is always the real store; Google Sheets/Drive is an optional sync target bolted on when `NEXT_PUBLIC_BACKEND=google` is set.** `isGoogleBackend()` (renamed `isGoogleConfigured()` for clarity — same underlying env check, same fail-safe-to-false behavior) no longer selects between two code paths; it just gates whether the sync layer is active.

`lib/api.ts` keeps its exact exported signatures (`apiList`, `apiCreate`, `apiUpdate`, `apiDelete`, `apiRate` untouched) so the ~20 call sites across the app that already call these functions do not need to change. The behavior underneath changes:

- **`apiList(entity, tripId?)`**: reads `dbList()` from `lib/local-db.ts` synchronously and resolves with that immediately — no network wait, ever, on the calling path. If `isGoogleConfigured()`, it *also* kicks a background fetch to the existing `/api/resource/[entity]` route (not awaited by the caller). When that resolves, the fetched rows overwrite the local-db rows for that `entity`+`tripId` (a new `dbReplaceAll(entity, tripId, rows)` primitive in `local-db.ts` — filters out the old rows for that entity+tripId and splices in the fresh set, leaving other trips'/entities' rows untouched) and a `notify(entity, tripId)` pub/sub event fires so any live subscriber can pick up the fresher data. If the background fetch fails, it's swallowed silently — the cache stays as the last-known-good state, no error surfaced (there's nothing actionable for the user here; the retry will happen on the next `apiList` call or subscriber refresh).
- **`apiCreate` / `apiUpdate` / `apiDelete`**: write to `local-db` synchronously first (via the existing `dbCreate/dbUpdate/dbDelete`), fire `notify()`, then resolve. If `isGoogleConfigured()`, the same call is also pushed onto the **sync queue** (see below) which handles the actual Sheets write and its retries out-of-band. The returned promise essentially cannot reject anymore from the caller's perspective — the local half is what the promise represents now.

### Sync queue (`lib/sync-queue.ts`, new)

A small outbox pattern:

```ts
type OutboxOp =
  | { kind: "create"; entity: EntityName; payload: Row }
  | { kind: "update"; entity: EntityName; id: string; payload: Row }
  | { kind: "delete"; entity: EntityName; id: string };
```

- Queue persisted as a JSON array under `localStorage["travelass:outbox"]`, so it survives a reload/app close mid-flight.
- `enqueue(op)` appends and triggers an immediate `flush()` attempt.
- `flush()` processes the queue **FIFO** (ordering matters: a create must reach Sheets before a later update to the same row is replayed). On success, shift the item off and continue to the next. On failure, stop — leave the failed item and everything behind it in the queue — and schedule a retry.
- Retry triggers: `window.addEventListener("online", flush)`, plus a 30s interval fallback while the queue is non-empty (covers cases where `online`/`offline` events don't fire reliably, e.g. flaky wifi that browsers don't always detect as a state change).
- `flush()` also runs once on app boot (module init) in case the browser was closed with a non-empty queue.
- No distinction is made between "network error" and "other error" (e.g. a 4xx from the API route) — anything that isn't a clean success gets queued/retried. This is deliberately simple per the user's direction; a malformed payload that permanently 4xxs would retry forever, but that's an existing-bug scenario, not a normal-operation one, and is no worse than today's behavior of no retry at all.

### `lib/optimistic.ts` simplification

The `optimisticCreate/Update/Delete` helpers built in the prior session mutate React state immediately, call the (now local-first) `apiCreate/Update/Delete`, and previously rolled back + toasted red on rejection. Since the local write essentially never fails, the rollback branch is dead weight now. Simplify to: mutate state, fire the call, no `.catch()` rollback. (A pending-sync indicator — see below — replaces the old per-mutation error toast as the mechanism for surfacing sync trouble.)

### Loading semantics / first-load-ever handling

A flag per revalidate scope, `localStorage["travelass:synced:<entity>:<tripId>"]` (a timestamp; the trip list itself — `entity="trips"`, no trip scoping — uses `<tripId>` = `"all"`), is set the first time a background revalidate against Sheets succeeds for that scope. `TripDataProvider` (for the four trip-scoped entities) and the trip-list page's loader (for `trips`) use this to decide whether to show a loading state:

- Flag present → trust the local cache immediately, `loading = false` from the first render, even if the cached arrays are empty (a legitimately-empty trip is a valid, already-known state, not a "haven't fetched yet" state).
- Flag absent **and** `isGoogleConfigured()` → `loading = true` until the first background revalidate completes (this is the only case that genuinely waits on the network — a brand-new browser/device that has never cached this trip).
- Flag absent **and** not `isGoogleConfigured()` → `loading = false` immediately (pure local mode has nothing to wait for; the empty local read is the truth).

### Pending-sync indicator

`RefreshButton` gains a small dot (accent/warning color, top-right corner of the icon) shown when the outbox is non-empty, so there's a passive signal that something hasn't reached Sheets yet without interrupting with a toast per item. No new interaction beyond that — the existing manual refresh press still works as today (triggers a revalidate; does not itself flush the outbox, since that's already running independently on its own retry loop).

## Data flow summary

**Read**: `apiList()` → instant local-db read → (if configured) background Sheets fetch → local-db overwritten + subscribers notified on success.

**Write**: `apiCreate/Update/Delete()` → instant local-db write + notify → (if configured) enqueued to outbox → outbox flush attempts the real Sheets write, retrying indefinitely on failure until it succeeds or is superseded.

## What doesn't need to change

Every component that already calls `apiList().then(setState)` in a `useEffect` (`InfoListSection`, `MembersCard`, the checklist page, the notes fetch in the info page) keeps working correctly with zero code changes, because the behavior change lives entirely inside `lib/api.ts`. The one thing they *don't* get "for free" is a live re-render when a background revalidate updates the cache after their initial read — they'll simply show the freshest data the next time they mount (e.g. re-entering that tab). This is judged an acceptable gap: extending every one of these call sites to subscribe to `notify()` would be a much larger diff for a marginal benefit (the shared `TripDataProvider` — the highest-traffic entities — does get the live-update treatment, described above).

`PhotoPicker.tsx` is untouched — photo upload keeps its existing `isGoogleConfigured()` branch (upload to Drive and wait vs. store a data URL locally), per the decision to keep photo handling out of this pass.

## Non-Goals

- Full offline browsing / editing with fresh data while disconnected.
- Conflict resolution beyond last-write-wins (no merge UI, no "conflict detected" prompts).
- Caching photos/slips in localStorage (quota risk with base64; explicitly ruled out).
- Changing the Sheets/Drive schema or the API routes under `app/api/resource/`.

## Testing

- `lib/sync-queue.ts`: unit tests for enqueue ordering (FIFO), flush-stops-on-first-failure-and-preserves-order, retry re-attempts the same head-of-queue item, queue persists across a simulated reload (re-reading from localStorage).
- `lib/api.ts`: unit tests (mocking `local-db` and `fetch`) confirming — local write always resolves synchronously-ish and does not throw when the background Sheets call fails; background revalidate overwrites local-db and fires `notify`; a failed revalidate leaves local-db untouched.
- `lib/backend.ts` rename to `isGoogleConfigured` — existing test file's assertions carry over unchanged (same fail-safe-to-false semantics), just renamed.
- Manual/browser verification: create/edit/delete while throttling network in devtools (or toggling `navigator.onLine` via devtools), confirm the outbox drains and Sheets ends up consistent once reconnected; confirm a second device/tab picks up changes made on the first after its own next revalidate.
