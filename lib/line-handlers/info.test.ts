// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ listRows: vi.fn(), updateRow: vi.fn() }));

import { listRows } from "@/lib/store";
import { handleRoute, handlePostback } from "./info";
import { NO_TRIP_TEXT, GONE_TEXT } from "@/lib/line-view-kit";
import { allText, postbacksOf, mkCtx, mkQuickInfo, mkNote, repliedMessages } from "@/lib/line-view.test-helpers";

const DATA: Record<string, unknown[]> = {
  quickinfo: [
    mkQuickInfo({ id: "q1", label: "wifi", value: "HK-5G pass 1234", sort_order: 1, photo_ids: ["p1", "p2"] }),
    mkQuickInfo({ id: "q2", label: "ฉุกเฉิน", value: "999", pinned: true }),
  ],
  quicknotes: [
    mkNote({ id: "n1", title: "วีซ่า", content: "ไม่ต้องใช้" }),
    mkNote({ id: "n2", title: "ยาวมาก", content: "x".repeat(6000) }),
  ],
};

beforeEach(() => {
  vi.mocked(listRows).mockReset();
  vi.mocked(listRows).mockImplementation((async (entity: string) => DATA[entity] ?? []) as never);
});

describe("info handleRoute", () => {
  it("no trip → no-trip text", async () => {
    const ctx = mkCtx({ trip: null });
    await handleRoute(ctx, { kind: "info", rest: "" });
    expect(allText(repliedMessages(ctx))).toBe(NO_TRIP_TEXT);
  });

  it("ignores other routes", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "booking", rest: "" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("ข้อมูล → list from quickinfo, pinned first", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "info", rest: "" });
    expect(listRows).toHaveBeenCalledWith("quickinfo", "t1");
    const t = allText(repliedMessages(ctx));
    expect(t.indexOf("ฉุกเฉิน")).toBeLessThan(t.indexOf("wifi"));
  });

  it("ข้อมูล wifi 5G → single detail + plain text (digits never matter here)", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "info", rest: "wifi  5G" });
    const msgs = repliedMessages(ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({ type: "text", text: "HK-5G pass 1234" });
  });

  it("โน้ต วีซ่า → note detail", async () => {
    const ctx = mkCtx();
    await handleRoute(ctx, { kind: "notes", rest: "วีซ่า" });
    expect(listRows).toHaveBeenCalledWith("quicknotes", "t1");
    expect(postbacksOf(repliedMessages(ctx))).toContainEqual({ a: "qn_list", q: "วีซ่า" });
  });
});

describe("info handlePostback", () => {
  it("qi_list renders the list (no auto-detail)", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "qi_list", q: "wifi" });
    expect(allText(repliedMessages(ctx))).toContain('ℹ️ ข้อมูลด่วน · 1 · กรอง "wifi"');
  });

  it("qi_detail / qi_big / qi_photos", async () => {
    const c1 = mkCtx();
    await handlePostback(c1, { a: "qi_detail", id: "q2" });
    expect(repliedMessages(c1)[1]).toMatchObject({ text: "999" });

    const c2 = mkCtx();
    await handlePostback(c2, { a: "qi_big", id: "q2" });
    expect(JSON.stringify(repliedMessages(c2))).toContain('"giga"');

    const c3 = mkCtx();
    await handlePostback(c3, { a: "qi_photos", id: "q1" });
    expect(JSON.stringify(repliedMessages(c3))).toContain("/api/img/p2");
  });

  it("unknown id → gone text", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "qn_detail", id: "nope" });
    expect(allText(repliedMessages(ctx))).toBe(GONE_TEXT);
  });

  it("qn_full splits a long note into text messages (≤ 5)", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "qn_full", id: "n2" });
    const msgs = repliedMessages(ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs.every((m) => m.type === "text")).toBe(true);
  });

  it("qn_list renders the note list", async () => {
    const ctx = mkCtx();
    await handlePostback(ctx, { a: "qn_list" });
    expect(allText(repliedMessages(ctx))).toContain("📒 โน้ต · 2");
  });

  it("no trip → no-trip text", async () => {
    const ctx = mkCtx({ trip: null });
    await handlePostback(ctx, { a: "qi_list" });
    expect(allText(repliedMessages(ctx))).toBe(NO_TRIP_TEXT);
  });
});
