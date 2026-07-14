import type { EntityName } from "@/lib/models/mappers";
import { dbList, dbCreate, dbUpdate, dbDelete, type Row } from "@/lib/local-db";
import { isGoogleBackend } from "@/lib/backend";
import { resourceListUrl, resourceItemUrl } from "@/lib/resource-url";

// Two storage modes behind one interface, selected by NEXT_PUBLIC_BACKEND
// (see lib/backend.ts). "local" (default) talks to localStorage via
// lib/local-db.ts synchronously, wrapped in a resolved Promise so callers
// stay unchanged either way. "google" talks to the Sheets-backed API routes
// under app/api/resource/[entity]/route.ts.
async function jsonOrThrow(res: Response) {
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const apiList = <T,>(entity: EntityName, tripId?: string): Promise<T[]> => {
  if (isGoogleBackend()) {
    return fetch(resourceListUrl(entity, tripId)).then(jsonOrThrow);
  }
  return Promise.resolve(dbList(entity, tripId) as T[]);
};

export const apiCreate = <T,>(entity: EntityName, obj: T): Promise<{ ok: true }> => {
  if (isGoogleBackend()) {
    return fetch(resourceListUrl(entity), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj),
    }).then(jsonOrThrow);
  }
  dbCreate(entity, obj as Row);
  return Promise.resolve({ ok: true });
};

export const apiUpdate = <T,>(entity: EntityName, id: string, obj: T): Promise<{ ok: true }> => {
  if (isGoogleBackend()) {
    return fetch(resourceItemUrl(entity, id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj),
    }).then(jsonOrThrow);
  }
  dbUpdate(entity, id, obj as Partial<Row>);
  return Promise.resolve({ ok: true });
};

export const apiDelete = (entity: EntityName, id: string): Promise<{ ok: true }> => {
  if (isGoogleBackend()) {
    return fetch(resourceItemUrl(entity, id), { method: "DELETE" }).then(jsonOrThrow);
  }
  dbDelete(entity, id);
  return Promise.resolve({ ok: true });
};

// FX always uses the server route (external rate API, no storage backend involved).
export const apiRate = async (from: string): Promise<{ rate: number }> => {
  const res = await fetch(`/api/fx?from=${from}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};
