// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/line-handlers/expense", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn(), handleImage: vi.fn(), flowAnswerPredicate: vi.fn() }));
vi.mock("@/lib/line-handlers/plan", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-handlers/booking", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-handlers/places", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-handlers/info", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-handlers/transport", () => ({ handleRoute: vi.fn(), handlePostback: vi.fn() }));
vi.mock("@/lib/line-session", () => ({ readFlowSession: vi.fn() }));

import * as expense from "@/lib/line-handlers/expense";
import * as plan from "@/lib/line-handlers/plan";
import * as booking from "@/lib/line-handlers/booking";
import * as places from "@/lib/line-handlers/places";
import * as info from "@/lib/line-handlers/info";
import * as transport from "@/lib/line-handlers/transport";
import { readFlowSession } from "@/lib/line-session";
import { dispatchEvent, dispatchEventWithTrip, isHandledEvent, type BaseCtx } from "./line-dispatch";
import type { HandlerCtx } from "@/lib/line-handlers/types";
import type { LineEvent } from "@/lib/line";
import type { Trip, LineSession } from "@/lib/models/types";
import { encodePostback, textMessage, type FlexNode } from "@/lib/line-flex";
import { HINT_TEXT, NO_TRIP_TEXT } from "@/lib/line-menu";
import { buildGuideMessage } from "@/lib/line-guide";

const TRIP: Trip = {
  id: "t1", name: "ฮ่องกง", destination: "Hong Kong", start_date: "2026-11-19", end_date: "2026-11-24",
  home_currency: "THB", trip_currency: "HKD", status: "active", cover_photo_id: "",
  home_timezone: "Asia/Bangkok", trip_timezone: "Asia/Hong_Kong",
};
const NOW = new Date("2026-11-20T03:00:00.000Z");
const SOURCE = { type: "group", groupId: "g1", userId: "u1" };
const KEY = "group:g1:user:u1";
const SESSION: LineSession = { id: KEY, trip_id: "t1", expense_id: "e1", step: "awaiting_name", updated_at: NOW.toISOString(), data: {} };

function ctxFor(event: LineEvent, over: Partial<HandlerCtx> = {}): HandlerCtx {
  return {
    event, replyToken: "rt", accessToken: "tok", origin: "https://app.test", now: NOW,
    userKey: KEY, isGroup: true, trip: TRIP, reply: vi.fn(async () => {}), ...over,
  };
}
const textEvent = (text: string): LineEvent => ({ type: "message", replyToken: "rt", source: SOURCE, message: { id: "m1", type: "text", text } });
const imageEvent = (): LineEvent => ({ type: "message", replyToken: "rt", source: SOURCE, message: { id: "m2", type: "image" } });
const postbackEvent = (data: Record<string, string>): LineEvent => ({ type: "postback", replyToken: "rt", source: SOURCE, postback: { data: encodePostback(data) } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFlowSession).mockResolvedValue(null);
  vi.mocked(expense.flowAnswerPredicate).mockResolvedValue(() => false);
});

describe("isHandledEvent", () => {
  it("accepts text, image and postback events", () => {
    expect(isHandledEvent(textEvent("hi"))).toBe(true);
    expect(isHandledEvent(imageEvent())).toBe(true);
    expect(isHandledEvent(postbackEvent({ a: "menu" }))).toBe(true);
  });

  it("rejects other events", () => {
    expect(isHandledEvent({ type: "follow", source: SOURCE })).toBe(false);
    expect(isHandledEvent({ type: "message", source: SOURCE, message: { id: "x", type: "sticker" } })).toBe(false);
    expect(isHandledEvent({ type: "postback", source: SOURCE })).toBe(false);
  });

  it("handles group/room events with no userId (member hasn't accepted OA terms)", () => {
    expect(isHandledEvent({ type: "message", replyToken: "rt", source: { type: "group", groupId: "g1" }, message: { id: "m1", type: "text", text: "แพลน" } })).toBe(true);
    expect(isHandledEvent({ type: "message", replyToken: "rt", source: { type: "room", roomId: "r1" }, message: { id: "m1", type: "text", text: "แพลน" } })).toBe(true);
  });

  it("skips events whose source has no id at all", () => {
    expect(isHandledEvent({ type: "message", replyToken: "rt", source: { type: "user" }, message: { id: "m1", type: "text", text: "แพลน" } })).toBe(false);
  });
});

describe("dispatchEventWithTrip (lazy trip)", () => {
  function baseFor(event: LineEvent, over: Partial<BaseCtx> = {}): BaseCtx {
    return { event, replyToken: "rt", accessToken: "tok", origin: "https://app.test", now: NOW, userKey: KEY, isGroup: true, reply: vi.fn(async () => {}), ...over };
  }

  it("never loads the trip for small talk, hints or the menu", async () => {
    const loadTrip = vi.fn(async () => TRIP);
    await dispatchEventWithTrip(baseFor(textEvent("สวัสดี")), loadTrip);
    await dispatchEventWithTrip(baseFor(textEvent("สวัสดี"), { isGroup: false }), loadTrip);
    await dispatchEventWithTrip(baseFor(textEvent("เมนู")), loadTrip);
    await dispatchEventWithTrip(baseFor(textEvent("คู่มือ")), loadTrip);
    await dispatchEventWithTrip(baseFor(postbackEvent({ a: "menu" })), loadTrip);
    expect(loadTrip).not.toHaveBeenCalled();
  });

  it("loads the trip once and passes it to the handler", async () => {
    const loadTrip = vi.fn(async () => TRIP);
    const base = baseFor(textEvent("แพลน"));
    await dispatchEventWithTrip(base, loadTrip);
    expect(loadTrip).toHaveBeenCalledTimes(1);
    expect(plan.handleRoute).toHaveBeenCalledWith({ ...base, trip: TRIP }, { kind: "plan", rest: "" });
  });

  it("loads the trip only once even when the flow predicate also needs it", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(SESSION);
    vi.mocked(expense.flowAnswerPredicate).mockResolvedValue(() => true);
    const loadTrip = vi.fn(async () => TRIP);
    await dispatchEventWithTrip(baseFor(textEvent("เก่ง")), loadTrip);
    expect(loadTrip).toHaveBeenCalledTimes(1);
    expect(expense.handleRoute).toHaveBeenCalledTimes(1);
  });
});

describe("postbacks", () => {
  it.each([
    ["x_payer", expense],
    ["plan_open", plan],
    ["bk_open", booking],
    ["pl_visit", places],
    ["qi_open", info],
    ["qn_full", info],
    ["tr_open", transport],
  ])("%s goes to its feature's handlePostback", async (a, mod) => {
    const ctx = ctxFor(postbackEvent({ a, id: "1" }));
    await dispatchEvent(ctx);
    expect(mod.handlePostback).toHaveBeenCalledWith(ctx, { a, id: "1" });
  });

  it("ignores an unknown prefix", async () => {
    const ctx = ctxFor(postbackEvent({ a: "zz_what" }));
    await dispatchEvent(ctx);
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(plan.handlePostback).not.toHaveBeenCalled();
  });

  it("feature postbacks need an active trip", async () => {
    const ctx = ctxFor(postbackEvent({ a: "bk_open" }), { trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(NO_TRIP_TEXT)]);
    expect(booking.handlePostback).not.toHaveBeenCalled();
  });

  it("menu replies the menu carousel even without a trip", async () => {
    const ctx = ctxFor(postbackEvent({ a: "menu" }), { trip: null });
    await dispatchEvent(ctx);
    const [msgs] = vi.mocked(ctx.reply).mock.calls[0] as [FlexNode[]];
    expect(msgs[0].type).toBe("flex");
    expect((msgs[0].contents as FlexNode).type).toBe("carousel");
  });

  it("menu_go runs the shortcut's route", async () => {
    const ctx = ctxFor(postbackEvent({ a: "menu_go", t: "places", k: "w" }));
    await dispatchEvent(ctx);
    expect(places.handleRoute).toHaveBeenCalledWith(ctx, { kind: "places", placeKind: "w", rest: "" });
  });

  it("menu_go with t=guide replies the guide without a trip; q picks a topic", async () => {
    const all = ctxFor(postbackEvent({ a: "menu_go", t: "guide" }), { trip: null });
    await dispatchEvent(all);
    expect(all.reply).toHaveBeenCalledWith([buildGuideMessage(null)]);
    const one = ctxFor(postbackEvent({ a: "menu_go", t: "guide", q: "booking" }), { trip: null });
    await dispatchEvent(one);
    expect(one.reply).toHaveBeenCalledWith([buildGuideMessage("booking")]);
  });

  it("amb_expense starts a new expense when no flow is pending", async () => {
    const ctx = ctxFor(postbackEvent({ a: "amb_expense", q: "ตั๋วรถ 50" }));
    await dispatchEvent(ctx);
    expect(expense.handleRoute).toHaveBeenCalledWith(ctx, { kind: "expense_new", text: "ตั๋วรถ 50" });
  });

  it("amb_expense becomes flow_conflict when a flow is pending", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(SESSION);
    const ctx = ctxFor(postbackEvent({ a: "amb_expense", q: "ตั๋วรถ 50" }));
    await dispatchEvent(ctx);
    expect(expense.handleRoute).toHaveBeenCalledWith(ctx, { kind: "flow_conflict", text: "ตั๋วรถ 50" });
  });

  it("amb_go routes to the command with the original text", async () => {
    const ctx = ctxFor(postbackEvent({ a: "amb_go", t: "booking", q: "ตั๋วรถ 50" }));
    await dispatchEvent(ctx);
    expect(booking.handleRoute).toHaveBeenCalledWith(ctx, { kind: "booking", rest: "รถ 50" });
  });

  it("amb_go with a bad target does nothing", async () => {
    const ctx = ctxFor(postbackEvent({ a: "amb_go", t: "nope", q: "x" }));
    await dispatchEvent(ctx);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe("images", () => {
  it("go to expense.handleImage", async () => {
    const ctx = ctxFor(imageEvent());
    await dispatchEvent(ctx);
    expect(expense.handleImage).toHaveBeenCalledWith(ctx);
  });

  it("need an active trip", async () => {
    const ctx = ctxFor(imageEvent(), { trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(NO_TRIP_TEXT)]);
    expect(expense.handleImage).not.toHaveBeenCalled();
  });
});

describe("text", () => {
  it("reads the flow session by userKey and routes a view command", async () => {
    const ctx = ctxFor(textEvent("แพลน พรุ่งนี้"));
    await dispatchEvent(ctx);
    expect(readFlowSession).toHaveBeenCalledWith(KEY, NOW);
    expect(plan.handleRoute).toHaveBeenCalledWith(ctx, { kind: "plan", rest: "พรุ่งนี้" });
  });

  it("answers คู่มือ without a trip and without loading one", async () => {
    const ctx = ctxFor(textEvent("คู่มือการใช้งาน"), { trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([buildGuideMessage(null)]);
    expect(plan.handleRoute).not.toHaveBeenCalled();
  });

  it("answers คู่มือ <topic> with that topic's bubble, even in a group", async () => {
    const ctx = ctxFor(textEvent("คู่มือ แพลน"), { isGroup: true });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([buildGuideMessage("plan")]);
  });

  it("คู่มือ is a view command: it does not touch a pending expense flow", async () => {
    vi.mocked(readFlowSession).mockResolvedValue({ ...SESSION, step: "missing" });
    vi.mocked(expense.flowAnswerPredicate).mockResolvedValue(() => false);
    const ctx = ctxFor(textEvent("คู่มือ"));
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([buildGuideMessage(null)]);
    expect(expense.handleRoute).not.toHaveBeenCalled();
  });

  it("asks the expense flow whether the text answers it", async () => {
    vi.mocked(readFlowSession).mockResolvedValue(SESSION);
    vi.mocked(expense.flowAnswerPredicate).mockResolvedValue(() => true);
    const ctx = ctxFor(textEvent("เก่ง"));
    await dispatchEvent(ctx);
    expect(expense.flowAnswerPredicate).toHaveBeenCalledWith(ctx, SESSION);
    expect(expense.handleRoute).toHaveBeenCalledWith(ctx, { kind: "flow_answer" });
  });

  it("does not ask the predicate when there is no session", async () => {
    const ctx = ctxFor(textEvent("เก่ง"));
    await dispatchEvent(ctx);
    expect(expense.flowAnswerPredicate).not.toHaveBeenCalled();
  });

  it("sends info and notes to the info handler", async () => {
    const a = ctxFor(textEvent("ข้อมูล wifi"));
    await dispatchEvent(a);
    expect(info.handleRoute).toHaveBeenCalledWith(a, { kind: "info", rest: "wifi" });
    const b = ctxFor(textEvent("โน้ต"));
    await dispatchEvent(b);
    expect(info.handleRoute).toHaveBeenCalledWith(b, { kind: "notes", rest: "" });
  });

  it("routes transport and expense_new", async () => {
    const a = ctxFor(textEvent("รอบต่อไป"));
    await dispatchEvent(a);
    expect(transport.handleRoute).toHaveBeenCalledWith(a, { kind: "transport", rest: "", next: true });
    const b = ctxFor(textEvent("120 ข้าว"));
    await dispatchEvent(b);
    expect(expense.handleRoute).toHaveBeenCalledWith(b, { kind: "expense_new", text: "120 ข้าว" });
  });

  it("asks expense-or-command for ambiguous text", async () => {
    const ctx = ctxFor(textEvent("ตั๋วรถ 50"));
    await dispatchEvent(ctx);
    const [msgs] = vi.mocked(ctx.reply).mock.calls[0] as [FlexNode[]];
    expect(msgs[0].type).toBe("text");
    expect(((msgs[0].quickReply as FlexNode).items as unknown[]).length).toBe(2);
    expect(booking.handleRoute).not.toHaveBeenCalled();
  });

  it("stays silent on small talk in a group", async () => {
    const ctx = ctxFor(textEvent("สวัสดี"), { isGroup: true });
    await dispatchEvent(ctx);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("hints on small talk in 1:1, even without a trip", async () => {
    const ctx = ctxFor(textEvent("สวัสดี"), { isGroup: false, trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(HINT_TEXT)]);
  });

  it("menu works without a trip", async () => {
    const ctx = ctxFor(textEvent("เมนู"), { trip: null });
    await dispatchEvent(ctx);
    const [msgs] = vi.mocked(ctx.reply).mock.calls[0] as [FlexNode[]];
    expect(msgs[0].type).toBe("flex");
  });

  it("trip-dependent routes reply the no-trip message", async () => {
    const ctx = ctxFor(textEvent("แพลน"), { trip: null });
    await dispatchEvent(ctx);
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(NO_TRIP_TEXT)]);
    expect(plan.handleRoute).not.toHaveBeenCalled();
  });
});
