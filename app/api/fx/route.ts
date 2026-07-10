import { NextRequest, NextResponse } from "next/server";
import { fetchRate } from "@/lib/fx";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "THB";
  try { return NextResponse.json({ rate: await fetchRate(from) }); }
  catch { return NextResponse.json({ rate: 0 }, { status: 502 }); }
}
