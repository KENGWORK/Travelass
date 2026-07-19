import { Sunrise, Sun, Sunset, Moon, Clock, type LucideIcon } from "lucide-react";

export interface Session {
  key: string;
  label: string;
  icon: LucideIcon;
}

const MORNING: Session = { key: "morning", label: "เช้า", icon: Sunrise };
const AFTERNOON: Session = { key: "afternoon", label: "บ่าย", icon: Sun };
const EVENING: Session = { key: "evening", label: "เย็น", icon: Sunset };
const NIGHT: Session = { key: "night", label: "กลางคืน", icon: Moon };
const UNSCHEDULED: Session = { key: "unscheduled", label: "ไม่ระบุเวลา", icon: Clock };

// Groups itinerary items into a rough time-of-day band purely for visual
// scanning (a "เช้า / บ่าย / เย็น" divider) — this never touches the
// stored `time` value, it's a display-only derivation.
export function sessionOf(time: string): Session {
  if (!time) return UNSCHEDULED;
  const hour = Number(time.slice(0, 2));
  if (Number.isNaN(hour)) return UNSCHEDULED;
  if (hour >= 5 && hour < 12) return MORNING;
  if (hour >= 12 && hour < 17) return AFTERNOON;
  if (hour >= 17 && hour < 20) return EVENING;
  return NIGHT;
}
