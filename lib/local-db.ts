// Client-side localStorage database. Pure transforms (below) are unit-tested;
// the read/write wrappers touch localStorage and are exercised in the browser.

export type Row = { id: string; trip_id?: string; [k: string]: unknown };
export type DB = Record<string, Row[]>;

export function selectRows(db: DB, entity: string, tripId?: string): Row[] {
  const rows = db[entity] ?? [];
  return tripId ? rows.filter((r) => r.trip_id === tripId) : rows;
}

export function insertRow(db: DB, entity: string, row: Row): DB {
  return { ...db, [entity]: [...(db[entity] ?? []), row] };
}

export function patchRow(db: DB, entity: string, id: string, patch: Partial<Row>): DB {
  const rows = db[entity] ?? [];
  if (!rows.some((r) => r.id === id)) return db;
  return { ...db, [entity]: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function removeRow(db: DB, entity: string, id: string): DB {
  return { ...db, [entity]: (db[entity] ?? []).filter((r) => r.id !== id) };
}

const KEY = "travelass:db";

function read(): DB {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as DB;
  } catch {
    return {};
  }
}

function write(db: DB): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(db));
}

export const dbList = (entity: string, tripId?: string): Row[] => selectRows(read(), entity, tripId);
export const dbCreate = (entity: string, row: Row): void => write(insertRow(read(), entity, row));
export const dbUpdate = (entity: string, id: string, patch: Partial<Row>): void =>
  write(patchRow(read(), entity, id, patch));
export const dbDelete = (entity: string, id: string): void => write(removeRow(read(), entity, id));
