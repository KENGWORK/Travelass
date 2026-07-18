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
      const head = queue[0];
      try {
        await runOp(head);
        // Re-read after the await — the queue may have grown (via a
        // concurrent enqueue()) while we were waiting on the network.
        // Remove exactly the item we just processed rather than writing
        // back the pre-await snapshot, which would silently drop anything
        // enqueued during the await. Safe because flush() holds the
        // `flushing` mutex (only one flush loop runs at a time) and
        // enqueue() only ever appends, so the processed item is guaranteed
        // to still be at index 0 of a freshly-read queue.
        const current = readQueue();
        writeQueue(current.slice(1));
      } catch {
        return;
      }
    }
  } finally {
    flushing = false;
  }
}

let initialized = false;

// Wires up automatic retry (on the browser's "online" event, on the tab/PWA
// becoming visible or focused — iOS PWAs don't reliably fire "online" after
// being backgrounded with no connectivity — plus a 30s interval fallback for
// anything those miss) and attempts an initial flush in case the queue was
// left non-empty from a previous session. Idempotent — safe to call more
// than once. Called once from lib/api.ts's module scope. Not unit tested
// here (module-scope side effects touching window/timers) — matches
// lib/local-db.ts's existing pattern of leaving browser-only wrappers to
// manual/browser verification rather than unit tests.
export function initSyncQueue(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const tryFlush = () => void flush();
  window.addEventListener("online", tryFlush);
  window.addEventListener("focus", tryFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryFlush();
  });
  setInterval(() => {
    if (queueLength() > 0) void flush();
  }, RETRY_INTERVAL_MS);
  void flush();
}
