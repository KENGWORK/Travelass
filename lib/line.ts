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
  message?: { id: string; type: string; text?: string };
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

// Sends one or more message objects (text, or a richer type like flex) as
// the reply to a single incoming event. Best-effort: a failed reply
// shouldn't fail the webhook.
export async function replyLineMessages(replyToken: string, messages: unknown[], accessToken: string): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages }),
  }).catch(() => {});
}

export function replyLineMessage(replyToken: string, text: string, accessToken: string): Promise<void> {
  return replyLineMessages(replyToken, [{ type: "text", text }], accessToken);
}

// A conversation (image -> "who's this?" -> "any note?") spans several
// webhook events, each with its own replyToken -- this key is how the next
// text message gets matched back to the pending expense it belongs to.
// Scoped to the whole group/room (not the individual sender) so it works
// the same whether it's a 1:1 chat or a shared family group.
export function sourceKey(source: LineSource): string {
  if (source.type === "group" && source.groupId) return `group:${source.groupId}`;
  if (source.type === "room" && source.roomId) return `room:${source.roomId}`;
  return `user:${source.userId}`;
}

interface QuickReplyItem {
  type: "action";
  action: { type: "message"; label: string; text: string };
}

// One tappable button per trip member, so picking who captured the slip is
// usually a single tap instead of typing a name. LINE caps quick replies at
// 13 items; a trip realistically never has that many members.
export function buildNameQuickReply(members: { name: string }[]): { items: QuickReplyItem[] } | undefined {
  if (members.length === 0) return undefined;
  return {
    items: members.slice(0, 13).map((m) => ({
      type: "action",
      action: { type: "message", label: m.name, text: m.name },
    })),
  };
}

export function buildSkipQuickReply(skipLabel: string): { items: QuickReplyItem[] } {
  return { items: [{ type: "action", action: { type: "message", label: skipLabel, text: skipLabel } }] };
}

// Flex Messages have no real box-shadow, so the "clay" feel is approximated
// with a soft cream background, a bright white inner card, and generous
// corner radii instead -- as close to claymorphism as the format allows.
export function buildConfirmationFlex(params: { photoUrl: string; payer: string; note: string; moneyUrl: string }) {
  const infoLines: Record<string, unknown>[] = [
    { type: "text", text: "✅ บันทึกสลิปแล้ว", weight: "bold", size: "lg", color: "#F97362", wrap: true },
    { type: "text", text: `👤 ${params.payer}`, size: "md", color: "#5B4636", margin: "md", wrap: true },
  ];
  if (params.note) {
    infoLines.push({ type: "text", text: `📝 ${params.note}`, size: "sm", color: "#8A7968", margin: "sm", wrap: true });
  }

  return {
    type: "flex",
    altText: `บันทึกสลิปแล้ว - ${params.payer}`,
    contents: {
      type: "bubble",
      size: "kilo",
      hero: { type: "image", url: params.photoUrl, size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFF3E8",
        cornerRadius: "24px",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FFFFFF",
            cornerRadius: "18px",
            paddingAll: "16px",
            spacing: "sm",
            contents: infoLines,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#F5B78F",
            height: "sm",
            action: { type: "uri", label: "กรอกยอด/หมวดต่อ", uri: params.moneyUrl },
          },
        ],
      },
    },
  };
}
