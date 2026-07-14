import { NextRequest, NextResponse } from "next/server";
import { loadImage } from "@/lib/store";

// No auth guard — see middleware.ts, login is intentionally not required.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const { body, mime } = await loadImage(fileId);
  return new NextResponse(body as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" },
  });
}
