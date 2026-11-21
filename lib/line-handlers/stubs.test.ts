import { describe, it, expect, vi } from "vitest";
import * as booking from "./booking";
import * as places from "./places";
import * as info from "./info";
import type { HandlerCtx } from "./types";
import { textMessage } from "@/lib/line-flex";
import { WIP_TEXT } from "@/lib/line-menu";

function makeCtx(isGroup = false): HandlerCtx {
  return {
    event: { type: "message", replyToken: "rt", source: { type: "user", userId: "u1" }, message: { id: "m1", type: "text", text: "x" } },
    replyToken: "rt",
    accessToken: "tok",
    origin: "https://app.test",
    now: new Date("2026-11-20T03:00:00Z"),
    userKey: "user:u1",
    isGroup,
    trip: null,
    reply: vi.fn(async () => {}),
  };
}

describe.each([
  ["booking", booking],
  ["places", places],
  ["info", info],
])("%s stub", (_name, mod) => {
  it("handleRoute replies 'in development'", async () => {
    const ctx = makeCtx();
    await mod.handleRoute(ctx, { kind: "plan", rest: "" });
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(WIP_TEXT)]);
  });

  it("handlePostback replies 'in development'", async () => {
    const ctx = makeCtx();
    await mod.handlePostback(ctx, { a: "x" });
    expect(ctx.reply).toHaveBeenCalledWith([textMessage(WIP_TEXT)]);
  });

  it("stays silent in a group chat", async () => {
    const ctx = makeCtx(true);
    await mod.handleRoute(ctx, { kind: "plan", rest: "" });
    await mod.handlePostback(ctx, { a: "x" });
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
