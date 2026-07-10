import { TrainFront, Bus, Plane, Ship, Footprints, Navigation, type LucideIcon } from "lucide-react";

const MODE_ICONS: Record<string, LucideIcon> = {
  รถไฟ: TrainFront,
  บัส: Bus,
  เครื่องบิน: Plane,
  เรือ: Ship,
  เดิน: Footprints,
};

export function transportIcon(mode: string): LucideIcon {
  return MODE_ICONS[mode] ?? Navigation;
}
