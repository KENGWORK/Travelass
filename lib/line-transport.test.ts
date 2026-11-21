// lib/line-transport.test.ts
import { describe, it, expect } from "vitest";
import type { Transport } from "@/lib/models/types";
import {
  parseTransportQuery,
  departureTimes,
  effectiveDeparture,
  addMinutes,
  arrivalTime,
  isPast,
  sortTransports,
  nextTransport,
  countdown,
  modeIcon,
  searchTransports,
  runTransportSearch,
  transportDates,
} from "./line-transport";

const CTX = { start: "2026-11-19", end: "2026-11-23", today: "2026-11-20" };

function tr(over: Partial<Transport>): Transport {
  return {
    id: "x", trip_id: "t1", day_date: "2026-11-20", from: "A", to: "B", mode: "", pickup_point: "",
    pickup_photo_ids: [], departure_times: [], depart_time: "", arrive_time: "", duration_min: 0,
    alt_option: "", price_amount: 0, price_currency: "", fx_rate: 0, price_thb: 0, payer: "",
    pay_timing: "prepaid", paid: false, slip_photo_ids: [], notes: "", ...over,
  };
}

const ROUNDS = tr({ id: "m1", departure_times: ["09:00", "10:30", "12:00"], duration_min: 30 });

describe("parseTransportQuery", () => {
  it("next flag wins", () => expect(parseTransportQuery("", true, CTX)).toEqual({ kind: "next" }));
  it("empty rest is today", () => expect(parseTransportQuery("", false, CTX)).toEqual({ kind: "day", date: "2026-11-20" }));
  it("date tokens", () => {
    expect(parseTransportQuery("พรุ่งนี้", false, CTX)).toEqual({ kind: "day", date: "2026-11-21" });
    expect(parseTransportQuery("21/11", false, CTX)).toEqual({ kind: "day", date: "2026-11-21" });
    expect(parseTransportQuery("วันที่ 3", false, CTX)).toEqual({ kind: "day", date: "2026-11-21" });
  });
  it("anything else is a trip-wide search", () => {
    expect(parseTransportQuery("ดิสนีย์", false, CTX)).toEqual({ kind: "search", query: "ดิสนีย์", date: null, dateQuery: "" });
  });
  it("a date followed by more text keeps the full text as the query", () => {
    expect(parseTransportQuery("พรุ่งนี้ ดิสนีย์", false, CTX)).toEqual({
      kind: "search", query: "พรุ่งนี้ ดิสนีย์", date: "2026-11-21", dateQuery: "ดิสนีย์",
    });
    expect(parseTransportQuery("Sun Yat Sen", false, CTX)).toMatchObject({ kind: "search", query: "Sun Yat Sen" });
    expect(parseTransportQuery("1/12 ดิสนีย์", false, CTX)).toEqual({ kind: "search", query: "1/12 ดิสนีย์", date: null, dateQuery: "" });
  });
  it("date outside the trip", () => expect(parseTransportQuery("1/12", false, CTX)).toEqual({ kind: "out_of_range" }));
  it("collapses whitespace without eating the letter s", () => {
    expect(parseTransportQuery("  disney   bus ", false, CTX)).toMatchObject({ kind: "search", query: "disney bus" });
  });
});

describe("departureTimes / effectiveDeparture", () => {
  it("normalizes, dedupes and sorts rounds", () => {
    expect(departureTimes(tr({ departure_times: [" 12:00", "9:00", "09:00"] }))).toEqual(["09:00", "12:00"]);
  });
  it("today with rounds: first round at or after now, else the last one (exhausted)", () => {
    expect(effectiveDeparture(ROUNDS, "08:00", true)).toEqual({ time: "09:00", exhausted: false });
    expect(effectiveDeparture(ROUNDS, "10:00", true)).toEqual({ time: "10:30", exhausted: false });
    expect(effectiveDeparture(ROUNDS, "12:00", true)).toEqual({ time: "12:00", exhausted: false });
    expect(effectiveDeparture(ROUNDS, "13:00", true)).toEqual({ time: "12:00", exhausted: true });
  });
  it("rounds on another day: depart_time if set, else the first round", () => {
    expect(effectiveDeparture(ROUNDS, "13:00", false)).toEqual({ time: "09:00", exhausted: false });
    expect(effectiveDeparture({ ...ROUNDS, depart_time: "10:30" }, "13:00", false)).toEqual({ time: "10:30", exhausted: false });
  });
  it("single trip uses depart_time", () => {
    expect(effectiveDeparture(tr({ depart_time: "08:00" }), "10:00", true)).toEqual({ time: "08:00", exhausted: false });
  });
});

describe("addMinutes / arrivalTime", () => {
  it("addMinutes wraps past midnight", () => {
    expect(addMinutes("10:30", 30)).toBe("11:00");
    expect(addMinutes("23:50", 20)).toBe("00:10");
  });
  it("arrive_time belongs to depart_time", () => {
    expect(arrivalTime(tr({ depart_time: "08:00", arrive_time: "08:20" }), "08:00")).toBe("08:20");
  });
  it("otherwise departure + duration", () => {
    expect(arrivalTime(ROUNDS, "10:30")).toBe("11:00");
    expect(arrivalTime({ ...ROUNDS, depart_time: "09:00", arrive_time: "09:30" }, "12:00")).toBe("12:30");
  });
  it("no arrival info → empty", () => {
    expect(arrivalTime(tr({ depart_time: "08:00" }), "08:00")).toBe("");
  });
});

describe("isPast / sortTransports / nextTransport", () => {
  const ferry = tr({ id: "f1", depart_time: "08:00", arrive_time: "08:20" });
  const noArrive = tr({ id: "n1", depart_time: "09:00" });
  const overnight = tr({ id: "o1", depart_time: "23:00", arrive_time: "01:00" });
  const blank = tr({ id: "b1" });
  it("isPast by arrival, or by departure when there is no arrival", () => {
    expect(isPast(ferry, "10:00")).toBe(true);
    expect(isPast(ROUNDS, "10:00")).toBe(false);
    expect(isPast(ROUNDS, "13:00")).toBe(true);
    expect(isPast(noArrive, "10:00")).toBe(true);
    expect(isPast(overnight, "23:30")).toBe(false);
    expect(isPast(blank, "23:30")).toBe(false);
  });
  it("sorts by effective departure, blanks last", () => {
    expect(sortTransports([blank, ROUNDS, ferry], "10:00", true).map((t) => t.id)).toEqual(["f1", "m1", "b1"]);
  });
  it("next = earliest upcoming, not exhausted", () => {
    expect(nextTransport([ferry, ROUNDS], "10:00")?.id).toBe("m1");
    expect(nextTransport([ferry, ROUNDS], "13:00")).toBeNull();
  });
});

describe("countdown", () => {
  it("formats minutes and hours", () => {
    expect(countdown("10:00", "10:30")).toBe("อีก 30 นาที");
    expect(countdown("10:00", "11:00")).toBe("อีก 1 ชม.");
    expect(countdown("10:00", "11:15")).toBe("อีก 1 ชม. 15 นาที");
    expect(countdown("10:00", "10:00")).toBe("ออกตอนนี้");
  });
  it("does not count across midnight", () => expect(countdown("23:50", "00:10")).toBe(""));
});

describe("modeIcon", () => {
  it.each([
    ["MTR", "🚇"], ["รถไฟ", "🚇"], ["Airport Express train", "🚇"], ["Metro", "🚇"],
    ["Bus", "🚌"], ["บัส", "🚌"], ["รถเมล์", "🚌"],
    ["Ferry", "⛴"], ["เรือ", "⛴"],
    ["Taxi", "🚕"], ["แท็กซี่", "🚕"], ["DiDi", "🚕"], ["Uber", "🚕"], ["Grab", "🚕"],
    ["เดิน", "🚶"], ["walk", "🚶"],
    ["Flight", "✈️"], ["เครื่องบิน", "✈️"],
    ["cable car", "🧭"], ["", "🧭"],
  ])("%s → %s", (mode, icon) => expect(modeIcon(mode)).toBe(icon));
});

describe("searchTransports / transportDates", () => {
  const list = [
    tr({ id: "1", day_date: "2026-11-21", to: "Disneyland", depart_time: "09:00" }),
    tr({ id: "2", pickup_point: "Exit B Disney" }),
    tr({ id: "3", notes: "nothing here" }),
    tr({ id: "4", mode: "DISNEY bus", depart_time: "08:00" }),
    tr({ id: "5", day_date: "", notes: "disney shuttle" }),
  ];
  it("case-insensitive contains over from/to/mode/notes/pickup_point, by day then departure", () => {
    expect(searchTransports(list, "disney").map((t) => t.id)).toEqual(["4", "2", "1", "5"]);
  });
  it("blank query finds nothing", () => expect(searchTransports(list, "  ")).toEqual([]));
  it("runTransportSearch: full text first, then date + remainder", () => {
    const more = [...list, tr({ id: "s", to: "Sun Yat Sen Memorial Hall" })];
    expect(runTransportSearch(more, { query: "Sun Yat Sen", date: "2026-11-22", dateQuery: "Yat Sen" }).map((t) => t.id)).toEqual(["s"]);
    expect(runTransportSearch(more, { query: "พรุ่งนี้ disney", date: "2026-11-21", dateQuery: "disney" }).map((t) => t.id)).toEqual(["1"]);
    expect(runTransportSearch(more, { query: "zzz", date: null, dateQuery: "" })).toEqual([]);
  });
  it("transportDates are unique, sorted, non-empty", () => {
    expect(transportDates(list)).toEqual(["2026-11-20", "2026-11-21"]);
  });
});
