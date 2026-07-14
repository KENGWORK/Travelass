import { describe, it, expect } from "vitest";
import { photoUrl } from "./photo-url";

describe("photoUrl", () => {
  it("returns a data: URL unchanged", () => {
    const url = "data:image/jpeg;base64,AAAA";
    expect(photoUrl(url)).toBe(url);
  });

  it("routes an opaque Drive file id through /api/img/", () => {
    expect(photoUrl("1a2b3c4d5e")).toBe("/api/img/1a2b3c4d5e");
  });

  it("URL-encodes the id when building the /api/img/ path", () => {
    expect(photoUrl("weird id/with slash")).toBe("/api/img/weird%20id%2Fwith%20slash");
  });
});
