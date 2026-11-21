// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ listRows: vi.fn(), updateRow: vi.fn() }));

import { listRows, updateRow } from "@/lib/store";
import { handleRoute, handlePostback } from "./places";
import { NO_TRIP_TEXT, GONE_TEXT } from "@/lib/line-view-kit";
import { allText, postbacksOf, countBubbles, mkCtx, mkRestaurant, mkWish, repliedMessages } from "@/lib/line-view.test-helpers";

let DATA: Record<string, unknown[]>;

beforeEach(() => {
  DATA = {
    restaurants: [
      mkRestaurant({ id: "r1", name: "Kam's", area: "Wan Chai", must_try: true, photo_ids: ["p1", "p2"] }),
      mkRestaurant({ id: "r2", name: "Tim Ho Wan", area: "Mong Kok", visited: true }),
    ],
    wishlist: [mkWish({ id: "w1", name: "Peak", area: "Central", star: true })],
  };
  vi.mocked(listRows).mockReset();
  vi.mocked(updateRow).mockReset();
  vi.mocked(listRows).mockImplementation((async (entity: string) => DATA[entity] ?? []) as never);
  vi.mocked(updateRow).mockResolvedValue(undefined);
});

describe("places handleRoute", () => {
  it("no trip → no-trip text", async () => {
    const ctx = mkCtx({ trip: null });
    await handleRoute(ctx, { kind: "places", placeKind: "r", rest: "" });
    expect(allText(repliedMessages(ctx))).toBe(NO_TRIP_TEXT);
  });

  it("ignores other routes", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "booking", rest: "" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("ร้าน → restaurants carousel with header", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "places", placeKind: "r", rest: "" });
    expect(listRows).toHaveBeenCalledWith("restaurants", "t1");
    expect(countBubbles(repliedMessages(ctx))).toBe(3);
    expect(allText(repliedMessages(ctx))).toContain("🍜 ร้านอาหาร · 2");
  });

  it("ที่เที่ยว → wishlist", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "places", placeKind: "w", rest: "" });
    expect(listRows).toHaveBeenCalledWith("wishlist", "t1");
    expect(allText(repliedMessages(ctx))).toContain("Peak");
  });

  it("ร้าน ยังไม่ไป → only unvisited", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "places", placeKind: "r", rest: "ยังไม่ไป" });
    const text = allText(repliedMessages(ctx));
    expect(text).toContain("Kam's");
    expect(text).not.toContain("Tim Ho Wan");
  });
});

describe("places handlePostback", () => {
  it("pl_list with a query from a postback keeps the header (not a command)", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_list", k: "r", q: "Mong Kok" });
    expect(countBubbles(repliedMessages(ctx))).toBe(2);
  });

  it("pl_photos → album", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_photos", k: "r", id: "r1" });
    expect(JSON.stringify(repliedMessages(ctx))).toContain("/api/img/p2");
  });

  it("pl_visit with matching current value → writes visited=true and replies the updated card", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_visit", k: "r", id: "r1", v: "0" });
    expect(updateRow).toHaveBeenCalledWith("restaurants", "r1", expect.objectContaining({ id: "r1", visited: true, must_try: true }));
    expect(postbacksOf(repliedMessages(ctx))).toContainEqual({ a: "pl_unvisit", k: "r", id: "r1", v: "1" });
  });

  it("pl_unvisit on wishlist writes visited=false", async () => {
    DATA.wishlist = [mkWish({ id: "w1", name: "Peak", visited: true })];
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_unvisit", k: "w", id: "w1", v: "1" });
    expect(updateRow).toHaveBeenCalledWith("wishlist", "w1", expect.objectContaining({ visited: false }));
  });

  it("stale toggle (someone already changed it) → no write, current card", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_visit", k: "r", id: "r2", v: "0" }); // r2 is already visited
    expect(updateRow).not.toHaveBeenCalled();
    const msgs = repliedMessages(ctx);
    expect(allText(msgs)).toContain("สถานะเปลี่ยนไปแล้ว");
    expect(postbacksOf(msgs)).toContainEqual({ a: "pl_unvisit", k: "r", id: "r2", v: "1" });
  });

  it("deleted place → gone text, no write", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "pl_visit", k: "r", id: "nope", v: "0" });
    expect(updateRow).not.toHaveBeenCalled();
    expect(allText(repliedMessages(ctx))).toBe(GONE_TEXT);
  });
});
