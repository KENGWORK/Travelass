import { dayColor } from "@/lib/day-color";

// Deterministic per-trip accent color (stable across reloads/devices,
// since it's derived from the trip's own id) — gives each trip card its
// own visual identity, cycling through the same 6-color palette used
// elsewhere (day chips, category colors) so it stays on-brand.
export function tripColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return dayColor(hash % 6);
}
