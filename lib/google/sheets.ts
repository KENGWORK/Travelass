import { getSheets } from "./client";
import { ENTITIES, type EntityName } from "@/lib/models/mappers";
import { planBulkUpsert, planDedupe } from "@/lib/bulk-plan";

const SSID = () => process.env.SPREADSHEET_ID!;

export async function ensureTabs(): Promise<void> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SSID() });
  const existing = new Set(meta.data.sheets?.map((s) => s.properties?.title) ?? []);
  const missing = Object.keys(ENTITIES).filter((t) => !existing.has(t));
  if (missing.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SSID(),
    requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  for (const title of missing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SSID(), range: `${title}!A1`, valueInputOption: "RAW",
      requestBody: { values: [ENTITIES[title as EntityName].columns] },
    });
  }
}

export async function listRows<T>(entity: EntityName, tripId?: string): Promise<T[]> {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SSID(), range: `${entity}!A2:Z` });
  const rows = (res.data.values ?? []) as string[][];
  const items = rows.filter((r) => r[0]).map((r) => ENTITIES[entity].fromRow(r) as T);
  return tripId ? items.filter((i) => (i as { trip_id?: string }).trip_id === tripId) : items;
}

async function findRowIndex(entity: EntityName, id: string): Promise<number> {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SSID(), range: `${entity}!A2:A` });
  const idx = (res.data.values ?? []).findIndex((r) => r[0] === id);
  if (idx === -1) throw new Error(`${entity}/${id} not found`);
  return idx + 2; // 1-based + header
}

export async function appendRow<T>(entity: EntityName, obj: T): Promise<void> {
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SSID(), range: `${entity}!A1`, valueInputOption: "RAW",
    requestBody: { values: [ENTITIES[entity].toRow(obj as never)] },
  });
}

export async function updateRow<T>(entity: EntityName, id: string, obj: T): Promise<void> {
  const row = await findRowIndex(entity, id);
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SSID(), range: `${entity}!A${row}`, valueInputOption: "RAW",
    requestBody: { values: [ENTITIES[entity].toRow(obj as never)] },
  });
}

// Upserts a whole batch of rows in a fixed number of Sheets API calls
// (1 read + at most 2 writes), regardless of row count. The per-row
// append/update path costs 1-2 API calls per row, which blows through the
// Sheets per-minute quota the moment a device force-uploads a real trip.
export async function bulkUpsertRows<T extends { id: string }>(entity: EntityName, rows: T[]): Promise<void> {
  if (rows.length === 0) return;
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SSID(), range: `${entity}!A2:A` });
  const sheetIds = ((res.data.values ?? []) as string[][]).map((r) => r[0] ?? "");
  const plan = planBulkUpsert(rows, sheetIds);
  if (plan.creates.length > 0) {
    await getSheets().spreadsheets.values.append({
      spreadsheetId: SSID(), range: `${entity}!A1`, valueInputOption: "RAW",
      requestBody: { values: plan.creates.map((row) => ENTITIES[entity].toRow(row as never)) },
    });
  }
  if (plan.updates.length > 0) {
    await getSheets().spreadsheets.values.batchUpdate({
      spreadsheetId: SSID(),
      requestBody: {
        valueInputOption: "RAW",
        data: plan.updates.map(({ row, sheetRow }) => ({
          range: `${entity}!A${sheetRow}`,
          values: [ENTITIES[entity].toRow(row as never)],
        })),
      },
    });
  }
}

// One-time cleanup: drops duplicate-id rows a tab picked up from the
// pre-quota-fix force-upload (a retry re-appending a row that had actually
// already landed on a prior attempt). Keeps the first occurrence of each
// id. Returns how many duplicate rows were removed.
export async function dedupeRows(entity: EntityName): Promise<number> {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SSID(), range: `${entity}!A2:Z` });
  const rows = (res.data.values ?? []) as string[][];
  const plan = planDedupe(rows);
  if (plan.duplicateCount === 0) return 0;
  await getSheets().spreadsheets.values.clear({ spreadsheetId: SSID(), range: `${entity}!A2:Z` });
  if (plan.unique.length > 0) {
    await getSheets().spreadsheets.values.update({
      spreadsheetId: SSID(), range: `${entity}!A2`, valueInputOption: "RAW",
      requestBody: { values: plan.unique },
    });
  }
  return plan.duplicateCount;
}

export async function deleteRow(entity: EntityName, id: string): Promise<void> {
  const row = await findRowIndex(entity, id);
  const meta = await getSheets().spreadsheets.get({ spreadsheetId: SSID() });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === entity)?.properties?.sheetId;
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: SSID(),
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] },
  });
}
