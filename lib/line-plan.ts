// lib/line-plan.ts
import type { DayPlan, ItineraryItem } from "@/lib/models/types";
import { extractDate, addDays, type TripDateCtx } from "@/lib/line-date";

// What a plan command asks for. The router already removed the command
// word (แพลน / plan); `rest` is the remainder -- or, for #n / ต่อไป / ตอนนี้,
// the token itself (see the shared LINE spec, Router step 2).
export type PlanQuery =
  | { kind: "overview"; date: string | null }
  | { kind: "detail"; date: string | null; index: number }
  | { kind: "next" }
  | { kind: "now" }
  | { kind: "out_of_range" }
  | { kind: "bad_date" };

const NEXT_WORDS = ["ต่อไป", "next"];
const NOW_WORDS = ["ตอนนี้", "now"];
const INDEX_RE = /^#?\s*(\d{1,2})$/;

function indexQuery(date: string | null, digits: string): PlanQuery {
  const index = parseInt(digits, 10);
  return index >= 1 ? { kind: "detail", date, index } : { kind: "bad_date" };
}

export function parsePlanQuery(rest: string, ctx: TripDateCtx): PlanQuery {
  const text = rest.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  if (NEXT_WORDS.includes(lower)) return { kind: "next" };
  if (NOW_WORDS.includes(lower)) return { kind: "now" };

  // A lone 1–2 digit number is never a date token, so check it before
  // extractDate -- "แพลน 2" means item 2, not the 2nd of some month.
  const bare = INDEX_RE.exec(text);
  if (bare) return indexQuery(null, bare[1]);

  const { date, rest: left, outOfRange } = extractDate(text, ctx);
  if (outOfRange) return { kind: "out_of_range" };
  const leftover = left.trim();
  if (leftover === "") return { kind: "overview", date };
  const idx = INDEX_RE.exec(leftover);
  if (idx) return indexQuery(date, idx[1]);
  return { kind: "bad_date" };
}

export function inTrip(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function tripDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

// Up to `max` trip days for a quick-reply picker: the whole trip if it fits,
// otherwise a window starting at today (clamped so it never runs past the end).
export function dayWindow(start: string, end: string, today: string, max: number): string[] {
  const all = tripDates(start, end);
  if (all.length <= max) return all;
  const ti = all.indexOf(today);
  const from = ti === -1 ? 0 : Math.min(ti, all.length - max);
  return all.slice(from, from + max);
}

export function plansForDay(dayPlans: DayPlan[], date: string): DayPlan[] {
  return dayPlans.filter((p) => p.day_date === date).sort((a, b) => a.sort_order - b.sort_order);
}

export function activePlanFor(dayPlans: DayPlan[], date: string): DayPlan | null {
  return plansForDay(dayPlans, date).find((p) => p.is_active) ?? null;
}

export function sortItems(items: ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => {
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    if (a.time !== b.time) return a.time < b.time ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
}

// planId undefined = the day's active plan; a day with no DayPlan rows has
// no active plan, so every item of that day is returned (they all carry
// plan_id "" anyway -- same rule as the itinerary page).
export function itemsForDay(items: ItineraryItem[], dayPlans: DayPlan[], date: string, planId?: string): ItineraryItem[] {
  const pid = planId ?? activePlanFor(dayPlans, date)?.id;
  return sortItems(items.filter((it) => it.day_date === date && (pid === undefined || it.plan_id === pid)));
}

// HH:MM strings are zero-padded, so plain string comparison orders them.
export function nextItemIndex(items: ItineraryItem[], nowHHMM: string): number | null {
  const i = items.findIndex((it) => it.status === "planned" && it.time !== "" && it.time >= nowHHMM);
  return i === -1 ? null : i;
}

export function currentItemIndex(items: ItineraryItem[], nowHHMM: string): number | null {
  const i = items.findIndex(
    (it) => it.status === "planned" && it.time !== "" && it.end_time !== "" && it.time <= nowHHMM && nowHHMM < it.end_time,
  );
  return i === -1 ? null : i;
}

export function isDayFinished(items: ItineraryItem[], nowHHMM: string): boolean {
  if (items.length === 0) return false;
  return !items.some(
    (it) => it.status === "planned" && (it.time === "" || it.time >= nowHHMM || (it.end_time !== "" && nowHHMM < it.end_time)),
  );
}

export function resolveIndexDate(qDate: string | null, lastPlanDate: string | null, today: string, start: string, end: string): string {
  if (qDate) return qDate;
  if (lastPlanDate && inTrip(lastPlanDate, start, end)) return lastPlanDate;
  return today;
}

export function neighbors(items: ItineraryItem[], id: string): { index: number; prevId: string | null; nextId: string | null } {
  const i = items.findIndex((it) => it.id === id);
  if (i === -1) return { index: 0, prevId: null, nextId: null };
  return { index: i + 1, prevId: items[i - 1]?.id ?? null, nextId: items[i + 1]?.id ?? null };
}
