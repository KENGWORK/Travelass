import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureTabs, listRows, updateRow, deleteRow, saveImage } from "@/lib/store";
import { buildPendingExpense } from "@/lib/pending-expense";
import {
  verifyLineSignature,
  fetchLineImageContent,
  replyLineMessage,
  replyLineMessages,
  sourceKey,
  buildNameQuickReply,
  buildSkipQuickReply,
  buildConfirmationFlex,
  type LineEvent,
} from "@/lib/line";
import type { Trip, Member, Expense, LineSession } from "@/lib/models/types";

const SKIP_LABEL = "ข้าม";

let tabsReady: Promise<void> | null = null;
const ready = () => (tabsReady ??= ensureTabs());

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

  await ready();
  const origin = req.nextUrl.origin;

  // LINE expects a fast 200 and retries on non-2xx -- handle events in
  // parallel and never let one failing event turn into a 500 that gets the
  // whole batch retried (including the ones that already saved fine).
  await Promise.all(
    (body.events ?? [])
      .filter((e) => e.type === "message" && (e.message?.type === "image" || e.message?.type === "text"))
      .map((e) => handleEvent(e, accessToken, origin).catch((err) => console.error("LINE event handling failed", err))),
  );

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: LineEvent, accessToken: string, origin: string): Promise<void> {
  if (event.message?.type === "image") return handleImageMessage(event, accessToken);
  if (event.message?.type === "text") return handleTextMessage(event, accessToken, origin);
}

function writeSession(id: string, tripId: string, expenseId: string, step: string): Promise<void> {
  const session: LineSession = { id, trip_id: tripId, expense_id: expenseId, step, updated_at: new Date().toISOString() };
  return updateRow<LineSession>("line_sessions", id, session);
}

// Step 1: a photo arrives. Save it as a pending expense right away (same
// draft-first idea as the in-app FAB -- the photo is never lost even if the
// rest of the conversation goes nowhere), then ask who it belongs to.
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

  const { buf, mime } = await fetchLineImageContent(event.message!.id, accessToken);
  const photoId = await saveImage(buf, mime, trip.name, "slips", `line-${Date.now()}.jpg`);

  const expenseId = randomUUID();
  const exp = buildPendingExpense({
    id: expenseId,
    tripId: trip.id,
    photoId,
    currency: trip.trip_currency,
    now: new Date().toISOString(),
  });
  await Promise.all([
    updateRow<Expense>("expenses", expenseId, exp), // self-heals to an append since expenseId is new
    writeSession(sourceKey(event.source), trip.id, expenseId, "awaiting_name"),
  ]);

  if (event.replyToken) {
    const members = await listRows<Member>("members", trip.id);
    await replyLineMessages(
      event.replyToken,
      [{ type: "text", text: "รับสลิปแล้ว 📸 ใครเป็นคนบันทึกรายการนี้?", quickReply: buildNameQuickReply(members) }],
      accessToken,
    );
  }
}

// Steps 2 and 3: whatever the chat says next is either the name or the
// note, depending on where its session says it's at. A stray text message
// with no session (e.g. small talk) is silently ignored -- no flow to
// attach it to.
async function handleTextMessage(event: LineEvent, accessToken: string, origin: string): Promise<void> {
  const key = sourceKey(event.source);
  const sessions = await listRows<LineSession>("line_sessions");
  const session = sessions.find((s) => s.id === key);
  if (!session) return;

  const text = (event.message!.text ?? "").trim();
  const expenses = await listRows<Expense>("expenses", session.trip_id);
  const exp = expenses.find((e) => e.id === session.expense_id);
  if (!exp) {
    await deleteRow("line_sessions", key);
    return;
  }

  if (session.step === "awaiting_name") {
    await Promise.all([
      updateRow<Expense>("expenses", exp.id, { ...exp, payer: text }),
      writeSession(key, session.trip_id, session.expense_id, "awaiting_note"),
    ]);
    if (event.replyToken) {
      await replyLineMessages(
        event.replyToken,
        [{ type: "text", text: `บันทึกคนบันทึกเป็น "${text}" แล้ว มีโน้ตอยากใส่ไหม? (พิมพ์ได้เลย หรือกดข้าม)`, quickReply: buildSkipQuickReply(SKIP_LABEL) }],
        accessToken,
      );
    }
    return;
  }

  if (session.step === "awaiting_note") {
    const note = text === SKIP_LABEL ? "" : text;
    await Promise.all([
      updateRow<Expense>("expenses", exp.id, { ...exp, description: note }),
      deleteRow("line_sessions", key),
    ]);
    if (event.replyToken) {
      const flex = buildConfirmationFlex({
        photoUrl: `${origin}/api/img/${encodeURIComponent(exp.slip_photo_ids[0])}`,
        payer: exp.payer,
        note,
        moneyUrl: `${origin}/trips/${exp.trip_id}/money`,
      });
      await replyLineMessages(event.replyToken, [flex], accessToken);
    }
  }
}
