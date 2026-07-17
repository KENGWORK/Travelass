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
