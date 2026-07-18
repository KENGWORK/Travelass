// Manual "push everything local up to Sheets" action — separate from the
// normal outbox (lib/sync-queue.ts), which only carries mutations made
// since it started listening. This walks every entity's current local
// cache for the trip and upserts each row to Sheets directly, for cases
// where the queue might have missed something or Google was only just
// configured after local-only use. Upsert only — never deletes a remote
// row, since another device's local cache (and therefore this device's
// view of "what's local") can lag behind what's actually on Sheets.
//
// Requests are sent one at a time (not Promise.all) with a small delay
// between writes. The Sheets API's per-minute-per-user quota is easily
// blown through by firing every row of every entity in parallel — a trip
// with a few dozen rows across entities was enough to trigger 429s.
import { ENTITIES, type EntityName } from "@/lib/models/mappers";
import { dbList, type Row } from "@/lib/local-db";
import { remoteList, remoteCreate, remoteUpdate } from "@/lib/remote-api";
import { markSynced } from "@/lib/sync-status";
import { notify } from "@/lib/notify";

const TRIP_ENTITIES = (Object.keys(ENTITIES) as EntityName[]).filter((e) => e !== "trips");
const WRITE_DELAY_MS = 150;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function upsertRow(entity: EntityName, row: Row, remoteIds: Set<string>): Promise<void> {
  if (remoteIds.has(row.id)) await remoteUpdate(entity, row.id, row);
  else await remoteCreate(entity, row);
  await sleep(WRITE_DELAY_MS);
}

async function upsertEntity(entity: EntityName, tripId: string): Promise<void> {
  const localRows = dbList(entity, tripId);
  if (localRows.length === 0) return;
  const remoteRows = await remoteList<Row>(entity, tripId);
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  for (const row of localRows) {
    await upsertRow(entity, row, remoteIds);
  }
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
    await sleep(WRITE_DELAY_MS);
    notify("trips");
  }
  for (const entity of TRIP_ENTITIES) {
    await upsertEntity(entity, tripId);
  }
}
