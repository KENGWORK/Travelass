import { NextResponse } from "next/server";
import { ENTITIES, type EntityName } from "@/lib/models/mappers";
import { dedupeRows, ensureTabs } from "@/lib/store";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One-time maintenance route: removes duplicate-id rows left behind by the
// pre-quota-fix force-upload button (a retry re-appended rows that had
// already landed on Sheets). Not linked from the UI — hit directly.
export async function POST() {
  await ensureTabs();
  const results: Record<string, number> = {};
  for (const entity of Object.keys(ENTITIES) as EntityName[]) {
    results[entity] = await dedupeRows(entity);
    await sleep(1200);
  }
  return NextResponse.json({ ok: true, removed: results });
}
