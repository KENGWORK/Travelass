import { NextResponse } from "next/server";
import { planChecklistDedupe } from "@/lib/bulk-plan";
import { listRows, deleteRow, ensureTabs } from "@/lib/store";
import type { ChecklistItem } from "@/lib/models/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One-time maintenance route: removes checklist rows duplicated by applying
// the standard template twice on different devices (different ids, so the
// id-based /api/admin/dedupe route can't catch these). Not linked from the
// UI -- hit directly.
export async function POST() {
  await ensureTabs();
  const rows = await listRows<ChecklistItem>("checklist");
  const removeIds = planChecklistDedupe(rows);
  for (const id of removeIds) {
    await deleteRow("checklist", id);
    await sleep(1200);
  }
  return NextResponse.json({ ok: true, removed: removeIds.length, ids: removeIds });
}
