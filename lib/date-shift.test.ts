import { describe, it, expect } from "vitest";
import { daysBetween, shiftDate } from "./date-shift";

describe("daysBetween", () => {
  it("positive when b is after a", () => {
    expect(daysBetween("2026-07-07", "2026-07-09")).toBe(2);
  });
  it("negative when b is before a", () => {
    expect(daysBetween("2026-07-09", "2026-07-07")).toBe(-2);
  });
  it("zero for the same date", () => {
    expect(daysBetween("2026-07-07", "2026-07-07")).toBe(0);
  });
  it("crosses a month boundary correctly", () => {
    expect(daysBetween("2026-07-30", "2026-08-02")).toBe(3);
  });
});

describe("shiftDate", () => {
  it("adds days", () => {
    expect(shiftDate("2026-07-07", 2)).toBe("2026-07-09");
  });
  it("subtracts days", () => {
    expect(shiftDate("2026-07-09", -2)).toBe("2026-07-07");
  });
  it("zero shift is a no-op", () => {
    expect(shiftDate("2026-07-07", 0)).toBe("2026-07-07");
  });
  it("rolls over a month boundary", () => {
    expect(shiftDate("2026-07-30", 3)).toBe("2026-08-02");
  });
  it("empty string stays empty (unset date field)", () => {
    expect(shiftDate("", 2)).toBe("");
  });
});
