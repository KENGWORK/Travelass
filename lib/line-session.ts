import { listRows, updateRow, deleteRow } from "@/lib/store";
import type { LineSession } from "@/lib/models/types";

// Per-person LINE state, stored in the line_sessions sheet tab.
//   `${userKey}`      -> expense capture flow (30-minute TTL)
//   `${userKey}#ctx`  -> viewing context like lastPlanDate (no TTL)

export const SESSION_TTL_MS = 30 * 60 * 1000;
const CTX_SUFFIX = "#ctx";

export function isExpired(updatedAt: string, now: Date): boolean {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > SESSION_TTL_MS;
}

// The "j" mapper kind reads an empty cell (rows written before the data
// column existed) as [] -- sessions always want an object.
export function normalizeSessionData(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

async function findRow(id: string): Promise<LineSession | null> {
  const rows = await listRows<LineSession>("line_sessions");
  const found = rows.find((r) => r.id === id);
  return found ? { ...found, data: normalizeSessionData(found.data) } : null;
}

export async function readFlowSession(key: string, now: Date): Promise<LineSession | null> {
  const s = await findRow(key);
  if (!s) return null;
  if (isExpired(s.updated_at, now)) {
    // The pending expense it pointed at stays in the in-app queue.
    await deleteRow("line_sessions", key);
    return null;
  }
  return s;
}

export async function writeFlowSession(s: Omit<LineSession, "updated_at">, now: Date): Promise<void> {
  const row: LineSession = { ...s, data: normalizeSessionData(s.data), updated_at: now.toISOString() };
  // updateRow appends when the id isn't in the sheet yet.
  await updateRow<LineSession>("line_sessions", s.id, row);
}

export async function deleteFlowSession(key: string): Promise<void> {
  await deleteRow("line_sessions", key);
}

export async function readCtx(key: string): Promise<Record<string, unknown>> {
  return (await findRow(key + CTX_SUFFIX))?.data ?? {};
}

export async function writeCtx(key: string, tripId: string, patch: Record<string, unknown>, now: Date): Promise<void> {
  const id = key + CTX_SUFFIX;
  const prev = await findRow(id);
  const base = prev && prev.trip_id === tripId ? prev.data : {};
  const row: LineSession = { id, trip_id: tripId, expense_id: "", step: "ctx", updated_at: now.toISOString(), data: { ...base, ...patch } };
  await updateRow<LineSession>("line_sessions", id, row);
}
