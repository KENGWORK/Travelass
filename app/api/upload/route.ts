import { NextRequest, NextResponse } from "next/server";
import { saveImage } from "@/lib/store";

// No auth guard — see middleware.ts, login is intentionally not required.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const tripName = String(form.get("tripName") ?? "trip");
  const kind = form.get("kind") === "photos" ? "photos" : "slips";
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (max 15MB)" }, { status: 413 });
  }
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "only image uploads allowed" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const fileId = await saveImage(buf, file.type || "image/jpeg", tripName, kind, `${Date.now()}-${file.name}`);
  return NextResponse.json({ fileId });
}
