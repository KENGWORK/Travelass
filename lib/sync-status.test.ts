import { describe, it, expect, beforeEach } from "vitest";
import { syncedKey, isSynced, markSynced } from "./sync-status";

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
});
