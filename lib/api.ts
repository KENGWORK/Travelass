import type { EntityName } from "@/lib/models/mappers";

async function handle<T>(p: Promise<Response>): Promise<T> {
  const res = await p;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
export const apiList = <T,>(entity: EntityName, tripId?: string): Promise<T[]> =>
  handle(fetch(`/api/resource/${entity}${tripId ? `?trip_id=${encodeURIComponent(tripId)}` : ""}`));
export const apiCreate = <T,>(entity: EntityName, obj: T) =>
  handle<{ ok: true }>(fetch(`/api/resource/${entity}`, { method: "POST", body: JSON.stringify(obj) }));
export const apiUpdate = <T,>(entity: EntityName, id: string, obj: T) =>
  handle<{ ok: true }>(fetch(`/api/resource/${entity}?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(obj) }));
export const apiDelete = (entity: EntityName, id: string) =>
  handle<{ ok: true }>(fetch(`/api/resource/${entity}?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
export const apiRate = (from: string) => handle<{ rate: number }>(fetch(`/api/fx?from=${from}`));
