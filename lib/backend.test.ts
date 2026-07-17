import { describe, it, expect, afterEach } from "vitest";
import { isGoogleConfigured } from "./backend";

describe("isGoogleConfigured", () => {
  const original = process.env.NEXT_PUBLIC_BACKEND;
  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND = original;
  });

  it("is false when NEXT_PUBLIC_BACKEND is unset", () => {
    delete process.env.NEXT_PUBLIC_BACKEND;
    expect(isGoogleConfigured()).toBe(false);
  });

  it("is false when NEXT_PUBLIC_BACKEND is \"local\"", () => {
    process.env.NEXT_PUBLIC_BACKEND = "local";
    expect(isGoogleConfigured()).toBe(false);
  });

  it("is true when NEXT_PUBLIC_BACKEND is \"google\"", () => {
    process.env.NEXT_PUBLIC_BACKEND = "google";
    expect(isGoogleConfigured()).toBe(true);
  });

  it("is false for an unrecognized value (fails safe)", () => {
    process.env.NEXT_PUBLIC_BACKEND = "sheets-please";
    expect(isGoogleConfigured()).toBe(false);
  });
});
