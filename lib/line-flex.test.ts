import { describe, it, expect } from "vitest";
import {
  CLAY,
  txt,
  compact,
  encodePostback,
  decodePostback,
  postbackAction,
  uriAction,
  clipboardAction,
  imageUrl,
  buildPhotoAlbum,
  flexMessage,
  textMessage,
  quickReply,
  type FlexNode,
} from "./line-flex";

describe("txt / compact", () => {
  it("returns null for empty or whitespace text (Flex rejects text: \"\")", () => {
    expect(txt("")).toBeNull();
    expect(txt("   ")).toBeNull();
    expect(txt(null)).toBeNull();
    expect(txt(undefined)).toBeNull();
  });

  it("builds a wrapping text node and merges options", () => {
    expect(txt("สวัสดี", { size: "sm", color: CLAY.ink })).toEqual({ type: "text", text: "สวัสดี", wrap: true, size: "sm", color: "#5B4636" });
  });

  it("compact drops null/undefined/false", () => {
    expect(compact([txt("a"), null, undefined, false, txt("")])).toEqual([{ type: "text", text: "a", wrap: true }]);
  });
});

describe("encodePostback / decodePostback", () => {
  it("round-trips and skips undefined values", () => {
    const encoded = encodePostback({ a: "bk_open", id: "b1", n: 3, skip: undefined });
    expect(encoded).not.toContain("skip");
    expect(decodePostback(encoded)).toEqual({ a: "bk_open", id: "b1", n: "3" });
  });

  it("round-trips Thai text and special characters", () => {
    const data = { a: "amb_go", t: "booking", q: "ตั๋วรถ 50 & อื่นๆ=? 1+1 100% %3D" };
    expect(decodePostback(encodePostback(data))).toEqual(data);
  });

  it("escapes only % & = + and leaves Thai raw", () => {
    expect(encodePostback({ a: "amb_expense", q: "ข้าว 50+20 & น้ำ=10 100%" })).toBe("a=amb_expense&q=ข้าว 50%2B20 %26 น้ำ%3D10 100%25");
  });

  it("keeps a 40-char Thai message ending in an amount intact", () => {
    const q = "ค่าตั๋วรถไฟความเร็วสูงไปเซินเจิ้นสองคน 120";
    expect(Array.from(q).length).toBeGreaterThanOrEqual(40);
    const encoded = encodePostback({ a: "amb_expense", q });
    expect(encoded.length).toBeLessThanOrEqual(300);
    expect(decodePostback(encoded)).toEqual({ a: "amb_expense", q });
  });

  it("shortens q (last resort) so the data stays within 300 characters", () => {
    const longQ = "ตั๋วรถไฟความเร็วสูง".repeat(20); // 380 chars
    const encoded = encodePostback({ a: "amb_expense", q: longQ });
    expect(encoded.length).toBeLessThanOrEqual(300);
    const decoded = decodePostback(encoded);
    expect(decoded.a).toBe("amb_expense");
    expect(decoded.q.length).toBeGreaterThan(0);
    expect(longQ.startsWith(decoded.q)).toBe(true);
  });

  it("leaves short data untouched", () => {
    expect(encodePostback({ a: "menu" })).toBe("a=menu");
  });
});

describe("actions", () => {
  it("postbackAction encodes data and only sets displayText when given", () => {
    expect(postbackAction("ดู", { a: "plan_day", d: "2026-11-20" })).toEqual({ type: "postback", label: "ดู", data: "a=plan_day&d=2026-11-20" });
    expect(postbackAction("ดู", { a: "menu" }, "เมนู")).toEqual({ type: "postback", label: "ดู", data: "a=menu", displayText: "เมนู" });
  });

  it("uriAction and clipboardAction", () => {
    expect(uriAction("เปิด", "https://x.test")).toEqual({ type: "uri", label: "เปิด", uri: "https://x.test" });
    expect(clipboardAction("📋 คัดลอก", "ABC123")).toEqual({ type: "clipboard", label: "📋 คัดลอก", clipboardText: "ABC123" });
  });

  it("imageUrl encodes the id", () => {
    expect(imageUrl("https://app.test", "a/b c")).toBe("https://app.test/api/img/a%2Fb%20c");
  });
});

describe("buildPhotoAlbum", () => {
  const base = { origin: "https://app.test", title: "ร้าน A", moreUrl: "https://app.test/trips/t1/places" };
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const bubbles = (album: FlexNode) => album.contents as FlexNode[];

  it("one bubble per photo, hero taps open the full image", () => {
    const album = buildPhotoAlbum({ ...base, photoIds: ids(3) });
    expect(album.type).toBe("carousel");
    expect(bubbles(album)).toHaveLength(3);
    const hero = bubbles(album)[0].hero as FlexNode;
    expect(hero.url).toBe("https://app.test/api/img/p1");
    expect((hero.action as FlexNode).uri).toBe("https://app.test/api/img/p1");
  });

  it("exactly 12 photos -> 12 photo bubbles, no 'more' bubble", () => {
    const album = buildPhotoAlbum({ ...base, photoIds: ids(12) });
    expect(bubbles(album)).toHaveLength(12);
    expect(JSON.stringify(album)).not.toContain("ดูอีก");
  });

  it("more than 12 -> 11 photos + a 'more in app' bubble", () => {
    const album = buildPhotoAlbum({ ...base, photoIds: ids(15) });
    const list = bubbles(album);
    expect(list).toHaveLength(12);
    expect(list.slice(0, 11).every((b) => b.hero)).toBe(true);
    const last = JSON.stringify(list[11]);
    expect(last).toContain("ดูอีก 4 รูปในแอป");
    expect(last).toContain(base.moreUrl);
  });

  it("no photos -> a single placeholder bubble", () => {
    const album = buildPhotoAlbum({ ...base, photoIds: [] });
    expect(bubbles(album)).toHaveLength(1);
    expect(JSON.stringify(album)).toContain("ยังไม่มีรูป");
  });

  it("never emits an empty text node", () => {
    const album = buildPhotoAlbum({ ...base, title: "", photoIds: ids(13) });
    expect(JSON.stringify(album)).not.toContain('"text":""');
  });
});

describe("messages", () => {
  it("flexMessage clips altText to 400 and attaches quickReply only when given", () => {
    const msg = flexMessage("ก".repeat(500), { type: "bubble" });
    expect(msg.type).toBe("flex");
    expect((msg.altText as string).length).toBe(400);
    expect("quickReply" in msg).toBe(false);
    const qr = quickReply([{ label: "x" }]);
    expect(flexMessage("alt", { type: "bubble" }, qr).quickReply).toBe(qr);
  });

  it("flexMessage never sends an empty altText", () => {
    expect(flexMessage("  ", { type: "bubble" }).altText).toBe("TravelAss");
  });

  it("textMessage", () => {
    expect(textMessage("hi")).toEqual({ type: "text", text: "hi" });
    const qr = quickReply([{ label: "x" }]);
    expect(textMessage("hi", qr)).toEqual({ type: "text", text: "hi", quickReply: qr });
  });
});

describe("quickReply", () => {
  it("caps at 13 items", () => {
    const qr = quickReply(Array.from({ length: 20 }, (_, i) => ({ label: `n${i}` })));
    expect((qr.items as unknown[]).length).toBe(13);
  });

  it("clips labels to 20 characters", () => {
    const qr = quickReply([{ label: "123456789012345678901234" }]);
    const action = (qr.items as FlexNode[])[0].action as FlexNode;
    expect(action.label).toBe("12345678901234567890");
  });

  it("data -> postback action, otherwise message action", () => {
    const qr = quickReply([
      { label: "💸 บันทึก", data: { a: "amb_expense", q: "ตั๋ว 50" } },
      { label: "ข้าม" },
      { label: "เก่ง", text: "ชื่อ เก่ง" },
    ]);
    const actions = (qr.items as FlexNode[]).map((i) => i.action as FlexNode);
    expect(actions[0]).toEqual({ type: "postback", label: "💸 บันทึก", data: encodePostback({ a: "amb_expense", q: "ตั๋ว 50" }), displayText: "💸 บันทึก" });
    expect(actions[1]).toEqual({ type: "message", label: "ข้าม", text: "ข้าม" });
    expect(actions[2]).toEqual({ type: "message", label: "เก่ง", text: "ชื่อ เก่ง" });
    expect((qr.items as FlexNode[]).every((i) => i.type === "action")).toBe(true);
  });
});
