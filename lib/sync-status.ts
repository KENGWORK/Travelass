// Tracks, per entity (+ optional trip scope), whether a background Google
// revalidate has ever succeeded — see lib/api.ts. Used to decide whether a
// page can trust its local cache immediately (flag present, even if the
// cached data is an empty array — a legitimately-empty trip is a known
// state) or must show a loading state until the first real fetch lands
// (flag absent — this device has never synced this data before).

function syncedKey(entity: string, tripId?: string): string {
  return `travelass:synced:${entity}:${tripId ?? "all"}`;
}

function isSynced(entity: string, tripId?: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(syncedKey(entity, tripId)) !== null;
}

function markSynced(entity: string, tripId?: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(syncedKey(entity, tripId), String(Date.now()));
}

// Gate for background revalidates: markSynced stores a timestamp, so a fresh
// sync within the TTL means the cache is new enough — skip the Sheets read.
// This is what keeps normal navigation (tab switches, opening search, pull
// refresh) from stacking up dozens of reads per minute and exhausting the
// Sheets API's per-minute quota, which then fails real writes too.
const REVALIDATE_TTL_MS = 15_000;

function shouldRevalidate(entity: string, tripId?: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(syncedKey(entity, tripId));
  if (raw === null) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  return Date.now() - last > REVALIDATE_TTL_MS;
}

export { syncedKey, isSynced, markSynced, shouldRevalidate };
