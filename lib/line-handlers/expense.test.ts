// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/store", () => ({
  listRows: vi.fn(),
  updateRow: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue("photo-1"),
}));
vi.mock("@/lib/line-session", () => ({
  readFlowSession: vi.fn(),
  writeFlowSession: vi.fn().mockResolvedValue(undefined),
  deleteFlowSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/line", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/line")>()),
  fetchLineImageContent: vi.fn().mockResolvedValue({ buf: Buffer.from("img"), mime: "image/jpeg" }),
}));

import { listRows, updateRow, saveImage } from "@/lib/store";
import { readFlowSession, writeFlowSession, deleteFlowSession } from "@/lib/line-session";
import { fetchLineImageContent } from "@/lib/line";
import { handleImage, handleRoute, handlePostback, flowAnswerPredicate } from "./expense";
import type { HandlerCtx } from "./types";
import type { Trip, Member, Expense, LineSession } from "@/lib/models/types";
import { textMessage, type FlexNode } from "@/lib/line-flex";
import { WIP_TEXT, NO_TRIP_TEXT } from "@/lib/line-menu";

const TRIP: Trip = {
  id: "t1", name: "ฮ่องกง", destination: "Hong Kong", start_date: "2026-11-19", end_date: "2026-11-24",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const MEMBERS: Member[] = [
  { id: "m1", trip_id: "t1", name: "เก่ง", color: "", promptpay_id: "" },
  { id: "m2", trip_id: "t1", name: "โอ", color: "", promptpay_id: "" },
];
const NOW = new Date("2026-11-20T03:00:00.000Z");
const KEY = "group:g1:user:u1";

function pendingExpense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1", trip_id: "t1", datetime: NOW.toISOString(), category: "อื่นๆ", description: "", amount: 0,
    currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: ["photo-1"], splits: [], pending: true, ...over,
  };
}

function session(step: string): LineSession {
  return { id: KEY, trip_id: "t1", expense_id: "e1", step, updated_at: NOW.toISOString(), data: {} };
}

function makeCtx(over: Partial<HandlerCtx> = {}, text = "เก่ง"): HandlerCtx {
  return {
    event: { type: "message", replyToken: "rt", source: { type: "group", groupId: "g1", userId: "u1" }, message: { id: "m1", type: "text", text } },
    replyToken: "rt",
    accessToken: "tok",
    origin: "https://app.test",
    now: NOW,
    userKey: KEY,
    isGroup: true,
    trip: TRIP,
    reply: vi.fn(async () => {}),
    ...over,
  };
}

const firstReply = (ctx: HandlerCtx) => vi.mocked(ctx.reply).mock.calls[0][0] as FlexNode[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listRows).mockImplementation(async (entity: string) => {
    if (entity === "members") return MEMBERS as never;
    if (entity === "expenses") return [pendingExpense()] as never;
    return [] as never;
  });
});

describe("handleImage", () => {
  it("saves the slip as a pending expense, starts a flow session, asks who", async () => {
    const ctx = makeCtx({ event: { type: "message", replyToken: "rt", source: { type: "group", groupId: "g1", userId: "u1" }, message: { id: "img-9", type: "image" } } });
    await handleImage(ctx);

    expect(fetchLineImageContent).toHaveBeenCalledWith("img-9", "tok");
    expect(saveImage).toHaveBeenCalledWith(expect.any(Buffer), "image/jpeg", "ฮ่องกง", "slips", `line-${NOW.getTime()}.jpg`);
    expect(updateRow).toHaveBeenCalledWith(
      "expenses",
      expect.any(String),
      expect.objectContaining({ trip_id: "t1", pending: true, slip_photo_ids: ["photo-1"], currency: "HKD", datetime: NOW.toISOString() }),
    );
    const expenseId = vi.mocked(updateRow).mock.calls[0][1];
    expect(writeFlowSession).toHaveBeenCalledWith({ id: KEY, trip_id: "t1", expense_id: expenseId, step: "awaiting_name", data: {} }, NOW);

    const [msg] = firstReply(ctx);
    expect(msg).toMatchObject({ type: "text", text: "รับสลิปแล้ว 📸 ใครเป็นคนบันทึกรายการนี้?" });
    expect(JSON.stringify(msg.quickReply)).toContain("เก่ง");
    expect(JSON.stringify(msg.quickReply)).toContain("โอ");
  });

  it("replies the no-trip message when there is no active trip", async () => {
    const ctx = makeCtx({ trip: null });
    await handleImage(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(NO_TRIP_TEXT)]);
    expect(saveImage).not.toHaveBeenCalled();
  });
});

describe("flowAnswerPredicate", () => {
  it("accepts ordinary text while waiting for the name or note", async () => {
    const ctx = makeCtx();
    expect((await flowAnswerPredicate(ctx, session("awaiting_name")))("เก่ง")).toBe(true);
    expect((await flowAnswerPredicate(ctx, session("awaiting_note")))("อะไรก็ได้ 120")).toBe(true);
    expect((await flowAnswerPredicate(ctx, session("awaiting_note")))("ข้าม")).toBe(true);
  });

  it("lets view commands through instead of taking them as the answer", async () => {
    const ctx = makeCtx();
    const isAnswer = await flowAnswerPredicate(ctx, session("awaiting_name"));
    for (const cmd of ["แพลน", "plan", "ต่อไป", "#2", "เมนู", "?", "ข้อมูล", "ข้อมูลด่วน", "โน้ต"]) {
      expect(isAnswer(cmd)).toBe(false);
    }
  });

  it("still takes collision words as the note", async () => {
    const isAnswer = await flowAnswerPredicate(makeCtx(), session("awaiting_note"));
    for (const note of ["ร้านนี้อร่อย", "กินข้าว", "จองโต๊ะไว้", "ตั๋วรถ", "เดินทางไปสนามบิน"]) {
      expect(isAnswer(note)).toBe(true);
    }
  });

  it("accepts nothing for other steps", async () => {
    expect((await flowAnswerPredicate(makeCtx(), session("amount")))("120")).toBe(false);
  });
});

describe("handleRoute flow_answer", () => {
  it("awaiting_name: sets the payer, moves to awaiting_note, offers skip", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(session("awaiting_name"));
    const ctx = makeCtx({}, " เก่ง ");
    await handleRoute(ctx, { kind: "flow_answer" });

    expect(readFlowSession).toHaveBeenCalledWith(KEY, NOW);
    expect(updateRow).toHaveBeenCalledWith("expenses", "e1", expect.objectContaining({ payer: "เก่ง" }));
    expect(writeFlowSession).toHaveBeenCalledWith({ id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_note", data: {} }, NOW);
    const [msg] = firstReply(ctx);
    expect(msg.text).toBe('บันทึกคนบันทึกเป็น "เก่ง" แล้ว มีโน้ตอยากใส่ไหม? (พิมพ์ได้เลย หรือกดข้าม)');
    expect(JSON.stringify(msg.quickReply)).toContain("ข้าม");
  });

  it("awaiting_note: saves the note, ends the session, replies the confirmation card", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(session("awaiting_note"));
    vi.mocked(listRows).mockImplementation(async (entity: string) => (entity === "expenses" ? [pendingExpense({ payer: "เก่ง" })] : []) as never);
    const ctx = makeCtx({}, "ค่าแท็กซี่");
    await handleRoute(ctx, { kind: "flow_answer" });

    expect(updateRow).toHaveBeenCalledWith("expenses", "e1", expect.objectContaining({ description: "ค่าแท็กซี่" }));
    expect(deleteFlowSession).toHaveBeenCalledWith(KEY);
    const [msg] = firstReply(ctx);
    const json = JSON.stringify(msg);
    expect(msg.type).toBe("flex");
    expect(json).toContain("https://app.test/api/img/photo-1");
    expect(json).toContain("เก่ง");
    expect(json).toContain("ค่าแท็กซี่");
    expect(json).toContain("https://app.test/trips/t1/money");
  });

  it("awaiting_note: 'ข้าม' saves an empty note", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(session("awaiting_note"));
    const ctx = makeCtx({}, "ข้าม");
    await handleRoute(ctx, { kind: "flow_answer" });
    expect(updateRow).toHaveBeenCalledWith("expenses", "e1", expect.objectContaining({ description: "" }));
  });

  it("drops the session silently if its expense is gone", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(session("awaiting_name"));
    vi.mocked(listRows).mockResolvedValue([] as never);
    const ctx = makeCtx();
    await handleRoute(ctx, { kind: "flow_answer" });
    expect(deleteFlowSession).toHaveBeenCalledWith(KEY);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("does nothing if the session expired in between", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(null);
    const ctx = makeCtx();
    await handleRoute(ctx, { kind: "flow_answer" });
    expect(updateRow).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe("not-yet-built expense routes", () => {
  it("stay silent in a group", async () => {
    const ctx = makeCtx({ isGroup: true });
    await handleRoute(ctx, { kind: "expense_new", text: "120 ข้าว" });
    await handleRoute(ctx, { kind: "flow_conflict", text: "50" });
    await handleRoute(ctx, { kind: "flow_reask" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("say 'in development' in 1:1", async () => {
    const ctx = makeCtx({ isGroup: false });
    await handleRoute(ctx, { kind: "expense_new", text: "120 ข้าว" });
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(WIP_TEXT)]);
  });

  it("postbacks say 'in development' in 1:1 and nothing in a group", async () => {
    const solo = makeCtx({ isGroup: false });
    await handlePostback(solo, { a: "x_payer" });
    expect(solo.reply).toHaveBeenCalledWith([textMessage(WIP_TEXT)]);
    const group = makeCtx({ isGroup: true });
    await handlePostback(group, { a: "x_payer" });
    expect(group.reply).not.toHaveBeenCalled();
  });
});
