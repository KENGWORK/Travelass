import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EntityName } from "@/lib/models/mappers";

// Local, file-backed store used when no Google credentials are configured
// (preview / MVP mode). Data persists in <cwd>/.data so it survives restarts.
const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UP_DIR = path.join(DATA_DIR, "uploads");

type Row = Record<string, unknown>;
type DB = Record<string, Row[]>;

// Serialize writes so concurrent requests can't clobber the JSON file.
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => fn());
  chain = run.then(() => {}, () => {});
  return run;
}

async function readDB(): Promise<DB> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8")) as DB;
  } catch {
    return {};
  }
}

async function writeDB(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

export async function ensureTabs(): Promise<void> {
  await fs.mkdir(UP_DIR, { recursive: true });
  await withLock(async () => writeDB(await readDB()));
}

export async function listRows<T>(entity: EntityName, tripId?: string): Promise<T[]> {
  const db = await readDB();
  const items = (db[entity] ?? []) as T[];
  return tripId ? items.filter((i) => (i as { trip_id?: string }).trip_id === tripId) : items;
}

export async function appendRow<T>(entity: EntityName, obj: T): Promise<void> {
  await withLock(async () => {
    const db = await readDB();
    (db[entity] ??= []).push(obj as Row);
    await writeDB(db);
  });
}

export async function updateRow<T>(entity: EntityName, id: string, obj: T): Promise<void> {
  await withLock(async () => {
    const db = await readDB();
    const arr = db[entity] ?? [];
    const idx = arr.findIndex((r) => (r as { id?: string }).id === id);
    if (idx === -1) throw new Error(`${entity}/${id} not found`);
    arr[idx] = { ...arr[idx], ...(obj as Row) };
    db[entity] = arr;
    await writeDB(db);
  });
}

export async function deleteRow(entity: EntityName, id: string): Promise<void> {
  await withLock(async () => {
    const db = await readDB();
    db[entity] = (db[entity] ?? []).filter((r) => (r as { id?: string }).id !== id);
    await writeDB(db);
  });
}

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function saveImage(buf: Buffer, mime: string): Promise<string> {
  await fs.mkdir(UP_DIR, { recursive: true });
  const ext = (mime.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const id = `${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UP_DIR, id), buf);
  return id;
}

export async function loadImage(id: string): Promise<{ buf: Buffer; mime: string }> {
  const safe = path.basename(id); // guard against path traversal
  const buf = await fs.readFile(path.join(UP_DIR, safe));
  const ext = safe.split(".").pop()?.toLowerCase() ?? "";
  return { buf, mime: EXT_MIME[ext] ?? "image/jpeg" };
}
