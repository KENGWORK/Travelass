import { describe, it, expect } from "vitest";
import { normalizeTime, formatTimeRange, computeDurationMin } from "./time";

describe("normalizeTime (24hr)", () => {
  it("returns '' for empty or non-numeric input", () => {
    expect(normalizeTime("")).toBe("");
    expect(normalizeTime("abc")).toBe("");
  });

  it("pads bare hours to HH:00", () => {
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("09")).toBe("09:00");
    expect(normalizeTime("23")).toBe("23:00");
  });

  it("parses 3-4 digit strings as HMM/HHMM", () => {
    expect(normalizeTime("930")).toBe("09:30");
    expect(normalizeTime("0930")).toBe("09:30");
    expect(normalizeTime("1045")).toBe("10:45");
  });

  it("respects an explicit colon", () => {
    expect(normalizeTime("9:30")).toBe("09:30");
    expect(normalizeTime("9:5")).toBe("09:05");
    expect(normalizeTime("23:59")).toBe("23:59");
  });

  it("clamps to 24hr range", () => {
    expect(normalizeTime("25")).toBe("23:00");
    expect(normalizeTime("24:00")).toBe("23:00");
    expect(normalizeTime("1099")).toBe("10:59");
  });
});

describe("formatTimeRange", () => {
  it("joins start and end with a dash", () => {
    expect(formatTimeRange("10:00", "11:00")).toBe("10:00 - 11:00");
  });
  it("shows start only when end is missing", () => {
    expect(formatTimeRange("10:00", "")).toBe("10:00");
    expect(formatTimeRange("10:00")).toBe("10:00");
  });
  it("returns '' when start is missing", () => {
    expect(formatTimeRange("", "")).toBe("");
  });
});

describe("computeDurationMin", () => {
  it("returns minutes between depart and arrive", () => {
    expect(computeDurationMin("10:00", "11:30")).toBe(90);
    expect(computeDurationMin("10:00", "10:00")).toBe(0);
  });
  it("treats an earlier arrive time as overnight (+1 day)", () => {
    expect(computeDurationMin("23:30", "00:15")).toBe(45);
  });
  it("returns 0 when either time is missing", () => {
    expect(computeDurationMin("10:00", "")).toBe(0);
    expect(computeDurationMin("", "11:00")).toBe(0);
    expect(computeDurationMin("", "")).toBe(0);
  });
});
