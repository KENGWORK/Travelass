// Manual "push everything local up to Sheets" action — separate from the
// normal outbox (lib/sync-queue.ts), which only carries mutations made
// since it started listening. Each entity with local rows becomes ONE
// bulk-upsert request; the server batches that into ~3 Sheets API calls
// (see lib/google/sheets.ts bulkUpsertRows), so a full trip upload stays
// far under the Sheets per-minute quota that per-row uploads kept hitting.
// Upsert only — never deletes a remote row, since another device's local
// cache can lag behind what's actually on Sheets.
import { ENTITIES, type EntityName } from "@/lib/models/mappers";
import { dbList } from "@/lib/local-db";
import { remoteBulkUpsert } from "@/lib/remote-api";
import { markSynced } from "@/lib/sync-status";
import { notify } from "@/lib/notify";

const TRIP_ENTITIES = (Object.keys(ENTITIES) as EntityName[]).filter((e) => e !== "trips");
// Spacing between entity requests keeps the server-side Sheets calls of
// consecutive entities from overlapping into the same quota window.
const ENTITY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function uploadLocalToSheets(tripId: string): Promise<void> {
  const tripRow = dbList("trips").find((t) => t.id === tripId);
  if (tripRow) {
    await remoteBulkUpsert("trips", [tripRow]);
    notify("trips");
    await sleep(ENTITY_DELAY_MS);
  }
  for (const entity of TRIP_ENTITIES) {
    const localRows = dbList(entity, tripId);
    if (localRows.length === 0) continue;
    await remoteBulkUpsert(entity, localRows);
    markSynced(entity, tripId);
    notify(entity);
    await sleep(ENTITY_DELAY_MS);
  }
}
