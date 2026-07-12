import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadImage, PREVIEW } from "@/lib/store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!PREVIEW && !(await auth())?.user) return new NextResponse("unauthorized", { status: 401 });
  const { fileId } = await params;
  const { body, mime } = await loadImage(fileId);
  return new NextResponse(body as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" },
  });
}
