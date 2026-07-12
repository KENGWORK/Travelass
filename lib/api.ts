import type { EntityName } from "@/lib/models/mappers";
import { dbList, dbCreate, dbUpdate, dbDelete, type Row } from "@/lib/local-db";

// Data lives in the browser's localStorage (MVP mode — no backend needed).
// Kept async so callers (await apiList(...)) stay unchanged if this is later
// swapped back to a server/Google-backed implementation.
export const apiList = <T,>(entity: EntityName, tripId?: string): Promise<T[]> =>
  Promise.resolve(dbList(entity, tripId) as T[]);

export const apiCreate = <T,>(entity: EntityName, obj: T): Promise<{ ok: true }> => {
  dbCreate(entity, obj as Row);
  return Promise.resolve({ ok: true });
};

export const apiUpdate = <T,>(entity: EntityName, id: string, obj: T): Promise<{ ok: true }> => {
  dbUpdate(entity, id, obj as Partial<Row>);
  return Promise.resolve({ ok: true });
};

export const apiDelete = (entity: EntityName, id: string): Promise<{ ok: true }> => {
  dbDelete(entity, id);
  return Promise.resolve({ ok: true });
};

// FX still uses the server route (external rate API, no data storage).
export const apiRate = async (from: string): Promise<{ rate: number }> => {
  const res = await fetch(`/api/fx?from=${from}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};
