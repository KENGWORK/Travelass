"use client";
import { donutArcs } from "@/lib/donut";
import { CATS } from "@/lib/categories";

const SIZE = 200;
const STROKE = 24;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function colorFor(key: string): string {
  return CATS.find((c) => c.name === key)?.color ?? "var(--color-cat-other)";
}

export function CategoryDonut({
  data,
  total,
  selected,
  onSelect,
}: {
  data: Record<string, number>;
  total: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const arcs = donutArcs(data);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--color-muted)" strokeOpacity={0.15} strokeWidth={STROKE} />
          {arcs.map((a) => {
            const dash = a.frac * CIRC;
            const isSelected = selected === a.key;
            return (
              <circle
                key={`${a.key}-hitslop`}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="transparent"
                strokeWidth={44}
                strokeDasharray={`${dash} ${CIRC - dash}`}
                strokeDashoffset={-a.start * CIRC}
                className="cursor-pointer"
                onClick={() => onSelect(isSelected ? null : a.key)}
              />
            );
          })}
          {arcs.map((a) => {
            const dash = a.frac * CIRC;
            const isSelected = selected === a.key;
            const isDimmed = selected !== null && !isSelected;
            return (
              <circle
                key={a.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={colorFor(a.key)}
                strokeOpacity={isDimmed ? 0.35 : 1}
                strokeWidth={isSelected ? STROKE + 4 : STROKE}
                strokeDasharray={`${dash} ${CIRC - dash}`}
                strokeDashoffset={-a.start * CIRC}
                className="cursor-pointer transition-all"
                onClick={() => onSelect(isSelected ? null : a.key)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="money text-xl font-bold">฿{Math.round(total).toLocaleString()}</p>
          <p className="text-xs text-muted">รวม</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {arcs.map((a) => (
          <span
            key={a.key}
            onClick={() => onSelect(selected === a.key ? null : a.key)}
            className="relative inline-flex before:absolute before:inset-[-4px] before:content-['']"
          >
            <span
              className={[
                "h-9 px-3 rounded-full border border-muted/30 text-sm cursor-pointer inline-flex items-center gap-1.5",
                selected === a.key ? "border-transparent font-medium" : "",
              ].join(" ")}
              style={selected === a.key ? { backgroundColor: `${colorFor(a.key)}26`, color: colorFor(a.key) } : undefined}
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(a.key) }} />
              {a.key}
              <span className="money">฿{Math.round(data[a.key]).toLocaleString()}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
