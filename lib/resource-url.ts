import type { EntityName } from "@/lib/models/mappers";

export function resourceListUrl(entity: EntityName, tripId?: string): string {
  const base = `/api/resource/${entity}`;
  return tripId ? `${base}?trip_id=${encodeURIComponent(tripId)}` : base;
}

export function resourceItemUrl(entity: EntityName, id: string): string {
  return `/api/resource/${entity}?id=${encodeURIComponent(id)}`;
}
