import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getImageStream } from "@/lib/google/drive";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!(await auth())?.user) return new NextResponse("unauthorized", { status: 401 });
  const { fileId } = await params;
  const { stream, mime } = await getImageStream(fileId);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" },
  });
}
