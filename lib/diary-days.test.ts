import { describe, it, expect } from "vitest";
import { defaultOpenDiaryDate, todayISO } from "./diary-days";

describe("defaultOpenDiaryDate", () => {
  it("picks today when today is one of the trip's days", () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03"];
    expect(defaultOpenDiaryDate(dates, "2026-09-02")).toBe("2026-09-02");
  });

  it("picks the first day when today is before the trip starts", () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03"];
    expect(defaultOpenDiaryDate(dates, "2026-08-20")).toBe("2026-09-01");
  });

  it("picks nothing (reading mode) when today is after the trip ends", () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03"];
    expect(defaultOpenDiaryDate(dates, "2026-09-10")).toBeNull();
  });

  it("returns null for an empty trip", () => {
    expect(defaultOpenDiaryDate([], "2026-09-02")).toBeNull();
  });
});

describe("todayISO", () => {
  it("formats a timestamp as local YYYY-MM-DD", () => {
    const t = new Date(2026, 8, 5, 23, 30).getTime(); // 5 Sep 2026, local time
    expect(todayISO(t)).toBe("2026-09-05");
  });

  it("pads single-digit month and day", () => {
    const t = new Date(2026, 0, 3).getTime(); // 3 Jan 2026
    expect(todayISO(t)).toBe("2026-01-03");
  });
});
