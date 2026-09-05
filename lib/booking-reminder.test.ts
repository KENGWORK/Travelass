import { describe, it, expect } from "vitest";
import { eventStartMs, isReminderActive, upcomingReminders, countdownLabel, dismissKey } from "./booking-reminder";

const ts = (s: string) => new Date(s).getTime();

describe("eventStartMs", () => {
  it("uses date_from + time_from when a time is set", () => {
    expect(eventStartMs({ date_from: "2026-09-03", time_from: "09:00" })).toBe(ts("2026-09-03T09:00:00"));
  });

  it("falls back to midnight of date_from when no time is set", () => {
    expect(eventStartMs({ date_from: "2026-09-03", time_from: "" })).toBe(ts("2026-09-03T00:00:00"));
  });
});

describe("isReminderActive", () => {
  // From the worked example: today Sep 1, a 09:00 Disneyland ticket on Sep 3
  // should start reminding Sep 2 (the day before) and keep reminding through
  // 2 hours after the 09:00 start, i.e. until 11:00 on Sep 3.
  const booking = { date_from: "2026-09-03", time_from: "09:00" };

  it("is not active the day before the reminder window starts", () => {
    expect(isReminderActive(booking, ts("2026-09-01T23:59:00"))).toBe(false);
  });

  it("becomes active at the start of the day before the event", () => {
    expect(isReminderActive(booking, ts("2026-09-02T00:00:00"))).toBe(true);
  });

  it("stays active right up to the 2-hour grace cutoff", () => {
    expect(isReminderActive(booking, ts("2026-09-03T11:00:00"))).toBe(true);
  });

  it("is no longer active just after the grace cutoff", () => {
    expect(isReminderActive(booking, ts("2026-09-03T11:00:01"))).toBe(false);
  });

  it("date-only booking (no time) reminds for the day before and the day itself", () => {
    const dateOnly = { date_from: "2026-09-03", time_from: "" };
    expect(isReminderActive(dateOnly, ts("2026-09-02T00:00:00"))).toBe(true);
    expect(isReminderActive(dateOnly, ts("2026-09-03T23:59:00"))).toBe(true);
    expect(isReminderActive(dateOnly, ts("2026-09-04T00:00:01"))).toBe(false);
  });

  it("a booking with no date_from is never active", () => {
    expect(isReminderActive({ date_from: "", time_from: "" }, ts("2026-09-02T00:00:00"))).toBe(false);
  });
});

describe("countdownLabel", () => {
  const booking = { date_from: "2026-09-03", time_from: "09:00" };

  it("counts down in hours and minutes before the event starts", () => {
    expect(countdownLabel(booking, ts("2026-09-03T06:35:00"))).toBe("อีก 2 ชม. 25 นาที");
  });

  it("counts down in minutes only under an hour away", () => {
    expect(countdownLabel(booking, ts("2026-09-03T08:50:00"))).toBe("อีก 10 นาที");
  });

  it("omits the minutes part on an exact hour", () => {
    expect(countdownLabel(booking, ts("2026-09-02T09:00:00"))).toBe("อีก 24 ชม.");
  });

  it("reads as happening now during the grace period", () => {
    expect(countdownLabel(booking, ts("2026-09-03T09:30:00"))).toBe("ถึงเวลาแล้ว");
  });
});

describe("dismissKey", () => {
  it("scopes the key by booking id and day, so a dismissal doesn't carry over to the next day", () => {
    expect(dismissKey("b1", "2026-09-02")).toBe("travelass:dismissed-reminder:b1:2026-09-02");
  });
});

describe("upcomingReminders", () => {
  it("keeps only active bookings, soonest event first", () => {
    const soon = { id: "a", date_from: "2026-09-03", time_from: "09:00" };
    const later = { id: "b", date_from: "2026-09-03", time_from: "18:00" };
    const notYet = { id: "c", date_from: "2026-09-10", time_from: "09:00" };
    const result = upcomingReminders([later, notYet, soon], ts("2026-09-02T12:00:00"));
    expect(result.map((b) => b.id)).toEqual(["a", "b"]);
  });
});
