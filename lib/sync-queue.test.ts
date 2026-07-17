import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueue, flush, queueLength, subscribeQueue } from "./sync-queue";
import { remoteCreate, remoteUpdate, remoteDelete } from "./remote-api";

vi.mock("./remote-api", () => ({
  remoteCreate: vi.fn(),
  remoteUpdate: vi.fn(),
  remoteDelete: vi.fn(),
}));

describe("sync-queue", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("enqueue adds an op to the queue", () => {
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    expect(queueLength()).toBe(1);
  });

  it("flush drains a successful op off the queue", async () => {
    (remoteCreate as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    await flush();
    expect(remoteCreate).toHaveBeenCalledWith("expenses", { id: "a" });
    expect(queueLength()).toBe(0);
  });

  it("stops at the first failure, leaving it and everything behind it queued", async () => {
    (remoteCreate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    enqueue({ kind: "create", entity: "expenses", payload: { id: "b" } });
    await flush();
    expect(queueLength()).toBe(2);
    expect(remoteCreate).toHaveBeenCalledTimes(1);
  });

  it("a later flush retries the same head-of-queue item and drains once it succeeds", async () => {
    (remoteCreate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    await flush();
    expect(queueLength()).toBe(1);

    (remoteCreate as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    await flush();
    expect(queueLength()).toBe(0);
    expect(remoteCreate).toHaveBeenCalledTimes(2);
  });

  it("routes update and delete ops to the matching remote function", async () => {
    (remoteUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (remoteDelete as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    enqueue({ kind: "update", entity: "expenses", id: "a", payload: { id: "a", amount: 5 } });
    enqueue({ kind: "delete", entity: "expenses", id: "b" });
    await flush();
    expect(remoteUpdate).toHaveBeenCalledWith("expenses", "a", { id: "a", amount: 5 });
    expect(remoteDelete).toHaveBeenCalledWith("expenses", "b");
  });

  it("notifies queue subscribers whenever the queue changes", () => {
    const cb = vi.fn();
    const unsubscribe = subscribeQueue(cb);
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
    enqueue({ kind: "create", entity: "expenses", payload: { id: "b" } });
    expect(cb).toHaveBeenCalledTimes(1); // not called again after unsubscribing
  });

  it("queue persists across a simulated reload (re-reading from localStorage)", async () => {
    enqueue({ kind: "create", entity: "expenses", payload: { id: "a" } });
    // Nothing keeps the queue in memory between calls other than localStorage
    // itself — queueLength() always re-reads it, so this just re-confirms
    // the write actually landed in storage rather than an in-memory var.
    const raw = localStorage.getItem("travelass:outbox");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(1);
  });
});
