import { describe, it, expect } from "vitest";
import {
  normalizePlace, parsePlacesRest, encodePlaceFilter, decodePlaceFilter, filterPlaces, sortPlaces, topAreas,
  countPlaces, paginatePlaces, isPlaceFiltered, describePlaceFilter, placeMapsQuery, starLabel, type Place, type PlaceFilter,
} from "./line-places";
import { mkRestaurant, mkWish } from "./line-view.test-helpers";

const P = (p: Partial<Place>): Place => ({ id: "x", kind: "r", name: "", area: "", mapsLink: "", note: "", starred: false, visited: false, priceLevel: 0, photoIds: [], ...p });

describe("normalizePlace", () => {
  it("maps a restaurant (must_try → starred, keeps price)", () => {
    expect(normalizePlace(mkRestaurant({ id: "r1", name: "Kam's", area: "Wan Chai", maps_link: "https://g/x", must_try: true, price_level: 2, photo_ids: ["p"] }), "r"))
      .toEqual({ id: "r1", kind: "r", name: "Kam's", area: "Wan Chai", mapsLink: "https://g/x", note: "", starred: true, visited: false, priceLevel: 2, photoIds: ["p"] });
  });
  it("maps a wish item (star → starred, no price)", () => {
    const p = normalizePlace(mkWish({ id: "w1", name: "Peak", star: true, visited: true }), "w");
    expect(p).toMatchObject({ kind: "w", starred: true, visited: true, priceLevel: 0 });
  });
});

describe("parsePlacesRest", () => {
  it.each<[string, PlaceFilter]>([
    ["", { query: "" }],
    ["มงก๊ก", { query: "มงก๊ก" }],
    ["ต้องลอง", { starred: true, query: "" }],
    ["ดาว", { starred: true, query: "" }],
    ["ยังไม่ไป", { visited: false, query: "" }],
    ["ไปแล้ว", { visited: true, query: "" }],
    ["ยังไม่ไป มงก๊ก", { visited: false, query: "มงก๊ก" }],
    ["central", { query: "central" }],
  ])("%s", (rest, expected) => {
    expect(parsePlacesRest(rest)).toEqual(expected);
  });
});

describe("filter encoding", () => {
  it("round-trips through postback fields", () => {
    const f = { starred: true, visited: false, query: "TST" };
    expect(encodePlaceFilter(f)).toBe("s.v0");
    expect(decodePlaceFilter("s.v0", "TST")).toEqual(f);
    expect(decodePlaceFilter("v1", undefined)).toEqual({ visited: true, query: "" });
    expect(decodePlaceFilter(undefined, undefined)).toEqual({ query: "" });
    expect(encodePlaceFilter({ query: "" })).toBe("");
  });
});

describe("filterPlaces / sortPlaces", () => {
  const list = [
    P({ id: "a", name: "A", starred: true, visited: true, area: "Mong Kok" }),
    P({ id: "b", name: "B", note: "ห่านย่าง" }),
    P({ id: "c", name: "C", visited: true }),
    P({ id: "d", name: "D", starred: true }),
  ];
  const ids = (ps: Place[]) => ps.map((p) => p.id);
  it("filters by star, visited and query in name/area/note", () => {
    expect(ids(filterPlaces(list, { starred: true, query: "" }))).toEqual(["a", "d"]);
    expect(ids(filterPlaces(list, { visited: false, query: "" }))).toEqual(["b", "d"]);
    expect(ids(filterPlaces(list, { query: "mong" }))).toEqual(["a"]);
    expect(ids(filterPlaces(list, { query: "ห่าน" }))).toEqual(["b"]);
  });
  it("sorts starred → not visited → visited, by name within a group", () => {
    expect(ids(sortPlaces(list))).toEqual(["a", "d", "b", "c"]);
  });
});

describe("topAreas / countPlaces", () => {
  const list = [
    P({ area: "Mong Kok" }), P({ area: "Mong Kok" }), P({ area: "Mong Kok" }),
    P({ area: "TST", starred: true }), P({ area: "TST", visited: true }), P({ area: "" }), P({ area: "Central" }),
  ];
  it("counts, sorts and skips empty areas", () => {
    expect(topAreas(list, 4)).toEqual([{ area: "Mong Kok", count: 3 }, { area: "TST", count: 2 }, { area: "Central", count: 1 }]);
    expect(topAreas(list, 2)).toHaveLength(2);
  });
  it("countPlaces", () => {
    expect(countPlaces(list)).toEqual({ starred: 1, unvisited: 6, visited: 1 });
  });
});

describe("paginatePlaces", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  it("page 1: 10 with header", () => expect(paginatePlaces(items, 1)).toEqual({ items: items.slice(0, 10), remaining: 15, withHeader: true }));
  it("page 2: next 11, no header", () => expect(paginatePlaces(items, 2)).toEqual({ items: items.slice(10, 21), remaining: 4, withHeader: false }));
  it("page 3: rest", () => expect(paginatePlaces(items, 3)).toEqual({ items: items.slice(21), remaining: 0, withHeader: false }));
  it("≤ 10 fits on page 1", () => expect(paginatePlaces(items.slice(0, 10), 1).remaining).toBe(0));
});

describe("misc", () => {
  it("isPlaceFiltered / describePlaceFilter / starLabel / placeMapsQuery", () => {
    expect(isPlaceFiltered({ query: "" })).toBe(false);
    expect(isPlaceFiltered({ visited: false, query: "" })).toBe(true);
    expect(describePlaceFilter({ starred: true, visited: false, query: "TST" }, "r")).toBe("ต้องลอง · ยังไม่ไป · TST");
    expect(describePlaceFilter({ starred: true, query: "" }, "w")).toBe("ติดดาว");
    expect(starLabel("r")).toBe("ต้องลอง");
    expect(placeMapsQuery(P({ name: "Kam's", area: "Wan Chai" }))).toBe("Kam's Wan Chai");
    expect(placeMapsQuery(P({ name: "Kam's" }))).toBe("Kam's");
  });
});
