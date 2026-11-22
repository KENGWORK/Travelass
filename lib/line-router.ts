import { stripPolitePrefix, matchKeyword, hasDigit } from "@/lib/line-text";
import { matchGuide, type GuideTopic } from "@/lib/line-guide";
import { extractDate, type TripDateCtx } from "@/lib/line-date";

// Decides what an incoming LINE text message is. Pure -- the caller supplies
// the pending flow step, the flow's own answer predicate and the trip dates.

export type Route =
  | { kind: "flow_answer" }
  | { kind: "menu" }
  | { kind: "guide"; topic: GuideTopic | null }
  | { kind: "plan"; rest: string }
  | { kind: "info"; rest: string }
  | { kind: "notes"; rest: string }
  | { kind: "booking"; rest: string }
  | { kind: "places"; placeKind: "r" | "w"; rest: string }
  | { kind: "transport"; rest: string; next: boolean }
  | { kind: "ambiguous"; target: "booking" | "places" | "transport"; text: string }
  | { kind: "expense_new"; text: string }
  | { kind: "flow_conflict"; text: string }
  | { kind: "flow_reask" }
  | { kind: "ignore" }
  | { kind: "hint" };

export interface RouteCtx {
  flowStep: string | null;
  isFlowAnswer: (text: string) => boolean;
  isGroup: boolean;
  dateCtx: TripDateCtx | null;
}

export const MENU_KEYWORDS = ["เมนู", "?"] as const;
export const PLAN_KEYWORDS = ["แพลน", "plan"] as const;
// These are passed to the plan handler as the whole token (rest = full text).
export const PLAN_TOKEN_KEYWORDS = ["ต่อไป", "next", "ตอนนี้", "now"] as const;
export const INFO_KEYWORDS = ["ข้อมูลด่วน", "ข้อมูล"] as const;
export const NOTES_KEYWORDS = ["โน้ต", "โน๊ต"] as const;
export const BOOKING_KEYWORDS = ["จอง", "ตั๋ว", "เอกสาร"] as const;
export const BOOKING_FILLERS = ["การ", "ของ"] as const;
export const RESTAURANT_KEYWORDS = ["ร้านอาหาร", "ร้าน", "กิน"] as const;
export const WISH_KEYWORDS = ["ที่เที่ยว", "อยากไป", "สถานที่"] as const;
export const TRANSPORT_KEYWORDS = ["การเดินทาง", "เดินทาง"] as const;
export const TRANSPORT_NEXT_KEYWORDS = ["รอบต่อไป", "รถรอบถัดไป"] as const;
// Expense flow commands that may arrive with no flow pending; routed as
// expense_new with the command as `text`.
export const EXPENSE_COMMAND_KEYWORDS = ["ทำต่อ", "แก้ล่าสุด", "ยกเลิก"] as const;

type AmbiguousTarget = "booking" | "places" | "transport";

// Used only to strip date tokens before the digit check when there's no
// active trip -- the resolved date itself is thrown away.
const FALLBACK_DATE_CTX: TripDateCtx = { start: "2000-01-01", end: "2000-01-01", today: "2000-01-01" };

const has = (list: readonly string[], k: string) => list.includes(k);

// "?" only counts as the whole message ("?ราคา" / "? 120" are not the menu).
const MENU_EXACT = "?";

function matchViewCommand(text: string): Route | null {
  const s = stripPolitePrefix(text);
  if (s === MENU_EXACT) return { kind: "menu" };
  const guide = matchGuide(s);
  if (guide) return { kind: "guide", topic: guide.topic };
  if (/^#\s*\d+/.test(s)) return { kind: "plan", rest: s };
  const prefixMenu = MENU_KEYWORDS.filter((k) => k !== MENU_EXACT);
  const m = matchKeyword(s, [...prefixMenu, ...PLAN_KEYWORDS, ...PLAN_TOKEN_KEYWORDS, ...INFO_KEYWORDS, ...NOTES_KEYWORDS]);
  if (!m) return null;
  if (has(MENU_KEYWORDS, m.keyword)) return { kind: "menu" };
  if (has(PLAN_KEYWORDS, m.keyword)) return { kind: "plan", rest: m.rest };
  if (has(PLAN_TOKEN_KEYWORDS, m.keyword)) return { kind: "plan", rest: s };
  if (has(INFO_KEYWORDS, m.keyword)) return { kind: "info", rest: m.rest };
  return { kind: "notes", rest: m.rest };
}

function stripBookingFillers(s: string): string {
  let out = s;
  for (;;) {
    const filler = BOOKING_FILLERS.find((f) => out.startsWith(f));
    if (!filler) return out;
    out = out.slice(filler.length).trim();
  }
}

function matchCollisionCommand(text: string): { target: AmbiguousTarget; rest: string; route: Route } | null {
  const s = stripPolitePrefix(text);

  const booking = matchKeyword(stripBookingFillers(s), BOOKING_KEYWORDS);
  if (booking) return { target: "booking", rest: booking.rest, route: { kind: "booking", rest: booking.rest } };

  const transportNext = matchKeyword(s, TRANSPORT_NEXT_KEYWORDS);
  if (transportNext) return { target: "transport", rest: transportNext.rest, route: { kind: "transport", rest: transportNext.rest, next: true } };

  const transport = matchKeyword(s, TRANSPORT_KEYWORDS);
  if (transport) return { target: "transport", rest: transport.rest, route: { kind: "transport", rest: transport.rest, next: false } };

  const place = matchKeyword(s, [...RESTAURANT_KEYWORDS, ...WISH_KEYWORDS]);
  if (place) {
    const placeKind = has(RESTAURANT_KEYWORDS, place.keyword) ? "r" : "w";
    return { target: "places", rest: place.rest, route: { kind: "places", placeKind, rest: place.rest } };
  }
  return null;
}

// True when the text is a step-2 VIEW command (แพลน/plan, ต่อไป/next,
// ตอนนี้/now, #<n>, เมนู, exactly ?, ข้อมูล/ข้อมูลด่วน, โน้ต/โน๊ต,
// คู่มือ/คู่มือการใช้งาน [หัวข้อ]). Collision
// words (ร้าน, กิน, จอง, ตั๋ว, เดินทาง, ...) are NOT included -- they show up
// in ordinary notes ("ร้านนี้อร่อย"). Flows that take free text as an answer
// use this to let view commands through.
export function isViewCommand(text: string): boolean {
  return matchViewCommand(text) !== null;
}

// For the ambiguity postback (amb_go): rebuild the feature route from the
// original message. If the keyword doesn't match the target (shouldn't
// happen), the whole stripped text becomes the search rest.
export function commandRoute(target: AmbiguousTarget, text: string): Route {
  const hit = matchCollisionCommand(text);
  if (hit && hit.target === target) return hit.route;
  const rest = stripPolitePrefix(text);
  if (target === "booking") return { kind: "booking", rest };
  if (target === "places") return { kind: "places", placeKind: "r", rest };
  return { kind: "transport", rest, next: false };
}

export function classifyText(text: string, ctx: RouteCtx): Route {
  // 1. The pending expense flow claims its own answers first.
  if (ctx.flowStep && ctx.isFlowAnswer(text)) return { kind: "flow_answer" };

  // 2. View commands never ask back, even mid-flow (the flow stays put).
  const view = matchViewCommand(text);
  if (view) return view;

  // 3. Commands that could also be an expense ("ตั๋วรถ 50").
  const hit = matchCollisionCommand(text);
  if (hit) {
    const { rest } = extractDate(hit.rest, ctx.dateCtx ?? FALLBACK_DATE_CTX);
    return hasDigit(rest) ? { kind: "ambiguous", target: hit.target, text: text.trim() } : hit.route;
  }

  // 3.5. Bare expense commands ("ทำต่อ") -- the expense handler reads `text`.
  const cmd = matchKeyword(text, EXPENSE_COMMAND_KEYWORDS);
  if (cmd && cmd.rest === "") return { kind: "expense_new", text: cmd.keyword };

  // 4. Anything with a number is an expense.
  if (hasDigit(text)) return ctx.flowStep ? { kind: "flow_conflict", text: text.trim() } : { kind: "expense_new", text: text.trim() };

  // 5. Mid-flow but off-topic: re-ask the current question.
  if (ctx.flowStep) return { kind: "flow_reask" };

  // 6. Small talk: silent in groups, a hint in 1:1.
  return ctx.isGroup ? { kind: "ignore" } : { kind: "hint" };
}
