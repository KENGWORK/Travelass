import type { LucideIcon } from "lucide-react";
import { Mascot } from "@/components/ui/Mascot";

export function EmptyState({
  title,
  subtitle,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10">
      <Mascot size={64} />
      <p className="font-medium text-text mt-1">{title}</p>
      {subtitle && <p className="text-sm text-muted max-w-[240px]">{subtitle}</p>}
    </div>
  );
}
