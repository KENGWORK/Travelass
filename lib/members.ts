// Per-trip member colors, drawn from the Pastel Pop family. nextMemberColor
// picks the first unused color so members stay visually distinct.
export const MEMBER_COLORS = [
  "#6366f1", // periwinkle
  "#e86b84", // rose
  "#3fa9a0", // teal
  "#d98e5a", // peach
  "#b0a23c", // gold
  "#9b8fb5", // muted violet
] as const;

export function nextMemberColor(existing: string[]): string {
  const free = MEMBER_COLORS.find((c) => !existing.includes(c));
  return free ?? MEMBER_COLORS[0];
}
