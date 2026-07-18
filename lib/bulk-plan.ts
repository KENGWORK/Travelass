// Pure planning step for a bulk upsert against a sheet tab: given the rows a
// device wants to push and the sheet's current id column (A2:A, in order),
// decide which rows are appends and which overwrite an existing sheet row.
// Keeping this pure lets the quota-critical batching logic be unit tested
// without touching googleapis.

export interface BulkUpsertPlan<T> {
  creates: T[];
  // sheetRow is the 1-based spreadsheet row (A2 -> 2) to overwrite.
  updates: { row: T; sheetRow: number }[];
}

export function planBulkUpsert<T extends { id: string }>(rows: T[], sheetIds: string[]): BulkUpsertPlan<T> {
  const indexById = new Map<string, number>();
  sheetIds.forEach((id, i) => {
    if (!indexById.has(id)) indexById.set(id, i);
  });
  const plan: BulkUpsertPlan<T> = { creates: [], updates: [] };
  for (const row of rows) {
    const idx = indexById.get(row.id);
    if (idx === undefined) plan.creates.push(row);
    else plan.updates.push({ row, sheetRow: idx + 2 });
  }
  return plan;
}
