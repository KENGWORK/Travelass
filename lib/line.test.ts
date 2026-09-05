import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyLineSignature,
  matchMemberName,
  sourceKey,
  buildNameQuickReply,
  buildSkipQuickReply,
  buildConfirmationFlex,
} from "./line";

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64");

describe("verifyLineSignature", () => {
  it("accepts a signature computed with the real channel secret", () => {
    const body = '{"events":[]}';
    const secret = "shh-its-a-secret";
    expect(verifyLineSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = '{"events":[]}';
    expect(verifyLineSignature(body, sign(body, "wrong-secret"), "shh-its-a-secret")).toBe(false);
  });

  it("rejects a tampered body", () => {
    const secret = "shh-its-a-secret";
    const signature = sign('{"events":[]}', secret);
    expect(verifyLineSignature('{"events":["tampered"]}', signature, secret)).toBe(false);
  });

  it("fails closed when no signature header is present", () => {
    expect(verifyLineSignature('{"events":[]}', null, "shh-its-a-secret")).toBe(false);
  });

  it("fails closed when the channel secret isn't configured", () => {
    const body = '{"events":[]}';
    expect(verifyLineSignature(body, sign(body, "anything"), undefined)).toBe(false);
  });
});

describe("matchMemberName", () => {
  const members = [{ name: "เก่ง" }, { name: "OMO" }];

  it("matches a member's name exactly", () => {
    expect(matchMemberName("เก่ง", members)).toBe("เก่ง");
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(matchMemberName(" omo ", members)).toBe("OMO");
  });

  it("returns empty when no member matches", () => {
    expect(matchMemberName("someone else", members)).toBe("");
  });

  it("returns empty when there's no display name to go on", () => {
    expect(matchMemberName(null, members)).toBe("");
  });
});

describe("sourceKey", () => {
  it("uses groupId for a group chat, not the individual sender's userId", () => {
    expect(sourceKey({ type: "group", groupId: "g1", userId: "u1" })).toBe("group:g1");
  });

  it("uses roomId for a multi-person chat", () => {
    expect(sourceKey({ type: "room", roomId: "r1", userId: "u1" })).toBe("room:r1");
  });

  it("uses userId for a direct 1:1 chat", () => {
    expect(sourceKey({ type: "user", userId: "u1" })).toBe("user:u1");
  });
});

describe("buildNameQuickReply", () => {
  it("offers one quick-reply button per trip member", () => {
    const qr = buildNameQuickReply([{ name: "เก่ง" }, { name: "OMO" }]);
    expect(qr?.items.map((i) => i.action.label)).toEqual(["เก่ง", "OMO"]);
    expect(qr?.items.every((i) => i.action.type === "message")).toBe(true);
  });

  it("returns undefined when the trip has no members to suggest", () => {
    expect(buildNameQuickReply([])).toBeUndefined();
  });
});

describe("buildSkipQuickReply", () => {
  it("offers a single button with the given label", () => {
    const qr = buildSkipQuickReply("ข้าม");
    expect(qr.items).toHaveLength(1);
    expect(qr.items[0].action).toEqual({ type: "message", label: "ข้าม", text: "ข้าม" });
  });
});

describe("buildConfirmationFlex", () => {
  it("includes the photo, payer, note, and a link to the money page", () => {
    const msg = buildConfirmationFlex({
      photoUrl: "https://travelass.vercel.app/api/img/abc",
      payer: "เก่ง",
      note: "ค่าแท็กซี่",
      moneyUrl: "https://travelass.vercel.app/trips/t1/money",
    });
    const json = JSON.stringify(msg);
    expect(msg.type).toBe("flex");
    expect(json).toContain("https://travelass.vercel.app/api/img/abc");
    expect(json).toContain("เก่ง");
    expect(json).toContain("ค่าแท็กซี่");
    expect(json).toContain("https://travelass.vercel.app/trips/t1/money");
  });

  it("omits the note line entirely when there's no note", () => {
    const msg = buildConfirmationFlex({
      photoUrl: "https://travelass.vercel.app/api/img/abc",
      payer: "เก่ง",
      note: "",
      moneyUrl: "https://travelass.vercel.app/trips/t1/money",
    });
    const bodyContents = JSON.stringify(msg.contents);
    // No stray empty text node where the note would have gone.
    expect(bodyContents.match(/"text":""/)).toBeNull();
  });
});
