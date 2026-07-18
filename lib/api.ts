import type { EntityName } from "@/lib/models/mappers";
import { dbList, dbCreate, dbUpdate, dbDelete, dbReplaceAll, type Row } from "@/lib/local-db";
import { isGoogleConfigured } from "@/lib/backend";
import { markSynced, shouldRevalidate } from "@/lib/sync-status";
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
  // shouldRevalidate gates the background read: pages calling apiList on
  // every mount/tab-switch/search-open were stacking dozens of Sheets reads
  // a minute, exhausting the per-minute quota and failing real writes.
  if (isGoogleConfigured() && shouldRevalidate(entity, tripId)) {
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
