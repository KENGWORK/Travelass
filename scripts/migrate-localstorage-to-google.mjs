// scripts/migrate-localstorage-to-google.mjs
// One-time script. Run this AFTER Google Sheets/Drive env vars are set and
// the app has been redeployed with NEXT_PUBLIC_BACKEND=google.
//
// 1. In the OLD (local-mode) deployed app, open devtools console and run:
//      copy(localStorage.getItem("travelass:db"))
//    Paste the result into a file, e.g. old-data.json.
// 2. Run: npx tsx --env-file=.env.local --conditions=react-server scripts/migrate-localstorage-to-google.mjs old-data.json
//
// This uses the same lib/store.ts (and therefore the same env vars) the
// running app uses, so run it with the exact same .env.local the deployed
// app has. Unlike Next.js (which auto-loads .env.local), this script runs
// under bare `tsx`, which does NOT auto-load it — hence the explicit
// `--env-file=.env.local` flag above. Omitting it means the Google
// credentials env vars are all undefined and the script fails with a
// confusing Google API error instead of a clear one.
//
// Why `tsx` + `--conditions=react-server`:
//   - lib/store.ts is TypeScript and imports other modules via the `@/`
//     tsconfig path alias; plain `node` can't execute either. `tsx` handles
//     both out of the box.
//   - lib/store.ts also has `import "server-only"` at the top, which throws
//     unless the `react-server` module-resolution condition is active (the
//     condition Next.js's server runtime sets internally). Passing
//     `--conditions=react-server` to tsx makes Node's resolver pick
//     server-only's `react-server` export (a no-op empty module) instead of
//     the default export (which throws), so the import chain resolves the
//     same way it does inside Next's server runtime.

import { readFileSync } from "node:fs";
import { ENTITIES } from "../lib/models/mappers.ts";
import { ensureTabs, appendRow, saveImage } from "../lib/store.ts";
import { isDataUrl, decodeDataUrl } from "../lib/data-url.ts";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/migrate-localstorage-to-google.mjs <exported-localstorage.json>");
  process.exit(1);
}

const db = JSON.parse(readFileSync(path, "utf8"));

await ensureTabs();

// Every entity that can carry photo_ids/slip_photo_ids/pickup_photo_ids gets
// those arrays' data: URLs uploaded to Drive first, then the row is written
// to Sheets with the real Drive file ids in their place.
const PHOTO_FIELDS = ["photo_ids", "slip_photo_ids", "pickup_photo_ids"];

async function migrateRow(entity, row) {
  const patched = { ...row };
  for (const field of PHOTO_FIELDS) {
    if (!Array.isArray(patched[field])) continue;
    const uploaded = [];
    for (const value of patched[field]) {
      if (!isDataUrl(value)) {
        uploaded.push(value); // already a real id (re-running the script) — leave it
        continue;
      }
      const { buf, mime } = decodeDataUrl(value);
      const tripName = db.trips?.find((t) => t.id === row.trip_id)?.name ?? "trip";
      const kind = field === "slip_photo_ids" ? "slips" : "photos";
      const fileId = await saveImage(buf, mime, tripName, kind, `${row.id}-${uploaded.length}.jpg`);
      uploaded.push(fileId);
    }
    patched[field] = uploaded;
  }
  await appendRow(entity, patched);
}

for (const entity of Object.keys(ENTITIES)) {
  const rows = db[entity] ?? [];
  console.log(`Migrating ${entity}: ${rows.length} row(s)`);
  for (const row of rows) {
    await migrateRow(entity, row);
  }
}

console.log("\nDone. Check the Sheet and Drive folder, then verify the app in Google mode before");
console.log("wiping the old localStorage-only deployment's data.");
