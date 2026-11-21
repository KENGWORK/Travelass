// Flex Message building blocks shared by every LINE feature. Pure.
// Flex has no box-shadow, so the "clay" look is a cream base + white cards +
// big radii (same palette as the existing slip confirmation card).

export const CLAY = {
  cream: "#FFF3E8", card: "#FFFFFF", coral: "#F97362", peach: "#F5B78F",
  ink: "#5B4636", muted: "#8A7968", line: "#EADBCB",
  doneBg: "#E6F4EA", doneInk: "#2E7D4F", nextBg: "#E3F0FB", nextInk: "#1E5FA8", grayInk: "#A89A8C",
} as const;

export type FlexNode = Record<string, unknown>;

const POSTBACK_MAX = 300;
const ALT_TEXT_MAX = 400;
const TEXT_MAX = 5000;
const CLIPBOARD_MAX = 1000;
const QUICK_REPLY_MAX = 13;
const QUICK_REPLY_LABEL_MAX = 20;
const ALBUM_MAX = 12;

// Clip by code point so a Thai/emoji character is never cut in half.
function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("") : s;
}

export function txt(text: string | null | undefined, opts: Record<string, unknown> = {}): FlexNode | null {
  if (text == null || text.trim() === "") return null;
  return { type: "text", text, wrap: true, ...opts };
}

export function compact<T>(nodes: (T | null | undefined | false)[]): T[] {
  return nodes.filter((n): n is T => n !== null && n !== undefined && n !== false);
}

// Minimal escaping on purpose: URLSearchParams turns every Thai character
// into 9 chars ("%E0%B8%81"), which would blow the 300-char budget after
// ~30 Thai letters and cut off the amount at the end of "ตั๋วรถ ... 120".
// Only the four characters that mean something to this format are escaped.
function escapePart(s: string): string {
  return s.replace(/[%&=+]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function unescapePart(s: string): string {
  return s.replace(/%(25|26|3D|2B)/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

// LINE caps postback data at 300 chars. Only `q` (free text echoed back,
// e.g. the original message in an ambiguity question) is ever long, so
// that's the field that gets shortened -- as a last resort.
export function encodePostback(data: Record<string, string | number | undefined>): string {
  const entries: [string, string][] = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)]);
  const build = () => entries.map(([k, v]) => `${escapePart(k)}=${escapePart(v)}`).join("&");
  let out = build();
  const qi = entries.findIndex(([k]) => k === "q");
  if (out.length <= POSTBACK_MAX || qi === -1) return out;
  let chars = Array.from(entries[qi][1]);
  while (out.length > POSTBACK_MAX && chars.length > 0) {
    chars = chars.slice(0, -1);
    entries[qi] = ["q", chars.join("")];
    out = build();
  }
  return out;
}

export function decodePostback(data: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of data.split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const key = unescapePart(i === -1 ? pair : pair.slice(0, i));
    out[key] = i === -1 ? "" : unescapePart(pair.slice(i + 1));
  }
  return out;
}

export function postbackAction(label: string, data: Record<string, string | number | undefined>, displayText?: string): FlexNode {
  return { type: "postback", label, data: encodePostback(data), ...(displayText ? { displayText } : {}) };
}

export function uriAction(label: string, uri: string): FlexNode {
  return { type: "uri", label, uri };
}

export function clipboardAction(label: string, text: string): FlexNode {
  return { type: "clipboard", label, clipboardText: clip(text, CLIPBOARD_MAX) };
}

export function imageUrl(origin: string, photoId: string): string {
  return `${origin}/api/img/${encodeURIComponent(photoId)}`;
}

function photoBubble(url: string, caption: string): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    hero: { type: "image", url, size: "full", aspectRatio: "1:1", aspectMode: "cover", action: uriAction("ดูรูป", url) },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      backgroundColor: CLAY.cream,
      contents: compact([txt(caption, { size: "xs", color: CLAY.muted, align: "center" })]),
    },
  };
}

function moreBubble(message: string, moreUrl: string): FlexNode {
  return {
    type: "bubble",
    size: "kilo",
    action: uriAction("เปิดแอป", moreUrl),
    body: {
      type: "box",
      layout: "vertical",
      justifyContent: "center",
      paddingAll: "20px",
      backgroundColor: CLAY.cream,
      contents: compact([txt(message, { weight: "bold", color: CLAY.ink, align: "center" })]),
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "button", style: "primary", color: CLAY.peach, height: "sm", action: uriAction("เปิดแอป", moreUrl) }],
    },
  };
}

export function buildPhotoAlbum(p: { origin: string; photoIds: string[]; title: string; moreUrl: string }): FlexNode {
  const n = p.photoIds.length;
  if (n === 0) return { type: "carousel", contents: [moreBubble("ยังไม่มีรูป", p.moreUrl)] };
  const shown = n > ALBUM_MAX ? p.photoIds.slice(0, ALBUM_MAX - 1) : p.photoIds;
  const bubbles = shown.map((id, i) => photoBubble(imageUrl(p.origin, id), `${p.title} ${i + 1}/${n}`.trim()));
  if (n > ALBUM_MAX) bubbles.push(moreBubble(`ดูอีก ${n - (ALBUM_MAX - 1)} รูปในแอป`, p.moreUrl));
  return { type: "carousel", contents: bubbles };
}

export function flexMessage(altText: string, contents: FlexNode, quickReply?: FlexNode): FlexNode {
  return {
    type: "flex",
    altText: clip(altText.trim() || "TravelAss", ALT_TEXT_MAX),
    contents,
    ...(quickReply ? { quickReply } : {}),
  };
}

export function textMessage(text: string, quickReply?: FlexNode): FlexNode {
  return { type: "text", text: clip(text, TEXT_MAX), ...(quickReply ? { quickReply } : {}) };
}

export function quickReply(items: { label: string; data?: Record<string, string | number | undefined>; text?: string }[]): FlexNode {
  return {
    items: items.slice(0, QUICK_REPLY_MAX).map((it) => {
      const label = clip(it.label, QUICK_REPLY_LABEL_MAX);
      const action = it.data
        ? { type: "postback", label, data: encodePostback(it.data), displayText: it.text ?? it.label }
        : { type: "message", label, text: it.text ?? it.label };
      return { type: "action", action };
    }),
  };
}
