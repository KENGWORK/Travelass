import type { Dispatch, SetStateAction } from "react";
import { toast } from "@/components/ui/Toast";

const FAIL_MSG = "บันทึกไม่สำเร็จ ลองอีกครั้ง";

// Shared instant-UI pattern for every list mutation in the app: mutate local
// state first, fire the real Google Sheets write in the background, and
// roll back to the pre-mutation snapshot (+ red toast) if it fails. Every
// apiCreate/apiUpdate/apiDelete call site in the app should go through one
// of these instead of `await apiXxx(...); await reload();`.

export function optimisticCreate<T extends { id: string }>(
  setList: Dispatch<SetStateAction<T[]>>,
  item: T,
  write: () => Promise<unknown>,
): void {
  setList((prev) => [...prev, item]);
  write().catch(() => {
    setList((prev) => prev.filter((x) => x.id !== item.id));
    toast(FAIL_MSG, "error");
  });
}

export function optimisticUpdate<T extends { id: string }>(
  setList: Dispatch<SetStateAction<T[]>>,
  id: string,
  patch: Partial<T>,
  write: () => Promise<unknown>,
): void {
  let previous: T | undefined;
  setList((prev) =>
    prev.map((x) => {
      if (x.id !== id) return x;
      previous = x;
      return { ...x, ...patch };
    }),
  );
  write().catch(() => {
    if (previous) {
      const restored = previous;
      setList((prev) => prev.map((x) => (x.id === id ? restored : x)));
    }
    toast(FAIL_MSG, "error");
  });
}

export function optimisticDelete<T extends { id: string }>(
  setList: Dispatch<SetStateAction<T[]>>,
  id: string,
  write: () => Promise<unknown>,
): void {
  let removed: T | undefined;
  let removedAt = -1;
  setList((prev) => {
    const idx = prev.findIndex((x) => x.id === id);
    if (idx === -1) return prev;
    removed = prev[idx];
    removedAt = idx;
    return prev.filter((x) => x.id !== id);
  });
  write().catch(() => {
    if (removed) {
      const item = removed;
      setList((prev) => {
        const copy = [...prev];
        copy.splice(Math.min(removedAt, copy.length), 0, item);
        return copy;
      });
    }
    toast(FAIL_MSG, "error");
  });
}
