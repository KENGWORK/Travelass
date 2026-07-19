import { describe, it, expect } from "vitest";
import { tripDays, dayShortLabel } from "./days";

describe("tripDays", () => {
  it("lists inclusive dates with thai labels", () => {
    const d = tripDays("2026-07-10", "2026-07-12");
    expect(d).toHaveLength(3);
    expect(d[0]).toEqual({ date: "2026-07-10", label: "วัน 1 ศ. 10" });
    expect(d[2].date).toBe("2026-07-12");
    expect(d[2].label).toMatch(/^วัน 3/);
  });
  it("single-day trip", () => expect(tripDays("2026-07-10", "2026-07-10")).toHaveLength(1));
});

describe("dayShortLabel", () => {
  it("formats as '<dow>. <day>/<month> (<index>)'", () => {
    expect(dayShortLabel("2026-08-30", 1)).toBe("อา. 30/8 (1)");
  });
  it("single-digit day/month have no leading zero", () => {
    expect(dayShortLabel("2026-09-05", 7)).toBe("ส. 5/9 (7)");
  });
});
