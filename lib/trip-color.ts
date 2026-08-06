import { dayColor } from "@/lib/day-color";

function hashOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}

// Deterministic per-trip accent color (stable across reloads/devices,
// since it's derived from the trip's own id) — gives each trip card its
// own visual identity, cycling through the same 6-color palette used
// elsewhere (day chips, category colors) so it stays on-brand.
export function tripColor(id: string): string {
  return dayColor(hashOf(id) % 6);
}

// Two-tone diagonal gradient standing in for a cover photo when a trip has
// none — same on-brand palette, offset by 2 steps so the pair always reads
// as two distinct hues instead of a near-solid blend.
export function tripGradient(id: string): string {
  const hash = hashOf(id);
  return `linear-gradient(135deg, ${dayColor(hash % 6)}, ${dayColor((hash + 2) % 6)})`;
}
