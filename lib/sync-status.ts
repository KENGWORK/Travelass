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

export { syncedKey, isSynced, markSynced };
