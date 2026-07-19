import { CATS } from "@/lib/categories";

// Cycles through the same 6 category colors already used for spend
// categories, so a trip day's color identity (chip, timeline, time chips)
// stays visually consistent with the rest of the app instead of inventing
// a second palette.
export function dayColor(index: number): string {
  return CATS[index % CATS.length].color;
}
