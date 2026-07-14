import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isGoogleBackend } from "./backend";

describe("isGoogleBackend", () => {
  const original = process.env.NEXT_PUBLIC_BACKEND;
  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND = original;
  });

  it("is false when NEXT_PUBLIC_BACKEND is unset", () => {
    delete process.env.NEXT_PUBLIC_BACKEND;
    expect(isGoogleBackend()).toBe(false);
  });

  it("is false when NEXT_PUBLIC_BACKEND is \"local\"", () => {
    process.env.NEXT_PUBLIC_BACKEND = "local";
    expect(isGoogleBackend()).toBe(false);
  });

  it("is true when NEXT_PUBLIC_BACKEND is \"google\"", () => {
    process.env.NEXT_PUBLIC_BACKEND = "google";
    expect(isGoogleBackend()).toBe(true);
  });

  it("is false for an unrecognized value (fails safe to local)", () => {
    process.env.NEXT_PUBLIC_BACKEND = "sheets-please";
    expect(isGoogleBackend()).toBe(false);
  });
});
