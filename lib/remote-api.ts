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

// One request upserts every row for the entity (server batches the Sheets
// calls) — the quota-safe path for lib/force-sync.ts.
export function remoteBulkUpsert<T>(entity: EntityName, rows: T[]): Promise<{ ok: true }> {
  return fetch(resourceListUrl(entity), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  }).then(jsonOrThrow);
}
