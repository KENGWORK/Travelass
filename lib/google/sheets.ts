import { getSheets } from "./client";
import { ENTITIES, type EntityName } from "@/lib/models/mappers";

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

export async function deleteRow(entity: EntityName, id: string): Promise<void> {
  const row = await findRowIndex(entity, id);
  const meta = await getSheets().spreadsheets.get({ spreadsheetId: SSID() });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === entity)?.properties?.sheetId;
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: SSID(),
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] },
  });
}
