// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/store", () => ({
  listRows: vi.fn(),
  updateRow: vi.fn().mockResolvedValue(undefined),
  deleteRow: vi.fn().mockResolvedValue(undefined),
}));

import { listRows, updateRow, deleteRow } from "@/lib/store";
import {
  SESSION_TTL_MS,
  isExpired,
  normalizeSessionData,
  readFlowSession,
  writeFlowSession,
  deleteFlowSession,
  readCtx,
  writeCtx,
} from "./line-session";
import type { LineSession } from "@/lib/models/types";

const NOW = new Date("2026-11-20T03:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const KEY = "group:g1:user:u1";

function row(over: Partial<LineSession>): LineSession {
  return { id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_name", updated_at: minutesAgo(1), data: {}, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listRows).mockResolvedValue([]);
});

describe("isExpired", () => {
  it("TTL is 30 minutes", () => {
    expect(SESSION_TTL_MS).toBe(1_800_000);
  });

  it("fresh within 30 minutes, expired after", () => {
    expect(isExpired(minutesAgo(29), NOW)).toBe(false);
    expect(isExpired(minutesAgo(30), NOW)).toBe(false);
    expect(isExpired(minutesAgo(31), NOW)).toBe(true);
  });

  it("an empty or garbage timestamp counts as expired", () => {
    expect(isExpired("", NOW)).toBe(true);
    expect(isExpired("not a date", NOW)).toBe(true);
  });
});

describe("normalizeSessionData", () => {
  it("turns [] (the mapper's empty-cell value) into {}", () => {
    expect(normalizeSessionData([])).toEqual({});
  });

  it("turns null / primitives into {}", () => {
    expect(normalizeSessionData(null)).toEqual({});
    expect(normalizeSessionData("x")).toEqual({});
    expect(normalizeSessionData(3)).toEqual({});
  });

  it("keeps a real object", () => {
    expect(normalizeSessionData({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("readFlowSession", () => {
  it("returns null when there is no row", async () => {
    expect(await readFlowSession(KEY, NOW)).toBeNull();
  });

  it("returns a fresh row with data normalized from [] to {}", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ data: [] as unknown as Record<string, unknown> })]);
    const s = await readFlowSession(KEY, NOW);
    expect(s?.step).toBe("awaiting_name");
    expect(s?.data).toEqual({});
    expect(listRows).toHaveBeenCalledWith("line_sessions");
  });

  it("deletes an expired row and returns null", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ updated_at: minutesAgo(45) })]);
    expect(await readFlowSession(KEY, NOW)).toBeNull();
    expect(deleteRow).toHaveBeenCalledWith("line_sessions", KEY);
  });

  it("does not confuse the ctx row with the flow row", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, step: "ctx" })]);
    expect(await readFlowSession(KEY, NOW)).toBeNull();
  });
});

describe("writeFlowSession / deleteFlowSession", () => {
  it("stamps updated_at with now", async () => {
    await writeFlowSession({ id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_note", data: { a: 1 } }, NOW);
    expect(updateRow).toHaveBeenCalledWith("line_sessions", KEY, {
      id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_note", data: { a: 1 }, updated_at: NOW.toISOString(),
    });
  });

  it("deletes by key", async () => {
    await deleteFlowSession(KEY);
    expect(deleteRow).toHaveBeenCalledWith("line_sessions", KEY);
  });
});

describe("readCtx / writeCtx", () => {
  it("readCtx returns {} when there is no ctx row", async () => {
    expect(await readCtx(KEY)).toEqual({});
  });

  it("readCtx never expires and normalizes data", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, step: "ctx", updated_at: minutesAgo(60 * 24 * 7), data: { lastPlanDate: "2026-11-20" } })]);
    expect(await readCtx(KEY)).toEqual({ lastPlanDate: "2026-11-20" });
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, data: [] as unknown as Record<string, unknown> })]);
    expect(await readCtx(KEY)).toEqual({});
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("writeCtx merges into existing data for the same trip", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, step: "ctx", trip_id: "t1", data: { keep: true, lastPlanDate: "2026-11-19" } })]);
    await writeCtx(KEY, "t1", { lastPlanDate: "2026-11-20" }, NOW);
    expect(updateRow).toHaveBeenCalledWith("line_sessions", `${KEY}#ctx`, {
      id: `${KEY}#ctx`, trip_id: "t1", expense_id: "", step: "ctx", updated_at: NOW.toISOString(),
      data: { keep: true, lastPlanDate: "2026-11-20" },
    });
  });

  it("writeCtx starts fresh when the stored ctx belongs to another trip", async () => {
    vi.mocked(listRows).mockResolvedValue([row({ id: `${KEY}#ctx`, trip_id: "old", data: { lastPlanDate: "2025-01-01" } })]);
    await writeCtx(KEY, "t1", { lastPlanDate: "2026-11-20" }, NOW);
    expect(vi.mocked(updateRow).mock.calls[0][2]).toMatchObject({ trip_id: "t1", data: { lastPlanDate: "2026-11-20" } });
  });

  it("writeCtx creates the row when none exists", async () => {
    await writeCtx(KEY, "t1", { lastPlanDate: "2026-11-20" }, NOW);
    expect(vi.mocked(updateRow).mock.calls[0][2]).toMatchObject({ id: `${KEY}#ctx`, data: { lastPlanDate: "2026-11-20" } });
  });
});
