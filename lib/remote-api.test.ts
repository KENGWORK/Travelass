import { describe, it, expect, vi, beforeEach } from "vitest";
import { remoteList, remoteCreate, remoteUpdate, remoteDelete } from "./remote-api";

describe("remote-api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("remoteList GETs the entity list url and returns the parsed body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [{ id: "a" }] });
    const result = await remoteList("expenses", "t1");
    expect(fetch).toHaveBeenCalledWith("/api/resource/expenses?trip_id=t1");
    expect(result).toEqual([{ id: "a" }]);
  });

  it("remoteList omits the query string when no tripId is given", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [] });
    await remoteList("trips");
    expect(fetch).toHaveBeenCalledWith("/api/resource/trips");
  });

  it("remoteCreate POSTs the object as JSON", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await remoteCreate("expenses", { id: "a" });
    expect(fetch).toHaveBeenCalledWith("/api/resource/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "a" }),
    });
  });

  it("remoteUpdate PATCHes the item url", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await remoteUpdate("expenses", "a", { id: "a", amount: 1 });
    expect(fetch).toHaveBeenCalledWith("/api/resource/expenses?id=a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "a", amount: 1 }),
    });
  });

  it("remoteDelete DELETEs the item url", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await remoteDelete("expenses", "a");
    expect(fetch).toHaveBeenCalledWith("/api/resource/expenses?id=a", { method: "DELETE" });
  });

  it("throws when the response is not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });
    await expect(remoteList("expenses")).rejects.toThrow("API 500");
  });
});
