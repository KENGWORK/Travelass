import type { LineEvent } from "@/lib/line";
import type { FlexNode } from "@/lib/line-flex";
import type { Trip } from "@/lib/models/types";

// Everything a feature handler needs for one LINE event. Built by the
// webhook route; handlers never touch the raw request.
export interface HandlerCtx {
  event: LineEvent;
  replyToken: string;
  accessToken: string;
  origin: string; // req.nextUrl.origin
  now: Date;
  userKey: string;
  isGroup: boolean;
  trip: Trip | null; // first trip with status === "active"
  reply: (messages: FlexNode[]) => Promise<void>; // <= 5 messages
}

export type PostbackData = Record<string, string>;
