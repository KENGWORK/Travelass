import { describe, it, expect } from "vitest";
import { buildPlaceBubble, buildSinglePlaceMessage, buildPlacesCarousel, buildPlacesReply } from "./line-places-messages";
import { normalizePlace, sortPlaces, type Place } from "./line-places";
import { allText, actionsOf, postbacksOf, hasEmptyText, countBubbles, mkRestaurant, mkWish, mkTrip } from "./line-view.test-helpers";
import { imageUrl } from "./line-flex";

const ORIGIN = "https://app.test";
const r = (p: Parameters<typeof mkRestaurant>[0]) => normalizePlace(mkRestaurant(p), "r");
const w = (p: Parameters<typeof mkWish>[0]) => normalizePlace(mkWish(p), "w");

describe("buildPlaceBubble", () => {
  const withPhoto = r({ id: "r1", name: "Kam's Roast Goose", area: "Wan Chai", must_try: true, price_level: 2, note: "ห่านย่าง", photo_ids: ["p1", "p2"] });

  it("hero opens the full photo with the star badge", () => {
    const b = buildPlaceBubble(ORIGIN, withPhoto) as Record<string, unknown>;
    expect(actionsOf(b.hero).some((a) => a.type === "uri" && a.uri === imageUrl(ORIGIN, "p1"))).toBe(true);
    expect(allText(b.hero)).toContain("⭐ ต้องลอง");
    expect(allText(b.hero)).toContain("แตะเพื่อขยาย");
  });

  it("shows area + price, note, photos button, visit toggle and maps buttons", () => {
    const b = buildPlaceBubble(ORIGIN, withPhoto);
    expect(allText(b)).toContain("📍 Wan Chai · ฿฿");
    expect(allText(b)).toContain("ห่านย่าง");
    expect(postbacksOf(b)).toContainEqual({ a: "pl_photos", k: "r", id: "r1" });
    expect(postbacksOf(b)).toContainEqual({ a: "pl_visit", k: "r", id: "r1", v: "0" });
    expect(actionsOf(b).some((a) => a.type === "uri" && String(a.uri).includes("amap"))).toBe(true);
    expect(hasEmptyText(b)).toBe(false);
  });

  it("no photo → no hero, badge after the name, no photos button; visited → unvisit toggle", () => {
    const b = buildPlaceBubble(ORIGIN, r({ id: "r2", name: "Tsim Chai Kee", visited: true })) as Record<string, unknown>;
    expect(b.hero).toBeUndefined();
    expect(allText(b)).toContain("Tsim Chai Kee  ✓ ไปแล้ว");
    expect(postbacksOf(b).some((p) => p.a === "pl_photos")).toBe(false);
    expect(postbacksOf(b)).toContainEqual({ a: "pl_unvisit", k: "r", id: "r2", v: "1" });
    expect(hasEmptyText(b)).toBe(false);
  });

  it("starred AND visited shows both badges", () => {
    const withPic = buildPlaceBubble(ORIGIN, r({ id: "r3", name: "Yat Lok", must_try: true, visited: true, photo_ids: ["p1"] })) as Record<string, unknown>;
    expect(allText(withPic.hero)).toContain("⭐ ต้องลอง · ✓ ไปแล้ว");
    expect(allText(buildPlaceBubble(ORIGIN, r({ id: "r4", name: "Mak's", must_try: true, visited: true })))).toContain("Mak's  ⭐ ต้องลอง · ✓ ไปแล้ว");
  });

  it("wishlist: star label 'ติดดาว' and never a price", () => {
    const b = buildPlaceBubble(ORIGIN, w({ id: "w1", name: "Victoria Peak", area: "Central", star: true }));
    expect(allText(b)).toContain("⭐ ติดดาว");
    expect(allText(b)).not.toContain("฿");
    expect(postbacksOf(b)).toContainEqual({ a: "pl_visit", k: "w", id: "w1", v: "0" });
  });
});

describe("buildSinglePlaceMessage", () => {
  it("is a carousel with exactly one bubble", () => {
    expect(countBubbles(buildSinglePlaceMessage(ORIGIN, r({ id: "r1", name: "A" })))).toBe(1);
  });
});

describe("buildPlacesCarousel", () => {
  const many: Place[] = sortPlaces(Array.from({ length: 25 }, (_, i) => r({ id: `r${i}`, name: `R${String(i).padStart(2, "0")}`, area: i % 2 ? "Mong Kok" : "TST" })));
  const base = { origin: ORIGIN, kind: "r" as const, all: many, matched: many, filter: { query: "" } };

  it("page 1 = header + 10 + more (12 bubbles)", () => {
    const msg = buildPlacesCarousel({ ...base, page: 1 });
    expect(countBubbles(msg)).toBe(12);
    expect(allText(msg)).toContain("🍜 ร้านอาหาร · 25");
    expect(postbacksOf(msg).find((p) => p.a === "pl_list" && p.n === "2")).toMatchObject({ k: "r" });
  });

  it("page 2 = 11 + more, no header; page 3 = rest", () => {
    const p2 = buildPlacesCarousel({ ...base, page: 2 });
    expect(countBubbles(p2)).toBe(12);
    expect(allText(p2)).not.toContain("🍜 ร้านอาหาร · 25");
    expect(countBubbles(buildPlacesCarousel({ ...base, page: 3 }))).toBe(4);
  });

  it("header: counts, top-area buttons and the star filter", () => {
    const msg = buildPlacesCarousel({ ...base, page: 1 });
    expect(allText(msg)).toContain("ต้องลอง 0 · ยังไม่ไป 25 · ไปแล้ว 0");
    const pbs = postbacksOf(msg);
    expect(pbs).toContainEqual({ a: "pl_list", k: "r", q: "Mong Kok" });
    expect(pbs).toContainEqual({ a: "pl_list", k: "r", f: "s" });
  });

  it("filtered header shows the filter and a clear button", () => {
    const msg = buildPlacesCarousel({ ...base, matched: many.slice(0, 3), filter: { visited: false, query: "TST" }, page: 1 });
    expect(allText(msg)).toContain("กรอง: ยังไม่ไป · TST");
    expect(postbacksOf(msg)).toContainEqual({ a: "pl_list", k: "r" });
    expect(postbacksOf(msg).some((p) => p.f === "s")).toBe(false);
  });

  it("more card keeps the filter", () => {
    const msg = buildPlacesCarousel({ ...base, filter: { visited: false, query: "" }, page: 1 });
    expect(postbacksOf(msg).find((p) => p.n === "2")).toEqual({ a: "pl_list", k: "r", f: "v0", n: "2" });
  });

  it("has no empty text", () => {
    expect(hasEmptyText(buildPlacesCarousel({ ...base, page: 1 }))).toBe(false);
  });
});

describe("buildPlacesReply", () => {
  const base = { trip: mkTrip(), origin: ORIGIN, page: 1 };
  const places = [r({ id: "a", name: "Kam's", area: "Wan Chai", must_try: true }), r({ id: "b", name: "Tim Ho Wan", area: "Mong Kok" })];

  it("empty list → empty state with link to the right tab", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "w", places: [], filter: { query: "" }, fromCommand: true });
    expect(allText(msg)).toContain("ยังไม่มีที่เที่ยวในทริปนี้");
    expect(actionsOf(msg).some((a) => a.uri === "https://app.test/trips/t1/info?tab=wishlist")).toBe(true);
  });

  it("no match → 'ไม่เจอ' + area quick replies", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "r", places, filter: { query: "zzz" }, fromCommand: true });
    expect(allText(msg)).toContain("ไม่เจอ 'zzz'");
    expect(postbacksOf(msg)).toEqual([
      { a: "pl_list", k: "r", q: "Mong Kok" },
      { a: "pl_list", k: "r", q: "Wan Chai" },
    ]);
  });

  it("one match with a query from a command → single bubble, no header", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "r", places, filter: { query: "kam" }, fromCommand: true });
    expect(countBubbles(msg)).toBe(1);
  });

  it("one match with only a filter → header + 1", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "r", places, filter: { starred: true, query: "" }, fromCommand: true });
    expect(countBubbles(msg)).toBe(2);
  });

  it("no filter → header + all", () => {
    const [msg] = buildPlacesReply({ ...base, kind: "r", places, filter: { query: "" }, fromCommand: true });
    expect(countBubbles(msg)).toBe(3);
  });

  it("a stale page beyond the end falls back to page 1", () => {
    const [msg] = buildPlacesReply({ ...base, page: 9, kind: "r", places, filter: { query: "" }, fromCommand: false });
    expect(countBubbles(msg)).toBe(3);
  });
});
