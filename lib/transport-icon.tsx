import { Car, TrainFront, Bus, Plane, Ship, Footprints, Navigation, type LucideIcon } from "lucide-react";

const MODE_ICONS: Record<string, LucideIcon> = {
  รถ: Car,
  รถไฟ: TrainFront,
  รถบัส: Bus,
  เดิน: Footprints,
  // kept for existing rows saved under the old preset labels
  บัส: Bus,
  เครื่องบิน: Plane,
  เรือ: Ship,
};

export function transportIcon(mode: string): LucideIcon {
  return MODE_ICONS[mode] ?? Navigation;
}
