import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyLineSignature, matchMemberName } from "./line";

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
