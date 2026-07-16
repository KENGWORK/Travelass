import { apiList, apiDelete } from "@/lib/api";
import { ENTITIES, type EntityName } from "@/lib/models/mappers";

const CHILD_ENTITIES = (Object.keys(ENTITIES) as EntityName[]).filter((e) => e !== "trips");

// Deletes every row across every entity tab that belongs to this trip, then
// the trip row itself — otherwise deleting a trip would just hide it from
// the list while leaving its itinerary/expenses/bookings/etc rows behind
// forever in the Sheet.
export async function deleteTripCascade(tripId: string): Promise<void> {
  await Promise.all(
    CHILD_ENTITIES.map(async (entity) => {
      const rows = await apiList<{ id: string }>(entity, tripId);
      await Promise.all(rows.map((r) => apiDelete(entity, r.id)));
    }),
  );
  await apiDelete("trips", tripId);
}
