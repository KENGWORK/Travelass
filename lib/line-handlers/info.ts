import type { HandlerCtx, PostbackData } from "./types";
import type { Route } from "@/lib/line-router";
import { textMessage } from "@/lib/line-flex";
import { WIP_TEXT } from "@/lib/line-menu";

// Stub -- the info/notes feature's own implementation plan replaces this
// whole file. Receives both `info` and `notes` routes and `qi_`/`qn_` postbacks.
export async function handleRoute(ctx: HandlerCtx, route: Route): Promise<void> {
  void route;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}

export async function handlePostback(ctx: HandlerCtx, data: PostbackData): Promise<void> {
  void data;
  if (ctx.isGroup) return; // stay quiet in the family group until the feature ships
  await ctx.reply([textMessage(WIP_TEXT)]);
}
