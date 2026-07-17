# localStorage-first + Background Google Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every read/write in the app instant by making localStorage the real store always, with Google Sheets/Drive becoming an optional background sync target instead of a blocking round-trip.

**Architecture:** Collapse the app's two mutually-exclusive storage modes (`local` / `google`, selected by `NEXT_PUBLIC_BACKEND`) into one: `lib/api.ts`'s `apiList/apiCreate/apiUpdate/apiDelete` keep their exact signatures but now always read/write `lib/local-db.ts` synchronously first. When Google is configured, `apiList` additionally kicks a non-blocking background revalidate against Sheets that overwrites the local cache on success, and mutations are pushed onto a persisted retry queue (`lib/sync-queue.ts`) instead of being awaited inline. A small pub/sub module (`lib/notify.ts`) lets live UI (the shared `TripDataProvider` and the trip list) pick up background-revalidated data without polling.

**Tech Stack:** Next.js (App Router), React, TypeScript, Vitest + jsdom (real `localStorage` available in tests).

**Spec:** `docs/superpowers/specs/2026-07-17-localstorage-first-sync-design.md`

## Global Constraints

- Every public function signature in `lib/api.ts` (`apiList`, `apiCreate`, `apiUpdate`, `apiDelete`, `apiRate`) stays unchanged — call sites elsewhere in the app must not need edits.
- No component that isn't explicitly listed in a task below gets touched.
- `components/PhotoPicker.tsx`'s upload behavior is unchanged — only its import of the renamed `isGoogleConfigured` changes.
- Failed Google syncs never roll back a local write or a mutation already reflected in the UI — they retry automatically via the outbox.
- All new localStorage-touching functions must guard `typeof localStorage === "undefined"` / `typeof window === "undefined"` (SSR-safe), matching the existing pattern in `lib/local-db.ts`.
- Any React state whose initial value would depend on reading `localStorage` must NOT read it inside a `useState(() => ...)` lazy initializer (that runs during SSR and during the client's hydration render and would produce a hydration mismatch) — initialize to a safe default and read the real value inside `useEffect`.

---

### Task 1: `lib/notify.ts` — pub/sub for cross-component cache updates

**Files:**
- Create: `lib/notify.ts`
- Test: `lib/notify.test.ts`

**Interfaces:**
- Produces: `subscribe(entity: string, cb: () => void): () => void`, `notify(entity: string): void`

- [ ] **Step 1: Write the failing test**

```ts
// lib/notify.test.ts
import { describe, it, expect, vi } from "vitest";
import { subscribe, notify } from "./notify";

describe("notify", () => {
  it("calls a subscribed listener when notified for the same entity", () => {
    const cb = vi.fn();
    subscribe("test-entity-1", cb);
    notify("test-entity-1");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not call listeners subscribed to a different entity", () => {
    const cb = vi.fn();
    subscribe("test-entity-2", cb);
    notify("test-entity-other");
    expect(cb).not.toHaveBeenCalled();
  });

  it("stops calling a listener after it unsubscribes", () => {
    const cb = vi.fn();
    const unsubscribe = subscribe("test-entity-3", cb);
    unsubscribe();
    notify("test-entity-3");
    expect(cb).not.toHaveBeenCalled();
  });

  it("calls every listener subscribed to the same entity", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe("test-entity-4", a);
    subscribe("test-entity-4", b);
    notify("test-entity-4");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notify.test.ts`
Expected: FAIL — `Cannot find module './notify'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/notify.ts
// Tiny pub/sub keyed by entity name (e.g. "expenses"). Used by lib/api.ts to
// tell live components "the local cache for this entity changed" — either
// because a mutation just wrote to it, or because a background Google
// revalidate just overwrote it — without those components needing to poll.

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(entity: string, cb: Listener): () => void {
  if (!listeners.has(entity)) listeners.set(entity, new Set());
  listeners.get(entity)!.add(cb);
  return () => {
    listeners.get(entity)?.delete(cb);
  };
}

export function notify(entity: string): void {
  listeners.get(entity)?.forEach((cb) => cb());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notify.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notify.ts lib/notify.test.ts
git commit -m "feat: add notify pub/sub for local cache updates"
```

---

### Task 2: `lib/local-db.ts` — add `dbReplaceAll` for bulk overwrite on revalidate

**Files:**
- Modify: `lib/local-db.ts`
- Test: `lib/local-db.test.ts`

**Interfaces:**
- Consumes: existing `DB`, `Row` types and `read()`/`write()` internals already in the file.
- Produces: `replaceRows(db: DB, entity: string, tripId: string | undefined, rows: Row[]): DB` (pure), `dbReplaceAll(entity: string, tripId: string | undefined, rows: Row[]): void`

- [ ] **Step 1: Write the failing test**

Add to the end of `lib/local-db.test.ts` (the file already imports `describe, it, expect` and `selectRows, insertRow, patchRow, removeRow, type DB` from `./local-db` — extend that import to include `replaceRows`):

```ts
// Change the top import line from:
//   import { selectRows, insertRow, patchRow, removeRow, type DB } from "./local-db";
// to:
import { selectRows, insertRow, patchRow, removeRow, replaceRows, type DB } from "./local-db";
```

Then append these tests at the end of the `describe("local-db transforms", ...)` block, right before the final closing `});`:

```ts
  it("replaceRows replaces only the given trip's rows, leaving other trips untouched", () => {
    const db: DB = {
      expenses: [
        { id: "a", trip_id: "t1" },
        { id: "b", trip_id: "t2" },
        { id: "c", trip_id: "t1" },
      ],
    };
    const next = replaceRows(db, "expenses", "t1", [{ id: "d", trip_id: "t1" }]);
    expect(next.expenses.map((r) => r.id)).toEqual(["b", "d"]);
    expect(db.expenses).toHaveLength(3); // original untouched
  });

  it("replaceRows replaces the entire entity when tripId is undefined", () => {
    const db: DB = { trips: [{ id: "a" }, { id: "b" }] };
    const next = replaceRows(db, "trips", undefined, [{ id: "c" }]);
    expect(next.trips.map((r) => r.id)).toEqual(["c"]);
  });

  it("replaceRows creates the entity array when it didn't exist", () => {
    const next = replaceRows({}, "expenses", "t1", [{ id: "a", trip_id: "t1" }]);
    expect(next.expenses.map((r) => r.id)).toEqual(["a"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/local-db.test.ts`
Expected: FAIL — `replaceRows` is not exported from `./local-db`.

- [ ] **Step 3: Write minimal implementation**

In `lib/local-db.ts`, add `replaceRows` after the existing `removeRow` function:

```ts
export function replaceRows(db: DB, entity: string, tripId: string | undefined, rows: Row[]): DB {
  const existing = db[entity] ?? [];
  const kept = tripId ? existing.filter((r) => r.trip_id !== tripId) : [];
  return { ...db, [entity]: [...kept, ...rows] };
}
```

And add `dbReplaceAll` next to the other `db*` wrappers at the bottom of the file:

```ts
export const dbReplaceAll = (entity: string, tripId: string | undefined, rows: Row[]): void =>
  write(replaceRows(read(), entity, tripId, rows));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/local-db.test.ts`
Expected: PASS (all existing tests + 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add lib/local-db.ts lib/local-db.test.ts
git commit -m "feat: add dbReplaceAll for bulk-overwriting a cached entity"
```

---

### Task 3: `lib/sync-status.ts` — per-entity "has this ever synced" flag

**Files:**
- Create: `lib/sync-status.ts`
- Test: `lib/sync-status.test.ts`

**Interfaces:**
- Produces: `syncedKey(entity: string, tripId?: string): string`, `isSynced(entity: string, tripId?: string): boolean`, `markSynced(entity: string, tripId?: string): void`

- [ ] **Step 1: Write the failing test**

```ts
// lib/sync-status.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { syncedKey, isSynced, markSynced } from "./sync-status";

describe("sync-status", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("syncedKey scopes by entity and tripId", () => {
    expect(syncedKey("expenses", "t1")).toBe("travelass:synced:expenses:t1");
  });

  it("syncedKey falls back to 'all' when tripId is omitted (e.g. the trips list itself)", () => {
    expect(syncedKey("trips")).toBe("travelass:synced:trips:all");
  });

  it("isSynced is false before markSynced has been called", () => {
    expect(isSynced("expenses", "t1")).toBe(false);
  });

  it("isSynced is true after markSynced", () => {
    markSynced("expenses", "t1");
    expect(isSynced("expenses", "t1")).toBe(true);
  });

  it("marking one entity/trip does not affect a different entity or trip", () => {
    markSynced("expenses", "t1");
    expect(isSynced("expenses", "t2")).toBe(false);
    expect(isSynced("bookings", "t1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync-status.test.ts`
Expected: FAIL — `Cannot find module './sync-status'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/sync-status.ts
// Tracks, per entity (+ optional trip scope), whether a background Google
// revalidate has ever succeeded — see lib/api.ts. Used to decide whether a
// page can trust its local cache immediately (flag present, even if the
// cached data is an empty array — a legitimately-empty trip is a known
// state) or must show a loading state until the first real fetch lands
// (flag absent — this device has never synced this data before).

function syncedKey(entity: string, tripId?: string): string {
  return `travelass:synced:${entity}:${tripId ?? "all"}`;
}

function isSynced(entity: string, tripId?: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(syncedKey(entity, tripId)) !== null;
}

function markSynced(entity: string, tripId?: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(syncedKey(entity, tripId), String(Date.now()));
}

export { syncedKey, isSynced, markSynced };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/sync-status.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync-status.ts lib/sync-status.test.ts
git commit -m "feat: add sync-status flags for local-first loading state"
```

---

### Task 4: Rename `isGoogleBackend` → `isGoogleConfigured`

**Files:**
- Modify: `lib/backend.ts`
- Modify: `lib/backend.test.ts`
- Modify: `components/PhotoPicker.tsx`

**Interfaces:**
- Produces: `isGoogleConfigured(): boolean` (same behavior as the old `isGoogleBackend`, renamed because it now means "is a sync target configured", not "which mode am I in")

- [ ] **Step 1: Update `lib/backend.ts`**

Replace the full contents of `lib/backend.ts`:

```ts
// Whether a Google Sheets/Drive sync target is configured. NEXT_PUBLIC_ so
// client components (lib/api.ts, PhotoPicker) can read it directly without a
// server round-trip. Unset or unrecognized -> false (fail safe — local
// storage is always the real store regardless; this only gates whether a
// background sync to Sheets/Drive also happens).
export function isGoogleConfigured(): boolean {
  return process.env.NEXT_PUBLIC_BACKEND === "google";
}
```

- [ ] **Step 2: Update `lib/backend.test.ts`**

Replace the full contents of `lib/backend.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { isGoogleConfigured } from "./backend";

describe("isGoogleConfigured", () => {
  const original = process.env.NEXT_PUBLIC_BACKEND;
  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND = original;
  });

  it("is false when NEXT_PUBLIC_BACKEND is unset", () => {
    delete process.env.NEXT_PUBLIC_BACKEND;
    expect(isGoogleConfigured()).toBe(false);
  });

  it("is false when NEXT_PUBLIC_BACKEND is \"local\"", () => {
    process.env.NEXT_PUBLIC_BACKEND = "local";
    expect(isGoogleConfigured()).toBe(false);
  });

  it("is true when NEXT_PUBLIC_BACKEND is \"google\"", () => {
    process.env.NEXT_PUBLIC_BACKEND = "google";
    expect(isGoogleConfigured()).toBe(true);
  });

  it("is false for an unrecognized value (fails safe)", () => {
    process.env.NEXT_PUBLIC_BACKEND = "sheets-please";
    expect(isGoogleConfigured()).toBe(false);
  });
});
```

- [ ] **Step 3: Update `components/PhotoPicker.tsx`**

In `components/PhotoPicker.tsx`, change the import (currently `import { isGoogleBackend } from "@/lib/backend";`) to:

```ts
import { isGoogleConfigured } from "@/lib/backend";
```

And replace both call sites in the same file:

```ts
        const id = isGoogleConfigured()
          ? await uploadToGoogle(file, tripName, kind)
          : await fileToDataUrl(file);
        accumulated.push(id);
        onChange([...accumulated]);
      } catch {
        toast(isGoogleConfigured() ? "อัปโหลดรูปไม่สำเร็จ" : "อ่านรูปไม่สำเร็จ");
```

(These are a straight rename of `isGoogleBackend()` → `isGoogleConfigured()` at both existing call sites — no other logic changes in this file.)

- [ ] **Step 4: Run tests to verify everything still passes**

Run: `npx vitest run lib/backend.test.ts`
Expected: PASS (4 tests)

Run: `npx tsc --noEmit`
Expected: no errors (confirms no other file still imports the old `isGoogleBackend` name)

- [ ] **Step 5: Commit**

```bash
git add lib/backend.ts lib/backend.test.ts components/PhotoPicker.tsx
git commit -m "refactor: rename isGoogleBackend to isGoogleConfigured"
```

---

### Task 5: `lib/remote-api.ts` — extract the raw Google Sheets HTTP calls

**Files:**
- Create: `lib/remote-api.ts`
- Test: `lib/remote-api.test.ts`

**Interfaces:**
- Consumes: `resourceListUrl`, `resourceItemUrl` from `lib/resource-url.ts` (unchanged); `EntityName` from `lib/models/mappers.ts`
- Produces: `remoteList<T>(entity, tripId?): Promise<T[]>`, `remoteCreate<T>(entity, obj: T): Promise<{ok:true}>`, `remoteUpdate<T>(entity, id, obj: T): Promise<{ok:true}>`, `remoteDelete(entity, id): Promise<{ok:true}>`

This is the exact HTTP logic that used to live inline in `lib/api.ts`'s google-mode branches, pulled out so both `lib/api.ts` (for read revalidation) and `lib/sync-queue.ts` (for the write retry loop) can call it without importing each other.

- [ ] **Step 1: Write the failing test**

```ts
// lib/remote-api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { remoteList, remoteCreate, remoteUpdate, remoteDelete } from "./remote-api";

describe("remote-api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("remoteList GETs the entity list url and returns the parsed body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [{ id: "a" }] });
    const result = await remoteList("expenses", "t1");
    expect(fetch).toHaveBeenCalledWith("/api/resource/expenses?trip_id=t1");
    expect(result).toEqual([{ id: "a" }]);
  });

  it("remoteList omits the query string when no tripId is given", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [] });
    await remoteList("trips");
    expect(fetch).toHaveBeenCalledWith("/api/resource/trips");
  });

  it("remoteCreate POSTs the object as JSON", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await remoteCreate("expenses", { id: "a" });
    expect(fetch).toHaveBeenCalledWith("/api/resource/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "a" }),
    });
  });

  it("remoteUpdate PATCHes the item url", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await remoteUpdate("expenses", "a", { id: "a", amount: 1 });
    expect(fetch).toHaveBeenCalledWith("/api/resource/expenses?id=a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "a", amount: 1 }),
    });
  });

  it("remoteDelete DELETEs the item url", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await remoteDelete("expenses", "a");
    expect(fetch).toHaveBeenCalledWith("/api/resource/expenses?id=a", { method: "DELETE" });
  });

  it("throws when the response is not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });
    await expect(remoteList("expenses")).rejects.toThrow("API 500");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/remote-api.test.ts`
Expected: FAIL — `Cannot find module './remote-api'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/remote-api.ts
// Raw HTTP calls to the Google Sheets-backed API routes under
// app/api/resource/[entity]/route.ts. No local-storage or caching concerns
// here — lib/api.ts calls remoteList to revalidate the cache, and
// lib/sync-queue.ts calls remoteCreate/Update/Delete to drain the outbox.
import type { EntityName } from "@/lib/models/mappers";
import { resourceListUrl, resourceItemUrl } from "@/lib/resource-url";

async function jsonOrThrow(res: Response) {
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export function remoteList<T>(entity: EntityName, tripId?: string): Promise<T[]> {
  return fetch(resourceListUrl(entity, tripId)).then(jsonOrThrow);
}

export function remoteCreate<T>(entity: EntityName, obj: T): Promise<{ ok: true }> {
  return fetch(resourceListUrl(entity), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  }).then(jsonOrThrow);
}

export function remoteUpdate<T>(entity: EntityName, id: string, obj: T): Promise<{ ok: true }> {
  return fetch(resourceItemUrl(entity, id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  }).then(jsonOrThrow);
}

export function remoteDelete(entity: EntityName, id: string): Promise<{ ok: true }> {
  return fetch(resourceItemUrl(entity, id), { method: "DELETE" }).then(jsonOrThrow);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/remote-api.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/remote-api.ts lib/remote-api.test.ts
git commit -m "refactor: extract raw Google Sheets HTTP calls into lib/remote-api.ts"
```

---

### Task 6: `lib/sync-queue.ts` — persisted outbox with FIFO retry

**Files:**
- Create: `lib/sync-queue.ts`
- Test: `lib/sync-queue.test.ts`

**Interfaces:**
- Consumes: `remoteCreate`, `remoteUpdate`, `remoteDelete` from `lib/remote-api.ts` (Task 5); `Row` type and `EntityName` type
- Produces: `enqueue(op: OutboxOp): void`, `flush(): Promise<void>`, `queueLength(): number`, `subscribeQueue(cb: () => void): () => void`, `initSyncQueue(): void`, and the exported `OutboxOp` type

- [ ] **Step 1: Write the failing test**

```ts
// lib/sync-queue.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueue, flush, queueLength, subscribeQueue } from "./sync-queue";
import { remoteCreate, remoteUpdate, remoteDelete } from "./remote-api";

vi.mock("./remote-api", () => ({
  remoteCreate: vi.fn(),
  remoteUpdate: vi.fn(),
  remoteDelete: vi.fn(),
}));

describe("sync-queue", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("enqueue adds an op to the queue", () => {
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    expect(queueLength()).toBe(1);
  });

  it("flush drains a successful op off the queue", async () => {
    (remoteCreate as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    await flush();
    expect(remoteCreate).toHaveBeenCalledWith("expenses", { id: "a" });
    expect(queueLength()).toBe(0);
  });

  it("stops at the first failure, leaving it and everything behind it queued", async () => {
    (remoteCreate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    enqueue({ kind: "create", entity: "expenses", payload: { id: "b" } });
    await flush();
    expect(queueLength()).toBe(2);
    expect(remoteCreate).toHaveBeenCalledTimes(1);
  });

  it("a later flush retries the same head-of-queue item and drains once it succeeds", async () => {
    (remoteCreate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    await flush();
    expect(queueLength()).toBe(1);

    (remoteCreate as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    await flush();
    expect(queueLength()).toBe(0);
    expect(remoteCreate).toHaveBeenCalledTimes(2);
  });

  it("routes update and delete ops to the matching remote function", async () => {
    (remoteUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (remoteDelete as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    enqueue({ kind: "update", entity: "expenses", id: "a", payload: { id: "a", amount: 5 } });
    enqueue({ kind: "delete", entity: "expenses", id: "b" });
    await flush();
    expect(remoteUpdate).toHaveBeenCalledWith("expenses", "a", { id: "a", amount: 5 });
    expect(remoteDelete).toHaveBeenCalledWith("expenses", "b");
  });

  it("notifies queue subscribers whenever the queue changes", () => {
    const cb = vi.fn();
    const unsubscribe = subscribeQueue(cb);
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
    enqueue({ kind: "create", entity: "expenses", payload: { id: "b" } });
    expect(cb).toHaveBeenCalledTimes(1); // not called again after unsubscribing
  });

  it("queue persists across a simulated reload (re-reading from localStorage)", async () => {
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    // Nothing keeps the queue in memory between calls other than localStorage
    // itself — queueLength() always re-reads it, so this just re-confirms
    // the write actually landed in storage rather than an in-memory var.
    const raw = localStorage.getItem("travelass:outbox");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync-queue.test.ts`
Expected: FAIL — `Cannot find module './sync-queue'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/sync-queue.ts
// Persisted outbox for Google Sheets writes: lib/api.ts enqueues an op
// immediately after writing to local storage, and this module drains the
// queue in the background, retrying indefinitely on failure instead of
// rolling anything back. See
// docs/superpowers/specs/2026-07-17-localstorage-first-sync-design.md.
import type { EntityName } from "@/lib/models/mappers";
import type { Row } from "@/lib/local-db";
import { remoteCreate, remoteUpdate, remoteDelete } from "@/lib/remote-api";

export type OutboxOp =
  | { kind: "create"; entity: EntityName; payload: Row }
  | { kind: "update"; entity: EntityName; id: string; payload: Row }
  | { kind: "delete"; entity: EntityName; id: string };

const KEY = "travelass:outbox";
const RETRY_INTERVAL_MS = 30_000;

type QueueListener = () => void;
const queueListeners = new Set<QueueListener>();

export function subscribeQueue(cb: QueueListener): () => void {
  queueListeners.add(cb);
  return () => {
    queueListeners.delete(cb);
  };
}

function readQueue(): OutboxOp[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as OutboxOp[];
  } catch {
    return [];
  }
}

function writeQueue(queue: OutboxOp[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(queue));
  queueListeners.forEach((cb) => cb());
}

export function queueLength(): number {
  return readQueue().length;
}

// Appends an op to the queue. Does NOT trigger a flush itself — callers
// (lib/api.ts, and the auto-retry wiring below) decide when to attempt one,
// which keeps this function's effect fully deterministic for tests.
export function enqueue(op: OutboxOp): void {
  writeQueue([...readQueue(), op]);
}

async function runOp(op: OutboxOp): Promise<void> {
  if (op.kind === "create") await remoteCreate(op.entity, op.payload);
  else if (op.kind === "update") await remoteUpdate(op.entity, op.id, op.payload);
  else await remoteDelete(op.entity, op.id);
}

let flushing = false;

// Processes the queue FIFO, stopping at the first failure (leaving it and
// everything behind it queued, in order) so a retry doesn't replay ops out
// of order. Safe to call concurrently — a second call while one is already
// running is a no-op.
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const queue = readQueue();
      if (queue.length === 0) return;
      const [head, ...rest] = queue;
      try {
        await runOp(head);
        writeQueue(rest);
      } catch {
        return;
      }
    }
  } finally {
    flushing = false;
  }
}

let initialized = false;

// Wires up automatic retry (on the browser's "online" event, plus a 30s
// interval fallback for connectivity changes the browser doesn't always
// report) and attempts an initial flush in case the queue was left
// non-empty from a previous session. Idempotent — safe to call more than
// once. Called once from lib/api.ts's module scope. Not unit tested here
// (module-scope side effects touching window/timers) — matches
// lib/local-db.ts's existing pattern of leaving browser-only wrappers to
// manual/browser verification rather than unit tests.
export function initSyncQueue(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", () => void flush());
  setInterval(() => {
    if (queueLength() > 0) void flush();
  }, RETRY_INTERVAL_MS);
  void flush();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/sync-queue.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync-queue.ts lib/sync-queue.test.ts
git commit -m "feat: add persisted outbox with FIFO retry for Google sync"
```

---

### Task 7: Rewrite `lib/api.ts` to be local-first

**Files:**
- Modify: `lib/api.ts`
- Test: `lib/api.test.ts` (new)

**Interfaces:**
- Consumes: `dbList/dbCreate/dbUpdate/dbDelete/dbReplaceAll` from `lib/local-db.ts`; `isSynced/markSynced` from `lib/sync-status.ts` (Task 3); `isGoogleConfigured` from `lib/backend.ts` (Task 4); `remoteList` from `lib/remote-api.ts` (Task 5); `notify` from `lib/notify.ts` (Task 1); `enqueue/flush/initSyncQueue` from `lib/sync-queue.ts` (Task 6)
- Produces: `apiList<T>(entity, tripId?): Promise<T[]>`, `apiCreate<T>(entity, obj: T): Promise<{ok:true}>`, `apiUpdate<T>(entity, id, obj: T): Promise<{ok:true}>`, `apiDelete(entity, id): Promise<{ok:true}>`, `apiRate(from): Promise<{rate:number}>` — **unchanged signatures** from every existing call site's point of view.

- [ ] **Step 1: Write the failing test**

```ts
// lib/api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sync-queue", () => ({
  enqueue: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  initSyncQueue: vi.fn(),
}));
vi.mock("@/lib/remote-api", () => ({
  remoteList: vi.fn(),
}));

import { apiList, apiCreate, apiUpdate, apiDelete } from "./api";
import { dbList, dbCreate } from "./local-db";
import { isSynced } from "./sync-status";
import { remoteList } from "./remote-api";
import { enqueue, flush } from "./sync-queue";

describe("api (local-first)", () => {
  const originalBackend = process.env.NEXT_PUBLIC_BACKEND;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND = originalBackend;
  });

  describe("without Google configured", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_BACKEND;
    });

    it("apiList resolves from local storage without calling remoteList", async () => {
      dbCreate("expenses", { id: "a", trip_id: "t1", amount_thb: 100 });
      const result = await apiList("expenses", "t1");
      expect(result).toEqual([{ id: "a", trip_id: "t1", amount_thb: 100 }]);
      expect(remoteList).not.toHaveBeenCalled();
    });

    it("apiCreate writes to local storage and does not enqueue a sync", async () => {
      const res = await apiCreate("expenses", { id: "a", trip_id: "t1" });
      expect(res).toEqual({ ok: true });
      expect(dbList("expenses", "t1")).toEqual([{ id: "a", trip_id: "t1" }]);
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe("with Google configured", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_BACKEND = "google";
    });

    it("apiList returns the local cache immediately (does not wait on remoteList)", async () => {
      dbCreate("expenses", { id: "stale", trip_id: "t1" });
      // Perpetually-pending — proves apiList's returned promise doesn't
      // depend on this ever settling. Never rejected, so nothing dangles;
      // a fresh mock is installed for every test via vi.clearAllMocks().
      (remoteList as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

      const result = await apiList("expenses", "t1");
      expect(result).toEqual([{ id: "stale", trip_id: "t1" }]);
    });

    it("a successful background revalidate overwrites the cache and marks it synced", async () => {
      dbCreate("expenses", { id: "stale", trip_id: "t1" });
      (remoteList as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "fresh", trip_id: "t1" }]);

      await apiList("expenses", "t1");
      await vi.waitFor(() => {
        expect(dbList("expenses", "t1")).toEqual([{ id: "fresh", trip_id: "t1" }]);
      });
      expect(isSynced("expenses", "t1")).toBe(true);
    });

    it("a failed background revalidate leaves the local cache untouched and unsynced", async () => {
      dbCreate("expenses", { id: "a", trip_id: "t1" });
      (remoteList as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

      await apiList("expenses", "t1");
      await new Promise((r) => setTimeout(r, 0)); // let the rejection settle

      expect(dbList("expenses", "t1")).toEqual([{ id: "a", trip_id: "t1" }]);
      expect(isSynced("expenses", "t1")).toBe(false);
    });

    it("apiCreate writes locally immediately and enqueues + flushes a sync", async () => {
      const result = await apiCreate("expenses", { id: "a", trip_id: "t1" });
      expect(result).toEqual({ ok: true });
      expect(dbList("expenses", "t1")).toEqual([{ id: "a", trip_id: "t1" }]);
      expect(enqueue).toHaveBeenCalledWith({ kind: "create", entity: "expenses", payload: { id: "a", trip_id: "t1" } });
      expect(flush).toHaveBeenCalled();
    });

    it("apiUpdate writes locally and enqueues an update op", async () => {
      dbCreate("expenses", { id: "a", trip_id: "t1", amount_thb: 1 });
      await apiUpdate("expenses", "a", { id: "a", trip_id: "t1", amount_thb: 2 });
      expect(dbList("expenses", "t1")).toEqual([{ id: "a", trip_id: "t1", amount_thb: 2 }]);
      expect(enqueue).toHaveBeenCalledWith({
        kind: "update",
        entity: "expenses",
        id: "a",
        payload: { id: "a", trip_id: "t1", amount_thb: 2 },
      });
    });

    it("apiDelete removes locally and enqueues a delete op", async () => {
      dbCreate("expenses", { id: "a", trip_id: "t1" });
      await apiDelete("expenses", "a");
      expect(dbList("expenses", "t1")).toEqual([]);
      expect(enqueue).toHaveBeenCalledWith({ kind: "delete", entity: "expenses", id: "a" });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/api.test.ts`
Expected: FAIL — assertions about `remoteList`/`enqueue`/`isSynced` not being called/true don't match, since `lib/api.ts` doesn't call any of them yet.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `lib/api.ts`:

```ts
import type { EntityName } from "@/lib/models/mappers";
import { dbList, dbCreate, dbUpdate, dbDelete, dbReplaceAll, type Row } from "@/lib/local-db";
import { isGoogleConfigured } from "@/lib/backend";
import { markSynced } from "@/lib/sync-status";
import { remoteList } from "@/lib/remote-api";
import { notify } from "@/lib/notify";
import { enqueue, flush, initSyncQueue } from "@/lib/sync-queue";

// Local-first: every read/write hits localStorage synchronously and never
// waits on the network. When NEXT_PUBLIC_BACKEND=google is set, apiList also
// kicks a background revalidate against Sheets (result overwrites the local
// cache and notifies subscribers via lib/notify.ts), and mutations are
// pushed onto lib/sync-queue.ts's outbox instead of being awaited inline.
// See docs/superpowers/specs/2026-07-17-localstorage-first-sync-design.md.
initSyncQueue();

export const apiList = <T,>(entity: EntityName, tripId?: string): Promise<T[]> => {
  const local = dbList(entity, tripId) as T[];
  if (isGoogleConfigured()) {
    remoteList<T>(entity, tripId)
      .then((fresh) => {
        dbReplaceAll(entity, tripId, fresh as unknown as Row[]);
        markSynced(entity, tripId);
        notify(entity);
      })
      .catch(() => {
        // Revalidate failed — keep serving the cache. Nothing actionable to
        // show the user; the next apiList call will try again.
      });
  }
  return Promise.resolve(local);
};

export const apiCreate = <T,>(entity: EntityName, obj: T): Promise<{ ok: true }> => {
  dbCreate(entity, obj as Row);
  notify(entity);
  if (isGoogleConfigured()) {
    enqueue({ kind: "create", entity, payload: obj as Row });
    void flush();
  }
  return Promise.resolve({ ok: true });
};

// `obj` must be the complete entity, not a partial patch — Google mode does
// a full-row overwrite via the PATCH route, so every caller already passes
// the whole object.
export const apiUpdate = <T,>(entity: EntityName, id: string, obj: T): Promise<{ ok: true }> => {
  dbUpdate(entity, id, obj as Partial<Row>);
  notify(entity);
  if (isGoogleConfigured()) {
    enqueue({ kind: "update", entity, id, payload: obj as Row });
    void flush();
  }
  return Promise.resolve({ ok: true });
};

export const apiDelete = (entity: EntityName, id: string): Promise<{ ok: true }> => {
  dbDelete(entity, id);
  notify(entity);
  if (isGoogleConfigured()) {
    enqueue({ kind: "delete", entity, id });
    void flush();
  }
  return Promise.resolve({ ok: true });
};

// FX always uses the server route (external rate API, no storage backend involved).
export const apiRate = async (from: string): Promise<{ rate: number }> => {
  const res = await fetch(`/api/fx?from=${from}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/api.test.ts`
Expected: PASS (8 tests)

Then run the full suite to confirm nothing else broke:

Run: `npx vitest run`
Expected: all test files PASS

- [ ] **Step 5: Commit**

```bash
git add lib/api.ts lib/api.test.ts
git commit -m "feat: make lib/api.ts local-first with background Google sync"
```

---

### Task 8: Simplify `lib/optimistic.ts` — drop the now-impossible rollback path

**Files:**
- Modify: `lib/optimistic.ts`

**Interfaces:**
- Produces: `optimisticCreate/Update/Delete` — same call signatures as before, simplified bodies (no behavior callers need to adapt to).

Since `apiCreate/apiUpdate/apiDelete` (Task 7) now write to local storage synchronously and essentially cannot reject, the `.catch()` rollback-and-toast branch in every one of these helpers is unreachable dead code. No test file exists for `lib/optimistic.ts` today (confirmed — only manual/browser verification covered it), so this task is a source-only simplification.

- [ ] **Step 1: Replace the full contents of `lib/optimistic.ts`**

```ts
import type { Dispatch, SetStateAction } from "react";

// Shared instant-UI pattern for every list mutation in the app: mutate
// local React state to match what lib/api.ts already wrote to local
// storage synchronously, then fire the (now local-first) write. There's no
// rollback branch anymore — the local write essentially can't fail; a
// failed Google sync is retried in the background via lib/sync-queue.ts
// instead of surfacing here.

export function optimisticCreate<T extends { id: string }>(
  setList: Dispatch<SetStateAction<T[]>>,
  item: T,
  write: () => Promise<unknown>,
): void {
  setList((prev) => [...prev, item]);
  void write();
}

export function optimisticUpdate<T extends { id: string }>(
  setList: Dispatch<SetStateAction<T[]>>,
  id: string,
  patch: Partial<T>,
  write: () => Promise<unknown>,
): void {
  setList((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  void write();
}

export function optimisticDelete<T extends { id: string }>(
  setList: Dispatch<SetStateAction<T[]>>,
  id: string,
  write: () => Promise<unknown>,
): void {
  setList((prev) => prev.filter((x) => x.id !== id));
  void write();
}
```

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: all PASS (no test referenced the removed rollback behavior)

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/optimistic.ts
git commit -m "refactor: drop unreachable rollback path from optimistic helpers"
```

---

### Task 9: `lib/use-trip-data.tsx` — local-first `TripDataProvider`

**Files:**
- Modify: `lib/use-trip-data.tsx`

**Interfaces:**
- Consumes: `apiList` (Task 7); `dbList` from `lib/local-db.ts`; `isSynced` from `lib/sync-status.ts` (Task 3); `isGoogleConfigured` from `lib/backend.ts` (Task 4); `subscribe` from `lib/notify.ts` (Task 1)
- Produces: `TripDataProvider`, `useTripData` — same exported shape as before (`expenses, bookings, transports, itinerary, summary, loading, reload, setExpenses, setBookings, setTransports, setItinerary`), so every page/component already consuming `useTripData()` needs no changes.

No dedicated unit test — this is a React context provider exercised via the existing browser-verification workflow (same as when it was first introduced). `useState(true)`/`useState([])` are used as the initial values (not `useState(() => dbList(...))`) specifically to avoid an SSR/hydration mismatch — see Global Constraints.

- [ ] **Step 1: Replace the full contents of `lib/use-trip-data.tsx`**

```tsx
"use client";
import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { apiList } from "@/lib/api";
import { dbList } from "@/lib/local-db";
import { isSynced } from "@/lib/sync-status";
import { isGoogleConfigured } from "@/lib/backend";
import { subscribe } from "@/lib/notify";
import type { Expense, Booking, Transport, ItineraryItem } from "@/lib/models/types";
import { summarize } from "@/lib/summary";

interface TripDataValue {
  expenses: Expense[];
  bookings: Booking[];
  transports: Transport[];
  itinerary: ItineraryItem[];
  summary: ReturnType<typeof summarize>;
  loading: boolean;
  reload: () => Promise<void>;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setBookings: Dispatch<SetStateAction<Booking[]>>;
  setTransports: Dispatch<SetStateAction<Transport[]>>;
  setItinerary: Dispatch<SetStateAction<ItineraryItem[]>>;
}

const TripDataContext = createContext<TripDataValue | null>(null);

const ENTITIES = ["expenses", "bookings", "transports", "itinerary"] as const;

function allSynced(tripId: string): boolean {
  return ENTITIES.every((e) => isSynced(e, tripId));
}

// Mounted once per trip in app/trips/[id]/layout.tsx, which Next.js keeps
// alive across nav between tabs (itinerary/transport/money/info/...) since
// they're all the same route segment's children. That's what makes
// switching tabs instant: there's no refetch-on-mount per page anymore,
// every page reads the same already-fetched state via useTripData().
//
// Local-first (docs/superpowers/specs/2026-07-17-localstorage-first-sync-design.md):
// reload() calls lib/api.ts's apiList, which itself resolves instantly from
// the local cache and (if Google is configured) kicks a background Sheets
// revalidate. This provider subscribes to lib/notify.ts so it picks up that
// revalidate's result — and any other write to these entities from
// anywhere in the app — without needing to be told explicitly.
export function TripDataProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [e, b, t, i] = await Promise.all([
      apiList<Expense>("expenses", tripId),
      apiList<Booking>("bookings", tripId),
      apiList<Transport>("transports", tripId),
      apiList<ItineraryItem>("itinerary", tripId),
    ]);
    setExpenses(e);
    setBookings(b);
    setTransports(t);
    setItinerary(i);
    setLoading(isGoogleConfigured() && !allSynced(tripId));
  }, [tripId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const refresh = () => {
      setExpenses(dbList("expenses", tripId) as Expense[]);
      setBookings(dbList("bookings", tripId) as Booking[]);
      setTransports(dbList("transports", tripId) as Transport[]);
      setItinerary(dbList("itinerary", tripId) as ItineraryItem[]);
      setLoading((prev) => (prev ? isGoogleConfigured() && !allSynced(tripId) : false));
    };
    const unsubs = ENTITIES.map((entity) => subscribe(entity, refresh));
    return () => unsubs.forEach((unsub) => unsub());
  }, [tripId]);

  const summary = summarize(expenses, bookings, transports);

  return (
    <TripDataContext.Provider
      value={{ expenses, bookings, transports, itinerary, summary, loading, reload, setExpenses, setBookings, setTransports, setItinerary }}
    >
      {children}
    </TripDataContext.Provider>
  );
}

// tripId param kept (unused) so every existing `useTripData(trip.id)` call
// site keeps working unchanged after the context refactor.
export function useTripData(_tripId?: string): TripDataValue {
  const ctx = useContext(TripDataContext);
  if (!ctx) throw new Error("useTripData must be used within TripDataProvider");
  return ctx;
}
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add lib/use-trip-data.tsx
git commit -m "feat: make TripDataProvider local-first with live cache updates"
```

---

### Task 10: `app/page.tsx` + `components/TripFormSheet.tsx` — trip list local-first, drop dead rollback

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/TripFormSheet.tsx`

**Interfaces:**
- Consumes: `apiList`, `apiCreate` (Task 7); `dbList` from `lib/local-db.ts`; `isSynced` from `lib/sync-status.ts` (Task 3); `isGoogleConfigured` from `lib/backend.ts` (Task 4); `subscribe` from `lib/notify.ts` (Task 1)
- Produces: `TripFormSheet` now takes `onOptimisticCreate: (trip: Trip) => void` only (the `onCreateError` prop is removed — see rationale below)

`apiCreate` (Task 7) can no longer reject, so `TripFormSheet`'s `Promise.all([...]).catch()` rollback branch — which calls `onCreateError` and shows an error toast — became unreachable dead code the same way `lib/optimistic.ts`'s rollback did. Since these two files share that prop contract, this task removes it from both sides together. No dedicated unit test (both are React UI, covered by the existing browser-verification workflow).

- [ ] **Step 1: Replace the full contents of `components/TripFormSheet.tsx`**

```tsx
"use client";
import { useState } from "react";
import { apiCreate } from "@/lib/api";
import type { Trip, Member } from "@/lib/models/types";
import { MEMBER_COLORS } from "@/lib/members";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";

const EMPTY = { name: "", destination: "", start_date: "", end_date: "", trip_currency: "THB" };

export function TripFormSheet({
  open,
  onClose,
  onOptimisticCreate,
}: {
  open: boolean;
  onClose: () => void;
  onOptimisticCreate: (trip: Trip) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const valid = form.name.trim() && form.destination.trim() && form.start_date && form.end_date && form.start_date <= form.end_date;

  const submit = () => {
    if (!valid || saving) return;
    setSaving(true);
    const trip: Trip = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      destination: form.destination.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      home_currency: "THB",
      trip_currency: form.trip_currency,
      status: "planning",
    };
    const me: Member = { id: crypto.randomUUID(), trip_id: trip.id, name: "ฉัน", color: MEMBER_COLORS[0] };

    // Instant: drop into the list and close immediately. apiCreate writes to
    // local storage synchronously (and, if Google is configured, queues the
    // Sheets sync in the background) — see lib/api.ts.
    onOptimisticCreate(trip);
    setForm(EMPTY);
    setSaving(false);
    onClose();

    apiCreate("trips", trip);
    apiCreate("members", me);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="สร้างทริปใหม่">
      <div className="flex flex-col gap-3">
        <FormField label="ชื่อทริป">
          <input
            autoFocus
            className="field"
            placeholder="เช่น ทริปโตเกียว"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField label="จุดหมาย">
          <input
            className="field"
            placeholder="เช่น โตเกียว, ญี่ปุ่น"
            value={form.destination}
            onChange={(e) => set({ destination: e.target.value })}
          />
        </FormField>
        <div className="flex gap-2">
          <FormField label="วันที่เริ่ม" className="flex-1">
            <input
              type="date"
              className="field"
              value={form.start_date}
              onChange={(e) => set({ start_date: e.target.value })}
            />
          </FormField>
          <FormField label="วันที่สิ้นสุด" className="flex-1">
            <input
              type="date"
              className="field"
              value={form.end_date}
              onChange={(e) => set({ end_date: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label="สกุลเงินหลักของทริป">
          <select
            className="field cursor-pointer"
            value={form.trip_currency}
            onChange={(e) => set({ trip_currency: e.target.value })}
          >
            {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </FormField>
        <Button variant="primary" full disabled={!valid} onClick={submit}>
          สร้างทริป
        </Button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Replace the full contents of `app/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Plus, Plane } from "lucide-react";
import { apiList } from "@/lib/api";
import { dbList } from "@/lib/local-db";
import { isSynced } from "@/lib/sync-status";
import { isGoogleConfigured } from "@/lib/backend";
import { subscribe } from "@/lib/notify";
import type { Trip } from "@/lib/models/types";
import { TripCard } from "@/components/TripCard";
import { TripFormSheet } from "@/components/TripFormSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshButton } from "@/components/ui/RefreshButton";

const sortTrips = (t: Trip[]) =>
  [...t].sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : b.start_date.localeCompare(a.start_date)));

export default function TripListPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = () =>
    apiList<Trip>("trips").then((t) => {
      // The local cache may legitimately be empty on a device that's never
      // synced yet — keep showing the skeleton (trips === null) until either
      // there's real data, or the cache is otherwise trustworthy (already
      // synced before, or there's no Google sync to wait for at all).
      if (t.length > 0 || !isGoogleConfigured() || isSynced("trips")) {
        setTrips(sortTrips(t));
      }
    });

  useEffect(() => {
    load();
  }, []);

  useEffect(() => subscribe("trips", () => setTrips(sortTrips(dbList("trips") as Trip[]))), []);

  return (
    <main className="p-4 max-w-3xl mx-auto">
      <header className="flex items-center justify-between h-14">
        <h1 className="font-heading text-[28px] font-bold">ทริปของเรา</h1>
        <div className="flex items-center gap-1">
          <RefreshButton onRefresh={load} />
          <button aria-label="สร้างทริป" onClick={() => setOpen(true)}
            className="wiggle-idle w-12 h-12 rounded-full gradient-primary text-white shadow-card hover:shadow-card-hover grid place-items-center cursor-pointer active:scale-[0.9] transition-transform duration-200 border-2 border-surface">
            <Plus size={26} />
          </button>
        </div>
      </header>
      <div className="flex flex-col gap-3 mt-2">
        {trips === null && [1, 2].map((i) => <Skeleton key={i} className="h-[120px]" />)}
        {trips?.map((t) => <TripCard key={t.id} trip={t} />)}
        {trips?.length === 0 && (
          <EmptyState icon={Plane} title="ยังไม่มีทริป" subtitle="กด + มุมขวาบนเพื่อเริ่มวางแผนทริปแรกของคุณ" />
        )}
      </div>
      <TripFormSheet
        open={open}
        onClose={() => setOpen(false)}
        onOptimisticCreate={(trip) => setTrips((prev) => sortTrips([...(prev ?? []), trip]))}
      />
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck and the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors (confirms nothing else still passes `onCreateError` to `TripFormSheet`)

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/TripFormSheet.tsx
git commit -m "feat: make trip list local-first; drop unreachable create-error rollback"
```

---

### Task 11: `components/ui/RefreshButton.tsx` — pending-sync indicator

**Files:**
- Modify: `components/ui/RefreshButton.tsx`

**Interfaces:**
- Consumes: `queueLength`, `subscribeQueue` from `lib/sync-queue.ts` (Task 6)
- Produces: `RefreshButton` — same `{ onRefresh }` prop as before, every existing call site needs no changes.

Initial `pending` state is `false` (not read from `queueLength()` in a lazy initializer) — the real value is read inside `useEffect`, to avoid an SSR/hydration mismatch (see Global Constraints).

- [ ] **Step 1: Replace the full contents of `components/ui/RefreshButton.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { queueLength, subscribeQueue } from "@/lib/sync-queue";

export function RefreshButton({ onRefresh }: { onRefresh: () => Promise<unknown> | void }) {
  const [spinning, setSpinning] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(queueLength() > 0);
    return subscribeQueue(() => setPending(queueLength() > 0));
  }, []);

  const run = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await onRefresh();
    } finally {
      setSpinning(false);
    }
  };

  return (
    <button
      type="button"
      aria-label={pending ? "รีเฟรช (มีรายการรอซิงค์)" : "รีเฟรช"}
      onClick={run}
      className="relative h-11 w-11 shrink-0 grid place-items-center rounded-full text-muted hover:bg-primary/8 active:scale-90 transition-transform cursor-pointer"
    >
      <RotateCw size={20} className={spinning ? "animate-spin" : ""} />
      {pending && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
    </button>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/RefreshButton.tsx
git commit -m "feat: show a pending-sync dot on RefreshButton when the outbox is non-empty"
```

---

### Task 12: Full verification, build, and deploy

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: every test file PASSES (existing ~68 tests + the ~30 new ones added in Tasks 1, 2, 3, 5, 6, 7)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, no route errors

- [ ] **Step 4: Browser verification — pure local mode (no Google configured)**

In `.env.local`, temporarily change `NEXT_PUBLIC_BACKEND=google` to `NEXT_PUBLIC_BACKEND=local` (leave the `GOOGLE_*`/`SPREADSHEET_ID`/`DRIVE_ROOT_FOLDER_ID` values in place — they're just unused while this var isn't `"google"`), restart the dev server so the env change takes effect, then confirm:
- Creating a trip, adding an expense, editing a booking all appear instantly with zero network calls to `/api/resource/*` (check the Network tab).
- Reloading the page shows the same data (it's actually persisted in localStorage, not just in-memory React state).

- [ ] **Step 5: Browser verification — Google configured, happy path**

Change `.env.local`'s `NEXT_PUBLIC_BACKEND` back to `google` and restart the dev server (valid Sheets/Drive credentials are already in place from the earlier Google-backend migration work):
- Create a trip. Confirm it appears in the UI instantly (before any `/api/resource/trips` POST could plausibly have completed).
- Open the Google Sheet directly and confirm the new row lands there within a few seconds.
- Reload the page. Confirm the trip list appears instantly (from cache) with no visible loading flash, then — if you edit the sheet directly and wait — confirm the UI picks up the external change on the next natural revalidate (e.g. next page load, or pressing the refresh button).

- [ ] **Step 6: Browser verification — sync queue / offline retry**

With `NEXT_PUBLIC_BACKEND=google`:
- Open browser devtools → Network tab → set throttling to "Offline".
- Create or edit an expense. Confirm it appears instantly in the UI, and the `RefreshButton`'s pending dot appears.
- Set throttling back to "Online" (or "No throttling"). Within ~30s (or immediately if the browser fires an `online` event), confirm the pending dot disappears and the row appears in the actual Google Sheet.

- [ ] **Step 7: Commit and push**

```bash
git status --short
git add -A
git commit -m "docs: note localStorage-first sync verified end-to-end"
```

(Only if Step 4-6 turned up fixes that needed committing — otherwise this step is a no-op skip, since Tasks 1-11 already committed everything.)

```bash
git push origin feat/mvp-localstorage-redesign:main
```

- [ ] **Step 8: Confirm the Vercel deploy is READY**

Use the Vercel MCP connector's `get_deployment` (or `list_deployments`) tool against `projectId: travelass`, `teamId: team_4sPFp7BAOIEsToEnnSsRxDex`, polling until `state: "READY"` for the commit just pushed, then re-run Step 5's Google-configured browser check against `https://travelass.vercel.app` itself.
