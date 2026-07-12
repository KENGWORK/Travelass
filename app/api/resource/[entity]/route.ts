import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ENTITIES, type EntityName } from "@/lib/models/mappers";
import { listRows, appendRow, updateRow, deleteRow, ensureTabs, PREVIEW } from "@/lib/store";

let tabsReady: Promise<void> | null = null;
const ready = () => (tabsReady ??= ensureTabs());

async function guard(entity: string) {
  if (!PREVIEW && !(await auth())?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const err = await guard(entity); if (err) return err;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteRow(entity as EntityName, id);
  return NextResponse.json({ ok: true });
}
