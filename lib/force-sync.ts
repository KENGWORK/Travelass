// Manual "push everything local up to Sheets" action — separate from the
// normal outbox (lib/sync-queue.ts), which only carries mutations made
// since it started listening. This walks every entity's current local
// cache for the trip and upserts each row to Sheets directly, for cases
// where the queue might have missed something or Google was only just
// configured after local-only use. Upsert only — never deletes a remote
// row, since another device's local cache (and therefore this device's
// view of "what's local") can lag behind what's actually on Sheets.
import { ENTITIES, type EntityName } from "@/lib/models/mappers";
import { dbList, type Row } from "@/lib/local-db";
import { remoteList, remoteCreate, remoteUpdate } from "@/lib/remote-api";
import { markSynced } from "@/lib/sync-status";
import { notify } from "@/lib/notify";

const TRIP_ENTITIES = (Object.keys(ENTITIES) as EntityName[]).filter((e) => e !== "trips");

async function upsertEntity(entity: EntityName, tripId: string): Promise<void> {
  const localRows = dbList(entity, tripId);
  if (localRows.length === 0) return;
  const remoteRows = await remoteList<Row>(entity, tripId);
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  await Promise.all(
    localRows.map((row) => (remoteIds.has(row.id) ? remoteUpdate(entity, row.id, row) : remoteCreate(entity, row))),
  );
  markSynced(entity, tripId);
  notify(entity);
}

export async function uploadLocalToSheets(tripId: string): Promise<void> {
  const localTrips = dbList("trips");
  const tripRow = localTrips.find((t) => t.id === tripId);
  if (tripRow) {
    const remoteTrips = await remoteList<Row>("trips");
    if (remoteTrips.some((t) => t.id === tripId)) await remoteUpdate("trips", tripId, tripRow);
    else await remoteCreate("trips", tripRow);
    notify("trips");
  }
  await Promise.all(TRIP_ENTITIES.map((entity) => upsertEntity(entity, tripId)));
}
