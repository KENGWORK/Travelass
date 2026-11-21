import { NextRequest, NextResponse } from "next/server";
import { ensureTabs, listRows } from "@/lib/store";
import { verifyLineSignature, replyLineMessages, userKey, isGroupChat, type LineEvent } from "@/lib/line";
import { dispatchEventWithTrip, isHandledEvent, type BaseCtx } from "@/lib/line-dispatch";
import type { FlexNode } from "@/lib/line-flex";
import type { Trip } from "@/lib/models/types";

const MAX_REPLY_MESSAGES = 5;
const TRIPS_CACHE_MS = 30_000;

let tabsReady: Promise<void> | null = null;
const ready = () => (tabsReady ??= ensureTabs());

// Per-instance cache of the ACTIVE trip only: a busy chat shouldn't re-read
// the trips tab on every message. "No active trip" is never cached, so
// switching a trip to "กำลังเที่ยว" in the app works on the very next
// message; other edits to the active trip show up within 30 seconds.
let activeTripCache: { at: number; trip: Trip } | null = null;

async function loadActiveTrip(now: Date): Promise<Trip | null> {
  const nowMs = now.getTime();
  if (activeTripCache && nowMs - activeTripCache.at <= TRIPS_CACHE_MS) return activeTripCache.trip;
  const trip = (await listRows<Trip>("trips")).find((t) => t.status === "active") ?? null;
  activeTripCache = trip ? { at: nowMs, trip } : null;
  return trip;
}

// No auth guard, matching every other route here (see middleware.ts) --
// LINE's signature check (verifyLineSignature) is what actually gates this
// one, since the URL itself is public. Everything past verification lives
// in lib/line-dispatch.ts.
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

  // From here on LINE always gets a 200: it retries non-2xx responses, which
  // would replay the whole batch (including events that already saved).
  try {
    // No replyToken = nothing we can answer (reply-only bot). isHandledEvent
    // also drops events whose source has no id at all.
    const events = (body.events ?? []).filter((e) => isHandledEvent(e) && !!e.replyToken);
    if (events.length === 0) return NextResponse.json({ ok: true });

    await ready();
    const origin = req.nextUrl.origin;
    const now = new Date();

    // Handle events in parallel; one failing event never fails the batch.
    await Promise.all(
      events.map(async (event) => {
        try {
          const replyToken = event.replyToken as string;
          const base: BaseCtx = {
            event,
            replyToken,
            accessToken,
            origin,
            now,
            userKey: userKey(event.source),
            isGroup: isGroupChat(event.source),
            reply: (messages: FlexNode[]) => replyLineMessages(replyToken, messages.slice(0, MAX_REPLY_MESSAGES), accessToken),
          };
          await dispatchEventWithTrip(base, () => loadActiveTrip(now));
        } catch (err) {
          console.error("LINE event handling failed", err);
        }
      }),
    );
  } catch (err) {
    console.error("LINE webhook failed", err);
  }

  return NextResponse.json({ ok: true });
}
