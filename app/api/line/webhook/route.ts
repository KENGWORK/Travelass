import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { listRows, appendRow, saveImage } from "@/lib/store";
import { buildPendingExpense } from "@/lib/pending-expense";
import {
  verifyLineSignature,
  fetchLineImageContent,
  fetchLineDisplayName,
  replyLineMessage,
  matchMemberName,
  type LineEvent,
} from "@/lib/line";
import type { Trip, Member, Expense } from "@/lib/models/types";

// No auth guard, matching every other route here (see middleware.ts) --
// LINE's signature check (verifyLineSignature) is what actually gates this
// one, since the URL itself is public.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");
  if (!verifyLineSignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "LINE not configured" }, { status: 500 });

  let body: { events?: LineEvent[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // LINE expects a fast 200 and retries on non-2xx -- handle events in
  // parallel and never let one failing event turn into a 500 that gets the
  // whole batch retried (including the ones that already saved fine).
  await Promise.all(
    (body.events ?? [])
      .filter((e) => e.type === "message" && e.message?.type === "image")
      .map((e) => handleImageMessage(e, accessToken).catch((err) => console.error("LINE image handling failed", err))),
  );

  return NextResponse.json({ ok: true });
}

async function handleImageMessage(event: LineEvent, accessToken: string): Promise<void> {
  const trips = await listRows<Trip>("trips");
  const trip = trips.find((t) => t.status === "active");
  if (!trip) {
    if (event.replyToken) {
      await replyLineMessage(
        event.replyToken,
        'ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนแล้วส่งรูปมาใหม่นะ',
        accessToken,
      );
    }
    return;
  }

  const [{ buf, mime }, displayName, members] = await Promise.all([
    fetchLineImageContent(event.message!.id, accessToken),
    fetchLineDisplayName(event.source, accessToken),
    listRows<Member>("members", trip.id),
  ]);
  const payer = matchMemberName(displayName, members);

  const photoId = await saveImage(buf, mime, trip.name, "slips", `line-${Date.now()}.jpg`);

  const exp = buildPendingExpense({
    id: randomUUID(),
    tripId: trip.id,
    photoId,
    currency: trip.trip_currency,
    now: new Date().toISOString(),
    payer,
  });
  await appendRow<Expense>("expenses", exp);

  if (event.replyToken) {
    await replyLineMessage(
      event.replyToken,
      `บันทึกสลิปแล้ว ✅ กรอกยอด/หมวดต่อได้ที่แอป\nhttps://travelass.vercel.app/trips/${trip.id}/money`,
      accessToken,
    );
  }
}
