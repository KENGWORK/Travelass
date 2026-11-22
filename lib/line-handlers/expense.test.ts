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
import { updateRow } from "@/lib/store";

const TRIP: Trip = {
  id: "t1", name: "HK", destination: "Hong Kong", start_date: "2026-11-20", end_date: "2026-11-25",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const KEY = "group:g1:user:u1";
const NOW = new Date("2026-11-21T03:00:00.000Z");
const member = (id: string, name: string): Member => ({ id, trip_id: "t1", name, color: "", promptpay_id: "" });
const DONE = (over: Record<string, unknown> = {}) => ({
  id: "done1", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อาหาร", description: "ข้าว", amount: 120,
  currency: "HKD", fx_rate: 4.5, amount_thb: 540, payer: "เก่ง", slip_photo_ids: [],
  splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }], pending: false, ...over,
});

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
const rev = () => String((session()?.data as { rev?: number } | undefined)?.rev ?? 0);
const live = () => ({ e: expenses()[0].id, v: rev() });

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

describe("capture: one card, auto-save", () => {
  it("a complete one-line entry saves at once: pending off, no session, saved card with edit/delete and the trip", async () => {
    const reply = await say("120 บาท ข้าวมันไก่ ไม่หาร");
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0]).toMatchObject({
      amount: 120, currency: "THB", fx_rate: 1, amount_thb: 120, payer: "เก่ง",
      category: "อาหาร", description: "ข้าวมันไก่", splits: [], pending: false,
    });
    expect(session()).toBeUndefined();
    const o = out(reply);
    expect(o).toContain("✅ บันทึกแล้ว");
    expect(o).toContain("a=x_edit");
    expect(o).toContain("a=x_del");
    expect(o).toContain("ทริป HK");
    expect(o).not.toContain("x_confirm");
  });

  it("an incomplete entry is saved as a pending draft and asks everything missing in ONE card", async () => {
    const reply = await say("120 ข้าว");
    expect(expenses()[0]).toMatchObject({ amount: 120, payer: "เก่ง", pending: true });
    expect(session()).toMatchObject({ step: "missing", expense_id: expenses()[0].id });
    expect((session()?.data as { rev: number }).rev).toBe(1);
    const o = out(reply);
    expect(o).toContain("เหลืออีก 2 อย่าง");
    expect(o).toContain("f=currency");
    expect(o).toContain("f=split");
    expect(o).not.toContain("ใครจ่าย?");
    expect(reply.mock.calls.at(-1)?.[0]).toHaveLength(1);
  });

  it("buttons answer one field each and the last one saves", async () => {
    await say("120 ข้าว");
    await tap({ a: "x_set", f: "currency", w: "HKD", ...live() });
    expect(expenses()[0]).toMatchObject({ currency: "HKD", fx_rate: 4.5, amount_thb: 540, pending: true });
    expect(rev()).toBe("2");
    const reply = await tap({ a: "x_set", f: "split", w: "equal", ...live() });
    expect(expenses()[0]).toMatchObject({ pending: false, splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }] });
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("✅ บันทึกแล้ว");
    expect(out(reply)).toContain("https://app.test/trips/t1/money");
  });

  it("typing several fields at once saves", async () => {
    await say("120 ข้าว");
    const reply = await answer("HKD หารเท่า");
    expect(expenses()[0]).toMatchObject({ currency: "HKD", amount_thb: 540, pending: false });
    expect(expenses()[0].splits).toHaveLength(1);
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("บันทึกแล้ว");
  });

  it("a partial typed answer re-sends the card with fewer rows left", async () => {
    await say("120 ข้าว");
    const reply = await answer("HKD");
    expect(session()?.step).toBe("missing");
    expect(out(reply)).toContain("เหลืออีก 1 อย่าง");
    expect(expenses()[0].pending).toBe(true);
  });

  it("text that fills no field re-sends the same card with the not-understood notice", async () => {
    await say("120 ข้าว");
    const before = rev();
    const { ctx, reply } = textCtx("สวัสดี");
    await handleRoute(ctx, { kind: "flow_reask" });
    expect(out(reply)).toContain("ไม่เข้าใจ ลองกดปุ่ม หรือพิมพ์ เช่น HKD เก่ง หารเท่า");
    expect(rev()).toBe(before);
  });

  it("converts with the fetched rate and splits equally, rounding the other share up", async () => {
    await say("120 HKD ข้าว หาร");
    expect(fetchRate).toHaveBeenCalledWith("HKD");
    expect(expenses()[0]).toMatchObject({
      fx_rate: 4.5, amount_thb: 540, pending: false,
      splits: [{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }],
    });
  });

  it("falls back to rate 1 and warns on the saved card when the FX fetch fails", async () => {
    vi.mocked(fetchRate).mockRejectedValue(new Error("down"));
    const reply = await say("120 HKD ข้าว หาร");
    expect(expenses()[0]).toMatchObject({ fx_rate: 1, amount_thb: 120, pending: false });
    expect(out(reply)).toContain("ดึงเรตไม่ได้");
  });

  it("asks who paid when the LINE name matches no member, then accepts a typed name and saves", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const first = await say("120 บาท ข้าว ไม่หาร");
    expect(session()?.step).toBe("missing");
    expect(out(first)).toContain("f=payer");
    expect(out(first)).toContain("@Kengz");
    await answer("โอ");
    expect(expenses()[0]).toMatchObject({ payer: "โอ", pending: false });
    expect(session()).toBeUndefined();
  });

  it("tapping an answered row clears it and asks it again", async () => {
    await say("120 HKD ข้าว");
    const reply = await tap({ a: "x_clear", f: "currency", ...live() });
    expect((session()?.data as Record<string, unknown>).currencyConfirmed).toBeUndefined();
    expect(expenses()[0].amount_thb).toBe(0);
    expect(out(reply)).toContain("f=currency");
  });

  it("owed typed together with the total: 500 บาท เซเว่น ฝาก 20", async () => {
    await say("500 บาท เซเว่น ฝาก 20");
    expect(expenses()[0]).toMatchObject({ amount: 500, pending: false, splits: [{ name: "โอ", amount_thb: 20 }] });
  });
});

describe("saving uses the answer just given", () => {
  it("(a) the last button tap saves with the split built and shown", async () => {
    await say("120 ข้าว");
    await tap({ a: "x_set", f: "currency", w: "HKD", ...live() });
    const reply = await tap({ a: "x_set", f: "split", w: "equal", ...live() });
    expect(expenses()[0].splits).toEqual([{ name: "โอ", amount_thb: 270, paid: false, paid_slip_photo_ids: [] }]);
    expect(out(reply)).toContain("หารเท่า: โอคืน 270฿");
    expect(out(reply)).not.toContain("⚖️ ไม่หาร");
  });

  it("(d) typing HKD หารเท่า saves with the rate fetched and the split", async () => {
    await say("120 ข้าว");
    const reply = await answer("HKD หารเท่า");
    expect(fetchRate).toHaveBeenCalledWith("HKD");
    expect(expenses()[0]).toMatchObject({ fx_rate: 4.5, amount_thb: 540, pending: false });
    expect(expenses()[0].splits).toHaveLength(1);
    expect(out(reply)).toContain("120 HKD (~540฿)");
    expect(out(reply)).toContain("หารเท่า: โอคืน 270฿");
  });

  it("(f) หารไม่เท่า then a typed owed amount saves the owed split", async () => {
    await say("500 HKD ข้าว");
    await tap({ a: "x_set", f: "split", w: "unequal", ...live() });
    expect(session()?.step).toBe("missing");
    const reply = await answer("20");
    expect(expenses()[0]).toMatchObject({ pending: false, splits: [{ name: "โอ", amount_thb: 90 }] });
    expect(out(reply)).toContain("หารไม่เท่า");
    expect(out(reply)).toContain("โอคืน 90฿");
  });

  it("editing a saved split to หารไม่เท่า then typing 20 shows the new split on the card", async () => {
    db.rows.expenses = [DONE()];
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_editfield", w: "split", e: "done1", v: rev() });
    await tap({ a: "x_set", f: "split", w: "unequal", e: "done1", v: rev() });
    const reply = await answer("20");
    expect(expenses()[0].splits).toEqual([{ name: "โอ", amount_thb: 90, paid: false, paid_slip_photo_ids: [] }]);
    expect(out(reply)).toContain("หารไม่เท่า");
    expect(out(reply)).toContain("โอคืน 90฿");
  });
});

describe("@name in the first message", () => {
  it("names the payer over the LINE name, is not part of the note, and saves at once", async () => {
    const reply = await say("120 HKD ข้าว @เก่ง หาร");
    expect(expenses()[0]).toMatchObject({ payer: "เก่ง", description: "ข้าว", pending: false });
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("บันทึกแล้ว");
  });

  it("when the LINE name matches nobody, @name means no payer question", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const reply = await say("120 HKD ข้าว @โอ หาร");
    expect(expenses()[0]).toMatchObject({ payer: "โอ", pending: false, splits: [{ name: "เก่ง" }] });
    expect(session()).toBeUndefined();
    expect(out(reply)).not.toContain("f=payer");
  });
});

describe("stale buttons", () => {
  it("a wrong revision does nothing and re-sends the current card with the expired notice", async () => {
    await say("120 ข้าว");
    const before = rev();
    const reply = await tap({ a: "x_set", f: "currency", w: "HKD", e: expenses()[0].id, v: "0" });
    expect(session()?.step).toBe("missing");
    expect(rev()).toBe(before);
    expect(expenses()[0]).toMatchObject({ currency: "HKD", amount_thb: 0 });
    expect((session()?.data as Record<string, unknown>).currencyConfirmed).toBeUndefined();
    expect(out(reply)).toContain("ปุ่มนี้หมดอายุแล้ว");
    expect(out(reply)).toContain("f=currency");
  });

  it("a button of another expense does nothing", async () => {
    await say("120 ข้าว");
    const reply = await tap({ a: "x_set", f: "currency", w: "HKD", e: "other", v: rev() });
    expect(out(reply)).toContain("ปุ่มนี้หมดอายุแล้ว");
    expect((session()?.data as Record<string, unknown>).currencyConfirmed).toBeUndefined();
  });

  it("says the expense is gone for a button about a deleted expense", async () => {
    await say("120 ข้าว");
    db.rows.expenses = [];
    const reply = await tap({ a: "x_set", f: "currency", w: "HKD", e: "ghost", v: "1" });
    expect(out(reply)).toContain("รายการนี้ถูกลบไปแล้ว");
    expect(session()).toBeUndefined();
  });

  it("with no session: an unknown expense is gone, an existing draft just says the button expired", async () => {
    expect(out(await tap({ a: "x_set", f: "currency", w: "HKD", e: "ghost", v: "1" }))).toContain("รายการนี้ถูกลบไปแล้ว");
    db.rows.expenses = [DONE({ id: "d3", pending: true })];
    expect(out(await tap({ a: "x_set", f: "currency", w: "HKD", e: "d3", v: "1" }))).toContain("ปุ่มนี้หมดอายุแล้ว");
  });

  it("a late tap on the card of an already SAVED expense just says expired, without ทำต่อ", async () => {
    await say("120 บาท ข้าว ไม่หาร");
    const id = expenses()[0].id;
    expect(session()).toBeUndefined();
    const reply = await tap({ a: "x_set", f: "currency", w: "HKD", e: id, v: "1" });
    expect(out(reply)).toContain("ปุ่มนี้หมดอายุแล้ว");
    expect(out(reply)).not.toContain("ทำต่อ");
    expect(expenses()[0].currency).toBe("THB");
  });

  it("buttons of the removed flow are answered as expired", async () => {
    expect(out(await tap({ a: "x_confirm", e: "x", s: "summary" }))).toContain("ปุ่มนี้หมดอายุแล้ว");
    expect(out(await tap({ a: "x_payer", e: "x", s: "payer", v: "โอ" }))).toContain("ปุ่มนี้หมดอายุแล้ว");
  });

  it("a button tapped after the card was replaced by the cancel prompt is stale", async () => {
    await say("120 ข้าว");
    const old = live();
    await answer("ยกเลิก");
    expect(session()?.step).toBe("confirm_cancel");
    await tap({ a: "x_set", f: "currency", w: "HKD", ...old });
    expect(session()?.step).toBe("confirm_cancel");
    expect(expenses()).toHaveLength(1);
  });
});

describe("cancel, resume, conflict", () => {
  it("typed ยกเลิก asks first; ลบทิ้ง deletes the draft", async () => {
    await say("120 ข้าว");
    await answer("ยกเลิก");
    expect(session()?.step).toBe("confirm_cancel");
    const reply = await answer("ลบทิ้ง");
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("ลบรายการแล้ว");
  });

  it("the card's 🗑 ยกเลิก button does the same", async () => {
    await say("120 ข้าว");
    await tap({ a: "x_cancel", ...live() });
    expect(session()?.step).toBe("confirm_cancel");
    await tap({ a: "x_cancel_delete", ...live() });
    expect(expenses()).toHaveLength(0);
  });

  it("a new number mid-flow prompts; park keeps the old draft pending and starts the new one", async () => {
    await say("120 ข้าว");
    const oldId = expenses()[0].id;
    const { ctx, reply } = textCtx("50 กาแฟ");
    await handleRoute(ctx, { kind: "flow_conflict", text: "50 กาแฟ" });
    expect(session()?.step).toBe("conflict");
    expect(out(reply)).toContain("มีรายการค้างอยู่");
    await tap({ a: "x_conflict_park", e: oldId, v: rev() });
    expect(expenses()).toHaveLength(2);
    expect(expenses().find((e) => e.id === oldId)).toMatchObject({ pending: true, amount: 120 });
    expect(session()?.expense_id).not.toBe(oldId);
    expect(expenses().find((e) => e.id === session()?.expense_id)?.amount).toBe(50);
  });

  it("ทิ้งอันเก่า deletes a pending draft", async () => {
    await say("120 ข้าว");
    const oldId = expenses()[0].id;
    const { ctx } = textCtx("50 กาแฟ");
    await handleRoute(ctx, { kind: "flow_conflict", text: "50 กาแฟ" });
    await tap({ a: "x_conflict_drop", e: oldId, v: rev() });
    expect(expenses().find((e) => e.id === oldId)).toBeUndefined();
    expect(expenses()).toHaveLength(1);
  });

  it("ทำต่อ with no session reopens my newest pending draft at the card", async () => {
    db.rows.expenses = [{
      id: "old", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อื่นๆ", description: "", amount: 0,
      currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "เก่ง", slip_photo_ids: ["p0"], splits: [], pending: true,
    }];
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: "old", step: "missing" });
    expect(out(reply)).toContain("พิมพ์ตัวเลข เช่น 120");
  });

  it("120 → HKD → ยกเลิก → เก็บไว้ → ทำต่อ resumes with only the split row open", async () => {
    await say("120");
    await tap({ a: "x_set", f: "currency", w: "HKD", ...live() });
    await answer("ยกเลิก");
    await answer("เก็บไว้");
    expect(session()).toBeUndefined();
    expect(expenses()[0]).toMatchObject({ pending: true, currency: "HKD", fx_rate: 4.5, amount_thb: 540 });
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: expenses()[0].id, step: "missing" });
    expect(out(reply)).toContain("เหลืออีก 1 อย่าง");
    expect(out(reply)).toContain("f=split");
    expect(out(reply)).not.toContain("f=currency&w");
  });

  it("ทำต่อ falls back to an unclaimed draft (empty payer)", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    db.rows.expenses = [{
      id: "anon", trip_id: "t1", datetime: "2026-11-20T03:00:00.000Z", category: "อื่นๆ", description: "", amount: 0,
      currency: "HKD", fx_rate: 1, amount_thb: 0, payer: "", slip_photo_ids: ["p0"], splits: [], pending: true,
    }];
    const reply = await say("ทำต่อ");
    expect(session()).toMatchObject({ expense_id: "anon", step: "missing" });
    expect(out(reply)).toContain("f=payer");
  });

  it("bare ยกเลิก / ทำต่อ with nothing pending just say so, without creating a draft", async () => {
    expect(out(await say("ยกเลิก"))).toContain("ไม่มีรายการค้าง");
    expect(out(await say("ทำต่อ"))).toContain("ไม่มีรายการค้าง");
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
  });

  it("recognises every bare command the router sends as expense_new", () => {
    for (const kw of EXPENSE_COMMAND_KEYWORDS) expect(expenseCommand(kw)).not.toBeNull();
  });
});

describe("saved expense: แก้ล่าสุด, edit, delete", () => {
  it("แก้ล่าสุด opens the saved card of my newest SAVED expense, without a session or a rate fetch", async () => {
    db.rows.expenses = [
      DONE(),
      { ...DONE({ id: "draft1", pending: true, amount: 5, datetime: "2026-11-21T01:00:00.000Z" }) },
    ];
    const reply = await say("แก้ล่าสุด");
    expect(session()).toBeUndefined();
    const o = out(reply);
    expect(o).toContain("✅ บันทึกแล้ว");
    expect(o).toContain("e=done1");
    expect(o).toContain("a=x_edit");
    expect(fetchRate).not.toHaveBeenCalled();
  });

  it("แก้ล่าสุด with nothing saved / unknown member", async () => {
    expect(out(await say("แก้ล่าสุด"))).toContain("ยังไม่มีรายการที่บันทึกในชื่อเรา");
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    expect(out(await say("แก้ล่าสุด"))).toContain("ชื่อ LINE ไม่ตรงกับสมาชิก");
  });

  it("✏️ แก้ → pick a field → answer: saved over the row at once, new saved card", async () => {
    db.rows.expenses = [DONE()];
    const picker = await tap({ a: "x_edit", e: "done1" });
    expect(session()).toMatchObject({ expense_id: "done1", step: "edit" });
    expect(out(picker)).toContain("a=x_editfield");
    await tap({ a: "x_editfield", w: "category", e: "done1", v: rev() });
    expect(session()?.step).toBe("category");
    const reply = await answer("ตั๋ว");
    expect(expenses()[0]).toMatchObject({ id: "done1", category: "ตั๋ว", pending: false, splits: [{ name: "โอ", amount_thb: 270 }] });
    expect(session()).toBeUndefined();
    expect(out(reply)).toContain("✅ บันทึกแล้ว");
    expect(out(reply)).toContain("a=x_edit");
  });

  it("editing the amount recalculates the split and keeps paid / paid_slip_photo_ids", async () => {
    const paid = { name: "โอ", amount_thb: 270, paid: true, paid_slip_photo_ids: ["s1"] };
    db.rows.expenses = [DONE({ splits: [paid] })];
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_editfield", w: "amount", e: "done1", v: rev() });
    await answer("200");
    expect(expenses()[0]).toMatchObject({
      amount: 200, amount_thb: 900, pending: false,
      splits: [{ name: "โอ", amount_thb: 450, paid: true, paid_slip_photo_ids: ["s1"] }],
    });
    expect(fetchRate).not.toHaveBeenCalled();
  });

  it("editing the currency fetches the new rate", async () => {
    db.rows.expenses = [DONE({ splits: [], currency: "THB", fx_rate: 1, amount_thb: 120 })];
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_editfield", w: "currency", e: "done1", v: rev() });
    await tap({ a: "x_set", f: "currency", w: "HKD", e: "done1", v: rev() });
    expect(fetchRate).toHaveBeenCalledWith("HKD");
    expect(expenses()[0]).toMatchObject({ currency: "HKD", fx_rate: 4.5, amount_thb: 540, pending: false });
  });

  it("changing a saved split to หารไม่เท่า asks the owed amount, then saves", async () => {
    db.rows.expenses = [DONE()];
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_editfield", w: "split", e: "done1", v: rev() });
    await tap({ a: "x_set", f: "split", w: "unequal", e: "done1", v: rev() });
    expect(session()?.step).toBe("owed");
    await answer("20");
    expect(expenses()[0].splits).toEqual([{ name: "โอ", amount_thb: 90, paid: false, paid_slip_photo_ids: [] }]);
    expect(session()).toBeUndefined();
  });

  it("🗑 ลบ asks first; ไม่ลบ leaves the row untouched", async () => {
    const paidSplit = { name: "โอ", amount_thb: 270, paid: true, paid_slip_photo_ids: ["s1"] };
    const row = DONE({ splits: [paidSplit] });
    db.rows.expenses = [{ ...row }];
    const ask = await tap({ a: "x_del", e: "done1" });
    expect(expenses()).toHaveLength(1);
    expect(session()?.step).toBe("confirm_cancel");
    expect(out(ask)).toContain("ไม่ลบ");
    const kept = await tap({ a: "x_cancel_keep", e: "done1", v: rev() });
    expect(session()).toBeUndefined();
    expect(expenses()[0]).toEqual(row);
    expect(out(kept)).toContain("รายการยังอยู่เหมือนเดิม");
  });

  it("opening ✏️ แก้ or 🗑 ลบ never rewrites the saved row", async () => {
    const row = DONE({ amount_thb: 541 });
    db.rows.expenses = [{ ...row }];
    vi.mocked(updateRow).mockClear();
    await tap({ a: "x_edit", e: "done1" });
    await tap({ a: "x_del", e: "done1" });
    await tap({ a: "x_cancel_keep", e: "done1", v: rev() });
    expect(updateRow).not.toHaveBeenCalled();
    expect(expenses()[0]).toEqual(row);
    expect(fetchRate).not.toHaveBeenCalled();
  });

  it("🗑 ลบ then ลบรายการนี้ deletes it", async () => {
    db.rows.expenses = [DONE()];
    await tap({ a: "x_del", e: "done1" });
    await tap({ a: "x_cancel_delete", e: "done1", v: rev() });
    expect(expenses()).toHaveLength(0);
    expect(session()).toBeUndefined();
  });

  it("ทิ้งอันเก่า while editing a saved expense never deletes it", async () => {
    db.rows.expenses = [DONE()];
    await tap({ a: "x_edit", e: "done1" });
    const { ctx } = textCtx("50 กาแฟ");
    await handleRoute(ctx, { kind: "flow_conflict", text: "50 กาแฟ" });
    expect(session()?.step).toBe("conflict");
    const reply = await tap({ a: "x_conflict_drop", e: "done1", v: rev() });
    expect(expenses().find((e) => e.id === "done1")).toBeDefined();
    expect(expenses()).toHaveLength(2);
    expect(out(reply)).toContain("รายการเดิมยังอยู่");
  });

  it("a live draft of another expense is not overwritten by ✏️ แก้", async () => {
    await say("120 ข้าว");
    const draftId = expenses()[0].id;
    db.rows.expenses = [...expenses(), DONE()] as unknown as Record<string, unknown>[];
    const reply = await tap({ a: "x_edit", e: "done1" });
    expect(session()?.expense_id).toBe(draftId);
    expect(out(reply)).toContain("มีรายการอื่นค้างอยู่");
  });

  it("✏️ / 🗑 on an expense that no longer exists, or that is still a draft", async () => {
    expect(out(await tap({ a: "x_edit", e: "ghost" }))).toContain("รายการนี้ถูกลบไปแล้ว");
    db.rows.expenses = [DONE({ id: "d2", pending: true })];
    expect(out(await tap({ a: "x_del", e: "d2" }))).toContain("ปุ่มนี้หมดอายุแล้ว");
  });
});

describe("images", () => {
  it("a photo with no session starts a draft whose card says the slip was received and asks the amount", async () => {
    const { ctx, reply } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    expect(expenses()[0]).toMatchObject({ slip_photo_ids: ["photo-new"], payer: "เก่ง", pending: true });
    expect(session()?.step).toBe("missing");
    expect(out(reply)).toContain("รับสลิปแล้ว 📸");
    expect(out(reply)).toContain("พิมพ์ตัวเลข เช่น 120");
  });

  it("a photo mid-flow attaches to a draft that has none; a second photo asks", async () => {
    await say("120 ข้าว");
    const first = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(first.ctx);
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0].slip_photo_ids).toEqual(["photo-new"]);
    expect(out(first.reply)).toContain("แนบรูป");
    const second = makeCtx({ message: { id: "img2", type: "image" } });
    await handleImage(second.ctx);
    expect(session()?.step).toBe("conflict");
  });

  it("a number typed while the card waits fills the missing amount", async () => {
    vi.mocked(fetchLineDisplayName).mockResolvedValue("Kengz");
    const { ctx } = makeCtx({ message: { id: "img1", type: "image" } });
    await handleImage(ctx);
    const pred = await flowAnswerPredicate(ctx, session() as LineSession);
    expect(pred("120")).toBe(true);
    const reply = await answer("120");
    expect(expenses()[0].amount).toBe(120);
    expect(session()?.step).toBe("missing");
    expect(out(reply)).toContain("f=payer");
  });
});

describe("flowAnswerPredicate", () => {
  it("accepts answers the card can use and the flow commands; rejects new entries, small talk and view commands", async () => {
    await say("120 ข้าว");
    const { ctx } = textCtx("");
    const pred = await flowAnswerPredicate(ctx, session() as LineSession);
    expect(pred("HKD")).toBe(true);
    expect(pred("หารเท่า")).toBe(true);
    expect(pred("ยกเลิก")).toBe(true);
    expect(pred("สวัสดี")).toBe(false);
    expect(pred("50 กาแฟ")).toBe(false);
    expect(pred("คู่มือ")).toBe(false);
    expect(pred("แพลน")).toBe(false);
  });

  it("is false when the session's expense is gone", async () => {
    const { ctx } = textCtx("");
    const pred = await flowAnswerPredicate(ctx, { id: KEY, trip_id: "t1", expense_id: "nope", step: "missing", updated_at: "", data: {} });
    expect(pred("HKD")).toBe(false);
  });
});
