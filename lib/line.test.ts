import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyLineSignature,
  matchMemberName,
  userKey,
  isGroupChat,
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

describe("userKey", () => {
  it("gives two people in the same group different keys", () => {
    const a = userKey({ type: "group", groupId: "g1", userId: "u1" });
    const b = userKey({ type: "group", groupId: "g1", userId: "u2" });
    expect(a).toBe("group:g1:user:u1");
    expect(b).toBe("group:g1:user:u2");
  });

  it("scopes a room member by room and user", () => {
    expect(userKey({ type: "room", roomId: "r1", userId: "u1" })).toBe("room:r1:user:u1");
  });

  it("uses just the userId for a 1:1 chat", () => {
    expect(userKey({ type: "user", userId: "u1" })).toBe("user:u1");
  });

  it("falls back to a shared 'unknown' key when LINE omits the userId", () => {
    expect(userKey({ type: "group", groupId: "g1" })).toBe("group:g1:user:unknown");
    expect(userKey({ type: "room", roomId: "r1" })).toBe("room:r1:user:unknown");
  });
});

describe("isGroupChat", () => {
  it("is true for groups and rooms", () => {
    expect(isGroupChat({ type: "group", groupId: "g1", userId: "u1" })).toBe(true);
    expect(isGroupChat({ type: "room", roomId: "r1", userId: "u1" })).toBe(true);
  });

  it("is false for a 1:1 chat", () => {
    expect(isGroupChat({ type: "user", userId: "u1" })).toBe(false);
  });
});
