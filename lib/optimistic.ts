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
