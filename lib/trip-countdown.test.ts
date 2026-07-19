import { describe, it, expect } from "vitest";
import { tripCountdown } from "./trip-countdown";

describe("tripCountdown", () => {
  it("done trip shows its date range", () => {
    const label = tripCountdown(
      { status: "done", start_date: "2026-01-01", end_date: "2026-01-05" },
      Date.parse("2026-06-01"),
    );
    expect(label).toBe("1 ม.ค. - 5 ม.ค.");
  });

  it("active trip mid-way shows the day number", () => {
    const label = tripCountdown(
      { status: "active", start_date: "2026-01-01", end_date: "2026-01-05" },
      Date.parse("2026-01-03"),
    );
    expect(label).toBe("วันที่ 3 ของทริป");
  });

  it("active trip whose start hasn't actually arrived yet falls back to a countdown, not a negative day", () => {
    const label = tripCountdown(
      { status: "active", start_date: "2026-08-30", end_date: "2026-09-05" },
      Date.parse("2026-07-19"),
    );
    expect(label).toBe("อีก 42 วัน");
  });

  it("planning trip shows days remaining", () => {
    const label = tripCountdown(
      { status: "planning", start_date: "2026-08-30", end_date: "2026-09-05" },
      Date.parse("2026-07-19"),
    );
    expect(label).toBe("อีก 42 วัน");
  });
});
