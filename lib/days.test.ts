import { describe, it, expect } from "vitest";
import { tripDays } from "./days";

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
