import { describe, it, expect } from "vitest";
import { defaultEndDate } from "./dates";

describe("defaultEndDate", () => {
  it("defaults end to start when end is empty", () => {
    expect(defaultEndDate("2026-09-10", "")).toBe("2026-09-10");
  });
  it("keeps a valid end that is on or after start", () => {
    expect(defaultEndDate("2026-09-10", "2026-09-12")).toBe("2026-09-12");
    expect(defaultEndDate("2026-09-10", "2026-09-10")).toBe("2026-09-10");
  });
  it("snaps end up to start when end is before start", () => {
    expect(defaultEndDate("2026-09-10", "2026-09-08")).toBe("2026-09-10");
  });
  it("leaves end untouched when start is empty", () => {
    expect(defaultEndDate("", "2026-09-08")).toBe("2026-09-08");
    expect(defaultEndDate("", "")).toBe("");
  });
});
