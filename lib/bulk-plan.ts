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

export interface DedupePlan {
  unique: string[][];
  duplicateCount: number;
}

// Given a sheet tab's raw A2:Z rows, drop every row after the first one
// with a given id (column A). Used by the one-time cleanup endpoint for
// rows a pre-quota-fix upload duplicated when a retry re-appended a row
// that had actually already landed.
export function planDedupe(rows: string[][]): DedupePlan {
  const seen = new Set<string>();
  const unique: string[][] = [];
  let duplicateCount = 0;
  for (const row of rows) {
    const id = row[0];
    if (!id) continue;
    if (seen.has(id)) {
      duplicateCount++;
      continue;
    }
    seen.add(id);
    unique.push(row);
  }
  return { unique, duplicateCount };
}

// One-time cleanup for checklist rows duplicated by applying the standard
// template twice on different devices (each generated its own fresh ids,
// so the id-based planDedupe above can't see these as duplicates). Two
// rows are a duplicate if they share the same trip, group, and item text;
// of each duplicate set, keeps a done:true row if one exists (real
// progress), otherwise keeps the first. Returns the ids to remove.
export function planChecklistDedupe(
  rows: { id: string; trip_id: string; group: string; item: string; done: boolean }[],
): string[] {
  const byKey = new Map<string, { id: string; done: boolean }[]>();
  for (const row of rows) {
    const key = row.trip_id + "|" + row.group + "|" + row.item;
    const list = byKey.get(key) ?? [];
    list.push({ id: row.id, done: row.done });
    byKey.set(key, list);
  }
  const removeIds: string[] = [];
  for (const list of byKey.values()) {
    if (list.length <= 1) continue;
    const keepIndex = list.findIndex((r) => r.done);
    const keep = keepIndex === -1 ? 0 : keepIndex;
    list.forEach((r, i) => {
      if (i !== keep) removeIds.push(r.id);
    });
  }
  return removeIds;
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
