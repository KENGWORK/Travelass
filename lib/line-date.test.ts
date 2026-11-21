import { describe, it, expect } from "vitest";
import {
  todayInTz,
  nowHHMMInTz,
  extractDate,
  tripDayIndex,
  addDays,
  thaiDateLabel,
  tripDateCtx,
  type TripDateCtx,
} from "./line-date";

// Thu 19 Nov 2026 .. Tue 24 Nov 2026, "today" = Fri 20 Nov.
const CTX: TripDateCtx = { start: "2026-11-19", end: "2026-11-24", today: "2026-11-20" };
// Trip that crosses New Year.
const NY: TripDateCtx = { start: "2026-12-28", end: "2027-01-03", today: "2026-12-30" };

describe("todayInTz / nowHHMMInTz", () => {
  it("Asia/Hong_Kong at 23:30 UTC is already the next day", () => {
    const now = new Date("2026-11-19T23:30:00Z");
    expect(todayInTz("Asia/Hong_Kong", now)).toBe("2026-11-20");
    expect(nowHHMMInTz("Asia/Hong_Kong", now)).toBe("07:30");
  });

  it("empty tz falls back to Asia/Bangkok", () => {
    const now = new Date("2026-11-19T16:30:00Z"); // HK 00:30 on the 20th, BKK 23:30 on the 19th
    expect(todayInTz("Asia/Hong_Kong", now)).toBe("2026-11-20");
    expect(todayInTz("", now)).toBe("2026-11-19");
    expect(nowHHMMInTz("Asia/Hong_Kong", now)).toBe("00:30");
    expect(nowHHMMInTz("", now)).toBe("23:30");
  });

  it("an invalid tz falls back to Asia/Bangkok instead of throwing", () => {
    const now = new Date("2026-11-19T16:30:00Z");
    expect(todayInTz("Not/AZone", now)).toBe("2026-11-19");
  });

  it("midnight renders as 00, never 24", () => {
    expect(nowHHMMInTz("Asia/Hong_Kong", new Date("2026-11-19T16:05:00Z"))).toBe("00:05");
  });
});

describe("extractDate: relative words", () => {
  it.each([
    ["วันนี้", "2026-11-20"],
    ["พรุ่งนี้", "2026-11-21"],
    ["มะรืน", "2026-11-22"],
    ["มะรืนนี้", "2026-11-22"],
    ["เมื่อวาน", "2026-11-19"],
    ["เมื่อวานนี้", "2026-11-19"],
  ])("%s -> %s", (word, date) => {
    expect(extractDate(word, CTX)).toEqual({ date, rest: "", outOfRange: false });
  });

  it("removes the token from the middle and keeps the rest", () => {
    expect(extractDate("ร้าน พรุ่งนี้ มงก๊ก", CTX)).toEqual({ date: "2026-11-21", rest: "ร้าน มงก๊ก", outOfRange: false });
  });
});

describe("extractDate: numeric d/m", () => {
  it("d/m uses the trip year", () => {
    expect(extractDate("21/11", CTX)).toEqual({ date: "2026-11-21", rest: "", outOfRange: false });
  });

  it("d/m/yyyy uses the given year", () => {
    expect(extractDate("21/11/2026", CTX).date).toBe("2026-11-21");
  });

  it("a Buddhist-era year is converted", () => {
    expect(extractDate("21/11/2569", CTX).date).toBe("2026-11-21");
  });

  it("a year outside 2000-2699 is not a year (and not a d/m date)", () => {
    expect(extractDate("21/11/1500", CTX).date).toBeNull();
  });

  it("flags a date outside the trip", () => {
    expect(extractDate("1/12", CTX)).toEqual({ date: "2026-12-01", rest: "", outOfRange: true });
  });

  it("an impossible date is not a date token", () => {
    expect(extractDate("31/2", CTX)).toEqual({ date: null, rest: "31/2", outOfRange: false });
  });

  it("accepts a leading วันที่", () => {
    expect(extractDate("วันที่ 21/11", CTX)).toEqual({ date: "2026-11-21", rest: "", outOfRange: false });
  });
});

describe("extractDate: day + month name", () => {
  it.each([
    ["20 พ.ย.", "2026-11-20"],
    ["20 พย", "2026-11-20"],
    ["22พ.ย.", "2026-11-22"],
    ["22 พฤศจิกายน", "2026-11-22"],
    ["20 nov", "2026-11-20"],
    ["20 November", "2026-11-20"],
    ["วันที่ 20 พ.ย.", "2026-11-20"],
  ])("%s -> %s", (text, date) => {
    expect(extractDate(text, CTX)).toEqual({ date, rest: "", outOfRange: false });
  });

  it("keeps the words around the token", () => {
    expect(extractDate("plan 20 nov 2", CTX)).toEqual({ date: "2026-11-20", rest: "plan 2", outOfRange: false });
  });

  it("accepts a CE or BE year after the month", () => {
    expect(extractDate("20 พ.ย. 2026", CTX)).toEqual({ date: "2026-11-20", rest: "", outOfRange: false });
    expect(extractDate("20 พ.ย. 2569", CTX)).toEqual({ date: "2026-11-20", rest: "", outOfRange: false });
  });

  it("does not take an amount as the year", () => {
    expect(extractDate("ตั๋ว 20 พ.ย. 1500", CTX)).toEqual({ date: "2026-11-20", rest: "ตั๋ว 1500", outOfRange: false });
  });

  it("does not match a Thai month abbreviation inside a Thai word", () => {
    expect(extractDate("3 มีคน", CTX)).toEqual({ date: null, rest: "3 มีคน", outOfRange: false });
    expect(extractDate("3 พยาบาล", CTX)).toEqual({ date: null, rest: "3 พยาบาล", outOfRange: false });
  });
});

describe("extractDate: trip day N", () => {
  it("วันที่ 3 is the third day of the trip", () => {
    expect(extractDate("วันที่ 3", CTX)).toEqual({ date: "2026-11-21", rest: "", outOfRange: false });
  });

  it("day 3 (English) works too", () => {
    expect(extractDate("day 3", CTX).date).toBe("2026-11-21");
  });

  it("a day number past the trip is out of range", () => {
    expect(extractDate("วันที่ 10", CTX)).toEqual({ date: "2026-11-28", rest: "", outOfRange: true });
  });

  it("'monday' is a weekday, not a 'day' token", () => {
    expect(extractDate("monday", CTX).date).toBe("2026-11-23");
  });
});

describe("extractDate: weekday names", () => {
  it("picks the first matching day on/after today inside the trip", () => {
    expect(extractDate("ศุกร์", CTX).date).toBe("2026-11-20");
    expect(extractDate("วันจันทร์", CTX)).toEqual({ date: "2026-11-23", rest: "", outOfRange: false });
    expect(extractDate("mon", CTX).date).toBe("2026-11-23");
    expect(extractDate("Sunday", CTX).date).toBe("2026-11-22");
  });

  it("falls back to the first matching trip day before today", () => {
    expect(extractDate("พฤหัส", CTX)).toEqual({ date: "2026-11-19", rest: "", outOfRange: false });
  });

  it("a weekday the trip never hits is out of range", () => {
    expect(extractDate("วันพุธ", CTX)).toEqual({ date: "2026-11-25", rest: "", outOfRange: true });
  });
});

describe("extractDate: year inference across New Year", () => {
  it("January dates land in the end year", () => {
    expect(extractDate("2/1", NY).date).toBe("2027-01-02");
    expect(extractDate("2 ม.ค.", NY).date).toBe("2027-01-02");
  });

  it("December dates stay in the start year", () => {
    expect(extractDate("30/12", NY).date).toBe("2026-12-30");
  });
});

describe("extractDate: first token wins / no token", () => {
  it("returns the earliest token and leaves later ones in rest", () => {
    expect(extractDate("พรุ่งนี้ 21/11", CTX)).toEqual({ date: "2026-11-21", rest: "21/11", outOfRange: false });
  });

  it("no token -> date null, rest is the cleaned text", () => {
    expect(extractDate("  ข้าวมันไก่   120 ", CTX)).toEqual({ date: null, rest: "ข้าวมันไก่ 120", outOfRange: false });
    expect(extractDate("รถ 50", CTX).date).toBeNull();
  });
});

describe("day math and labels", () => {
  it("tripDayIndex counts from 1", () => {
    expect(tripDayIndex("2026-11-19", "2026-11-19")).toBe(1);
    expect(tripDayIndex("2026-11-21", "2026-11-19")).toBe(3);
  });

  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("thaiDateLabel uses a short weekday and month", () => {
    expect(thaiDateLabel("2026-11-19")).toBe("พฤ 19 พ.ย.");
    expect(thaiDateLabel("2026-11-20")).toBe("ศ 20 พ.ย.");
  });

  it("tripDateCtx uses the trip timezone for today", () => {
    const ctx = tripDateCtx({ start_date: "2026-11-19", end_date: "2026-11-24", trip_timezone: "Asia/Hong_Kong" }, new Date("2026-11-19T16:30:00Z"));
    expect(ctx).toEqual({ start: "2026-11-19", end: "2026-11-24", today: "2026-11-20" });
  });
});
