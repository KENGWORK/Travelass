import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadImage } from "@/lib/google/drive";

export async function POST(req: NextRequest) {
  if (!(await auth())?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const tripName = String(form.get("tripName") ?? "trip");
  const kind = form.get("kind") === "photos" ? "photos" : "slips";
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadImage(buf, file.type || "image/jpeg", tripName, kind, `${Date.now()}-${file.name}`);
  return NextResponse.json({ fileId });
}
