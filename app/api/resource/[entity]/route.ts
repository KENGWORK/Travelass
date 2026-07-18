import { NextRequest, NextResponse } from "next/server";
import { ENTITIES, type EntityName } from "@/lib/models/mappers";
import { listRows, appendRow, updateRow, deleteRow, bulkUpsertRows, ensureTabs } from "@/lib/store";

let tabsReady: Promise<void> | null = null;
const ready = () => (tabsReady ??= ensureTabs());

// No auth guard — see middleware.ts, login is intentionally not required.
async function guard(entity: string) {
  if (!(entity in ENTITIES)) return NextResponse.json({ error: "unknown entity" }, { status: 404 });
  await ready();
  return null;
}

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  const tripId = req.nextUrl.searchParams.get("trip_id") ?? undefined;
  return NextResponse.json(await listRows(entity as EntityName, tripId));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  await appendRow(entity as EntityName, await req.json());
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await updateRow(entity as EntityName, id, await req.json());
  return NextResponse.json({ ok: true });
}

// Bulk upsert: body is an array of complete rows. Costs a fixed ~3 Sheets
// API calls total instead of 1-2 per row — used by the force-upload button.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  const rows = await req.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "array required" }, { status: 400 });
  await bulkUpsertRows(entity as EntityName, rows);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteRow(entity as EntityName, id);
  return NextResponse.json({ ok: true });
}
