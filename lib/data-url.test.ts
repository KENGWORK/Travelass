import { describe, it, expect } from "vitest";
import { isDataUrl, decodeDataUrl } from "./data-url";

describe("data-url", () => {
  it("isDataUrl is true for a data: URL", () => {
    expect(isDataUrl("data:image/jpeg;base64,AAAA")).toBe(true);
  });

  it("isDataUrl is false for a plain Drive file id", () => {
    expect(isDataUrl("1a2b3c4d")).toBe(false);
  });

  it("decodeDataUrl extracts the mime type and decodes the base64 payload", () => {
    const original = Buffer.from("hello world");
    const b64 = original.toString("base64");
    const { buf, mime } = decodeDataUrl(`data:image/png;base64,${b64}`);
    expect(mime).toBe("image/png");
    expect(buf.toString()).toBe("hello world");
  });
});
