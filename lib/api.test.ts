import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sync-queue", () => ({
  enqueue: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  initSyncQueue: vi.fn(),
}));
vi.mock("@/lib/remote-api", () => ({
  remoteList: vi.fn(),
}));

import { apiList, apiCreate, apiUpdate, apiDelete } from "./api";
import { dbList, dbCreate } from "./local-db";
import { isSynced } from "./sync-status";
import { remoteList } from "./remote-api";
import { enqueue, flush } from "./sync-queue";

describe("api (local-first)", () => {
  const originalBackend = process.env.NEXT_PUBLIC_BACKEND;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND = originalBackend;
  });

  describe("without Google configured", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_BACKEND;
    });

    it("apiList resolves from local storage without calling remoteList", async () => {
      dbCreate("expenses", { id: "a", trip_id: "t1", amount_thb: 100 });
      const result = await apiList("expenses", "t1");
      expect(result).toEqual([{ id: "a", trip_id: "t1", amount_thb: 100 }]);
      expect(remoteList).not.toHaveBeenCalled();
    });

    it("apiCreate writes to local storage and does not enqueue a sync", async () => {
      const res = await apiCreate("expenses", { id: "a", trip_id: "t1" });
      expect(res).toEqual({ ok: true });
      expect(dbList("expenses", "t1")).toEqual([{ id: "a", trip_id: "t1" }]);
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe("with Google configured", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_BACKEND = "google";
    });

    it("apiList returns the local cache immediately (does not wait on remoteList)", async () => {
      dbCreate("expenses", { id: "stale", trip_id: "t1" });
      // Perpetually-pending — proves apiList's returned promise doesn't
      // depend on this ever settling. Never rejected, so nothing dangles;
      // a fresh mock is installed for every test via vi.clearAllMocks().
      (remoteList as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

      const result = await apiList("expenses", "t1");
      expect(result).toEqual([{ id: "stale", trip_id: "t1" }]);
    });

    it("a successful background revalidate overwrites the cache and marks it synced", async () => {
      dbCreate("expenses", { id: "stale", trip_id: "t1" });
      (remoteList as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "fresh", trip_id: "t1" }]);

      await apiList("expenses", "t1");
      await vi.waitFor(() => {
        expect(dbList("expenses", "t1")).toEqual([{ id: "fresh", trip_id: "t1" }]);
      });
      expect(isSynced("expenses", "t1")).toBe(true);
    });

    it("a failed background revalidate leaves the local cache untouched and unsynced", async () => {
      dbCreate("expenses", { id: "a", trip_id: "t1" });
      (remoteList as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

      await apiList("expenses", "t1");
      await new Promise((r) => setTimeout(r, 0)); // let the rejection settle

      expect(dbList("expenses", "t1")).toEqual([{ id: "a", trip_id: "t1" }]);
      expect(isSynced("expenses", "t1")).toBe(false);
    });

    it("apiCreate writes locally immediately and enqueues + flushes a sync", async () => {
      const result = await apiCreate("expenses", { id: "a", trip_id: "t1" });
      expect(result).toEqual({ ok: true });
      expect(dbList("expenses", "t1")).toEqual([{ id: "a", trip_id: "t1" }]);
      expect(enqueue).toHaveBeenCalledWith({ kind: "create", entity: "expenses", payload: { id: "a", trip_id: "t1" } });
      expect(flush).toHaveBeenCalled();
    });

    it("apiUpdate writes locally and enqueues an update op", async () => {
      dbCreate("expenses", { id: "a", trip_id: "t1", amount_thb: 1 });
      await apiUpdate("expenses", "a", { id: "a", trip_id: "t1", amount_thb: 2 });
      expect(dbList("expenses", "t1")).toEqual([{ id: "a", trip_id: "t1", amount_thb: 2 }]);
      expect(enqueue).toHaveBeenCalledWith({
        kind: "update",
        entity: "expenses",
        id: "a",
        payload: { id: "a", trip_id: "t1", amount_thb: 2 },
      });
    });

    it("apiDelete removes locally and enqueues a delete op", async () => {
      dbCreate("expenses", { id: "a", trip_id: "t1" });
      await apiDelete("expenses", "a");
      expect(dbList("expenses", "t1")).toEqual([]);
      expect(enqueue).toHaveBeenCalledWith({ kind: "delete", entity: "expenses", id: "a" });
    });
  });
});
