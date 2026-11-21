// lib/line-handlers/expense.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Expense, LineSession, Member, Trip } from "@/lib/models/types";
import type { HandlerCtx } from "@/lib/line-handlers/types";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  sessions: new Map<string, Record<string, unknown>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({
  listRows: vi.fn(async (entity: string, tripId?: string) =>
    (db.rows[entity] ?? []).filter((r) => !tripId || r.trip_id === tripId)),
  updateRow: vi.fn(async (entity: string, id: string, obj: Record<string, unknown>) => {
    const list = (db.rows[entity] ??= []);
    const i = list.findIndex((r) => r.id === id);
    if (i >= 0) list[i] = obj;
    else list.push(obj);
  }),
  deleteRow: vi.fn(async (entity: string, id: string) => {
    db.rows[entity] = (db.rows[entity] ?? []).filter((r) => r.id !== id);
  }),
  saveImage: vi.fn(async () => "photo-new"),
}));
vi.mock("@/lib/line-session", () => ({
  readFlowSession: vi.fn(async (key: string) => db.sessions.get(key) ?? null),
  writeFlowSession: vi.fn(async (s: Record<string, unknown>, now: Date) => {
    db.sessions.set(s.id as string, { ...s, updated_at: now.toISOString() });
  }),
  deleteFlowSession: vi.fn(async (key: string) => {
    db.sessions.delete(key);
  }),
}));
vi.mock("@/lib/fx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fx")>()),
  fetchRate: vi.fn(),
}));
vi.mock("@/lib/line", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/line")>()),
  fetchLineDisplayName: vi.fn(),
  fetchLineImageContent: vi.fn(async () => ({ buf: Buffer.from("x"), mime: "image/jpeg" })),
}));

import { flowAnswerPredicate, handleImage, handlePostback, handleRoute } from "./expense";
import { EXPENSE_COMMAND_KEYWORDS } from "@/lib/line-router";
import { expenseCommand } from "@/lib/line-expense-parse";
import { fetchRate } from "@/lib/fx";
import { fetchLineDisplayName } from "@/lib/line";

const TRIP: Trip = {
  id: "t1", name: "HK", destination: "Hong Kong", start_date: "2026-11-20", end_date: "2026-11-25",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const KEY = "group:g1:user:u1";
const NOW = new Date("2026-11-21T03:00:00.000Z");
const member = (id: string, name: string): Member => ({ id, trip_id: "t1", name, color: "", promptpay_id: "" });

function makeCtx(event: Partial<HandlerCtx["event"]>) {
  const reply = vi.fn(async (_messages: unknown[]) => {});
  const ctx: HandlerCtx = {
    event: { type: "message", replyToken: "rt", source: { type: "group", groupId: "g1", userId: "u1" }, ...event } as HandlerCtx["event"],
    replyToken: "rt", accessToken: "tok", origin: "https://app.test", now: NOW,
    userKey: KEY, isGroup: true, trip: TRIP, reply,
  };
  return { ctx, reply };
}
const textCtx = (text: string) => makeCtx({ message: { id: "m1", type: "text", text } });
const pbCtx = () => makeCtx({ type: "postback", postback: { data: "" } });
const out = (reply: ReturnType<typeof makeCtx>["reply"]) => JSON.stringify(reply.mock.calls.at(-1)?.[0]);
const expenses = () => (db.rows.expenses ?? []) as unknown as Expense[];
const session = () => db.sessions.get(KEY) as unknown as LineSession | undefined;

async function say(text: string) {
  const { ctx, reply } = textCtx(text);
  await handleRoute(ctx, { kind: "expense_new", text });
  return reply;
}
async function answer(text: string) {
  const { ctx, reply } = textCtx(text);
  await handleRoute(ctx, { kind: "flow_answer" });
  return reply;
}
async function tap(data: Record<string, string>) {
  const { ctx, reply } = pbCtx();
  await handlePostback(ctx, data);
  return reply;
}

beforeEach(() => {
  db.rows = { members: [member("m1", "เก่ง"), member("m2", "โอ")] as unknown as Record<string, unknown>[], expenses: [] };
  db.sessions.clear();
  vi.mocked(fetchRate).mockReset().mockImplementation(async (c: string) => (c === "THB" ? 1 : 4.5));
  vi.mocked(fetchLineDisplayName).mockReset().mockResolvedValue("เก่ง");
});

describe("expense handler: text capture", () => {
  it("saves a complete entry as a pending draft and shows the summary card", async () => {
    const reply = await say("120 บาท ข้าวมันไก่ ไม่หาร");
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0]).toMatchObject({
      amount: 120, currency: "THB", fx_rate: 1, amount_thb: 120, payer: "เก่ง",
      category: "อาหาร", description: "ข้าวมันไก่", splits: [], pending: true, slip_photo_ids: [],
    });
    expect(session()?.step).toBe("summary");
    expect(out(reply)).toContain("สรุปรายการ");
    expect(out(reply)).toContain("a=x_confirm");
  });

  it("✅ confirms: pending off, session gone, saved card", async () => {
    await say("120 บาท ข้าวมันไก่ ไม่หาร");
    const id = expenses()[0].id;
    const reply = await tap({ a: "x_confirm", e: id, s: "summary" });
    expect(expenses()[0].pending).toBe(false);
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("บันทึกแล้ว");
    expect(out(reply)).toContain("https://app.test/trips/t1/money");
  });

  it("converts with the fetched rate and splits equally, rounding the other share up", async () => {
    await say("120 HKD ข้าว หาร");
    expect(fetchRate).toHaveBeenCalledWith("HKD");
    expect(expenses()[0]).toMatchObject({
      fx_rate: 4.5, amount_thb: 540,
      splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }],
    });
  });

  it("falls back to rate 1 and warns when the FX fetch fails", async () => {
    vi.mocked(fetchRate).mockRejectedValue(new Error("down"));
    const reply = await say("120 HKD ข้าว หาร");
    expect(expenses()[0]).toMatchObject({ fx_rate: 1, amount_thb: 120 });
    expect((session()?.data as Record<string, unknown>).fxFailed).toBe(true);
    expect(out(reply)).toContain("ดึงเรตไม่ได้");
  });

  it("asks who paid when the LINE name matches no member, then accepts a typed name", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const first = await say("120 บาท ข้าว ไม่หาร");
    expect(session()?.step).toBe("payer");
    expect(out(first)).toContain("@Kengz ใครจ่าย?");
    await answer("โอ");
    expect(expenses()[0].payer).toBe("โอ");
    expect(session()?.step).toBe("summary");
  });

  it("typed ยกเลิก asks first; ลบทิ้ง deletes the draft", async () => {
    await say("120 ข้าว");
    await answer("ยกเลิก");
    expect(session()?.step).toBe("confirm_cancel");
    const reply = await answer("ลบทิ้ง");
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("ลบรายการแล้ว");
  });

  it("a new number mid-flow prompts; park keeps the old draft pending and starts the new one", async () => {
    await say("120 ข้าว");
    const oldId = expenses()[0].id;
    const { ctx, reply } = textCtx("50 กาแฟ");
    await handleRoute(ctx, { kind: "flow_conflict", text: "50 กาแฟ" });
    expect(session()?.step).toBe("conflict");
    expect(out(reply)).toContain("มีรายการค้างอยู่");
    await tap({ a: "x_conflict_park", e: oldId, s: "conflict" });
    expect(expenses()).toHaveLength(2);
    expect(expenses().find((e) => e.id === oldId)).toMatchObject({ pending: true, amount: 120 });
    expect(session()?.expense_id).not.toBe(oldId);
    expect(expenses().find((e) => e.id === session()?.expense_id)?.amount).toBe(50);
  });

  it("ทำต่อ with no session reopens my newest pending draft", async () => {
    db.rows.expenses = [{
      id: "old", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อื่นๆ", description: "", amount: 0,
      currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "เก่ง", slip_photo_ids: ["p0"], splits: [], pending: true,
    }];
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: "old", step: "amount" });
    expect(out(reply)).toContain("ยอดเท่าไหร่");
  });

  it("120 → HKD → ยกเลิก → เก็บไว้ → ทำต่อ resumes at the split question, not currency", async () => {
    await say("120");
    const id = expenses()[0].id;
    await tap({ a: "x_currency", e: id, s: "currency", v: "HKD" });
    expect(session()?.step).toBe("split");
    await answer("ยกเลิก");
    await answer("เก็บไว้");
    expect(session()).toBeUndefined();
    expect(expenses()[0]).toMatchObject({ pending: true, currency: "HKD", fx_rate: 4.5, amount_thb: 540 });
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: id, step: "split" });
    expect(out(reply)).toContain("หารไหม");
  });

  it("ทำต่อ falls back to an unclaimed draft (empty payer)", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    db.rows.expenses = [{
      id: "anon", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อื่นๆ", description: "", amount: 0,
      currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: ["p0"], splits: [], pending: true,
    }];
    await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: "anon", step: "payer" });
  });

  it("a number typed while the payer is being asked fills the missing amount and asks the payer again", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const { ctx } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    expect(session()?.step).toBe("payer");
    const pred = await flowAnswerPredicate(ctx, session() as LineSession);
    expect(pred("120")).toBe(true);
    const reply = await answer("120");
    expect(expenses()[0].amount).toBe(120);
    expect(session()?.step).toBe("payer");
    expect(out(reply)).toContain("ใครจ่าย");
  });

  it("bare ยกเลิก / ทำต่อ with nothing pending just say so, without creating a draft", async () => {
    expect(out(await say("ยกเลิก"))).toContain("ไม่มีรายการค้าง");
    expect(out(await say("ทำต่อ"))).toContain("ไม่มีรายการค้าง");
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
  });

  it("แก้ล่าสุด opens the summary of my newest confirmed expense", async () => {
    db.rows.expenses = [{
      id: "done1", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อาหาร", description: "ข้าว", amount: 120,
      currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [],
      splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }], pending: false,
    }];
    const reply = await say("แก้ล่าสุด");
    expect(session()).toMatchObject({ expense_id: "done1", step: "summary" });
    expect(out(reply)).toContain("สรุปรายการ");
    expect(fetchRate).not.toHaveBeenCalled();
  });

  it("🗑 on a confirmed expense asks first; ไม่ลบ leaves the row untouched", async () => {
    const paidSplit = { name: "โอ", amount_thb: 270, paid: true, paid_slip_photo_ids: ["s1"] };
    const row = {
      id: "done1", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อาหาร", description: "ข้าว", amount: 120,
      currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [], splits: [paidSplit], pending: false,
    };
    db.rows.expenses = [{ ...row }];
    await say("แก้ล่าสุด");
    const ask = await tap({ a: "x_cancel", e: "done1", s: "summary" });
    expect(expenses()).toHaveLength(1);
    expect(session()?.step).toBe("confirm_cancel");
    expect(out(ask)).toContain("ไม่ลบ");
    const kept = await tap({ a: "x_cancel_keep", e: "done1", s: "confirm_cancel" });
    expect(session()).toBeUndefined();
    expect(expenses()[0]).toEqual(row);
    expect(out(kept)).toContain("รายการยังอยู่เหมือนเดิม");
  });

  it("🗑 then ลบรายการนี้ deletes a confirmed expense", async () => {
    db.rows.expenses = [{
      id: "done1", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อาหาร", description: "ข้าว", amount: 120,
      currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [], splits: [], pending: false,
    }];
    await say("แก้ล่าสุด");
    await tap({ a: "x_cancel", e: "done1", s: "summary" });
    await tap({ a: "x_cancel_delete", e: "done1", s: "confirm_cancel" });
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
  });

  it("recognises every bare command the router sends as expense_new", () => {
    for (const kw of EXPENSE_COMMAND_KEYWORDS) expect(expenseCommand(kw)).not.toBeNull();
  });
});

describe("expense handler: postbacks", () => {
  it("re-asks the current step when a stale button is tapped", async () => {
    await say("120 ข้าว");
    const id = expenses()[0].id;
    expect(session()?.step).toBe("currency");
    const reply = await tap({ a: "x_split", e: id, s: "split", v: "none" });
    expect(session()?.step).toBe("currency");
    expect(out(reply)).toContain("สกุลเงินอะไร");
  });

  it("says the expense is gone for a button about a deleted expense", async () => {
    const reply = await tap({ a: "x_confirm", e: "ghost", s: "summary" });
    expect(out(reply)).toContain("รายการนี้ถูกลบไปแล้ว");
  });

  it("walks currency → split by buttons", async () => {
    await say("120 ข้าว");
    const id = expenses()[0].id;
    await tap({ a: "x_currency", e: id, s: "currency", v: "HKD" });
    expect(session()?.step).toBe("split");
    await tap({ a: "x_split", e: id, s: "split", v: "equal" });
    expect(session()?.step).toBe("summary");
    expect(expenses()[0]).toMatchObject({ currency: "HKD", amount_thb: 540 });
  });
});

describe("expense handler: images", () => {
  it("a photo with no session starts a draft that asks for the amount", async () => {
    const { ctx, reply } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    expect(expenses()[0]).toMatchObject({ slip_photo_ids: ["photo-new"], payer: "เก่ง", pending: true });
    expect(session()?.step).toBe("amount");
    expect(out(reply)).toContain("ยอดเท่าไหร่");
  });

  it("a photo mid-flow attaches to a draft that has none", async () => {
    await say("120 ข้าว");
    const { ctx, reply } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0].slip_photo_ids).toEqual(["photo-new"]);
    expect(out(reply)).toContain("แนบรูป");
  });
});

describe("flowAnswerPredicate", () => {
  it("accepts answers for the current step and the flow commands only", async () => {
    const { ctx } = textCtx("");
    const pred = await flowAnswerPredicate(ctx, { id: KEY, trip_id: "t1", expense_id: "e1", step: "payer", updated_at: "", data: {} });
    expect(pred("โอ")).toBe(true);
    expect(pred("ยกเลิก")).toBe(true);
    expect(pred("สวัสดี")).toBe(false);
  });
});
