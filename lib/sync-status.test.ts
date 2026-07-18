import { describe, it, expect, beforeEach } from "vitest";
import { syncedKey, isSynced, markSynced, shouldRevalidate } from "./sync-status";

describe("sync-status", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("syncedKey scopes by entity and tripId", () => {
    expect(syncedKey("expenses", "t1")).toBe("travelass:synced:expenses:t1");
  });

  it("syncedKey falls back to 'all' when tripId is omitted (e.g. the trips list itself)", () => {
    expect(syncedKey("trips")).toBe("travelass:synced:trips:all");
  });

  it("isSynced is false before markSynced has been called", () => {
    expect(isSynced("expenses", "t1")).toBe(false);
  });

  it("isSynced is true after markSynced", () => {
    markSynced("expenses", "t1");
    expect(isSynced("expenses", "t1")).toBe(true);
  });

  it("marking one entity/trip does not affect a different entity or trip", () => {
    markSynced("expenses", "t1");
    expect(isSynced("expenses", "t2")).toBe(false);
    expect(isSynced("bookings", "t1")).toBe(false);
  });

  describe("shouldRevalidate", () => {
    it("true when never synced", () => {
      expect(shouldRevalidate("expenses", "t1")).toBe(true);
    });

    it("false immediately after markSynced (within TTL)", () => {
      markSynced("expenses", "t1");
      expect(shouldRevalidate("expenses", "t1")).toBe(false);
    });

    it("true again once the last sync is older than the TTL", () => {
      markSynced("expenses", "t1");
      const key = syncedKey("expenses", "t1");
      const past = Number(localStorage.getItem(key)) - 60_000;
      localStorage.setItem(key, String(past));
      expect(shouldRevalidate("expenses", "t1")).toBe(true);
    });

    it("true when the stored value is not a number (legacy/corrupt)", () => {
      localStorage.setItem(syncedKey("expenses", "t1"), "garbage");
      expect(shouldRevalidate("expenses", "t1")).toBe(true);
    });

    it("scopes are independent per entity and trip", () => {
      markSynced("expenses", "t1");
      expect(shouldRevalidate("expenses", "t2")).toBe(true);
      expect(shouldRevalidate("bookings", "t1")).toBe(true);
    });
  });
});
