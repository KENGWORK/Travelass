import { createHmac, timingSafeEqual } from "node:crypto";

export interface LineSource {
  type: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineEvent {
  type: string;
  replyToken?: string;
  source: LineSource;
  message?: { id: string; type: string };
}

// LINE signs the raw request body with the channel secret (HMAC-SHA256,
// base64) -- verifying it is the only thing standing between this route and
// anyone who finds the webhook URL, since the app has no login (see
// middleware.ts). timingSafeEqual needs equal-length buffers, so a length
// mismatch (e.g. no secret configured yet) fails closed rather than throwing.
export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string | undefined): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function fetchLineImageContent(messageId: string, accessToken: string): Promise<{ buf: Buffer; mime: string }> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`LINE content fetch failed: ${res.status}`);
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, mime };
}

// Group/room messages need the member-profile endpoint (scoped to that
// group/room); a direct 1:1 chat uses the plain user-profile endpoint.
// Best-effort: any failure (blocked profile, expired token, ...) just means
// no display name to match against, not a broken upload.
export async function fetchLineDisplayName(source: LineSource, accessToken: string): Promise<string | null> {
  if (!source.userId) return null;
  let url: string;
  if (source.type === "group" && source.groupId) url = `https://api.line.me/v2/bot/group/${source.groupId}/member/${source.userId}`;
  else if (source.type === "room" && source.roomId) url = `https://api.line.me/v2/bot/room/${source.roomId}/member/${source.userId}`;
  else url = `https://api.line.me/v2/bot/profile/${source.userId}`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string };
    return data.displayName ?? null;
  } catch {
    return null;
  }
}

// Matches the LINE sender's display name to a trip member so the pending
// expense's payer (and the color-coded queue thumbnail) is already set --
// exact match only (trimmed/case-insensitive), never a fuzzy guess that
// could silently attribute a slip to the wrong person.
export function matchMemberName(displayName: string | null, members: { name: string }[]): string {
  if (!displayName) return "";
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(displayName);
  return members.find((m) => norm(m.name) === target)?.name ?? "";
}

export async function replyLineMessage(replyToken: string, text: string, accessToken: string): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  }).catch(() => {}); // best-effort -- a failed reply shouldn't fail the webhook
}
