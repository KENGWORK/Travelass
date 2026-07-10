export function donutArcs(data: Record<string, number>): { key: string; start: number; end: number; frac: number }[] {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  let acc = 0;
  return Object.entries(data).map(([key, v]) => {
    const start = acc / total; acc += v;
    return { key, start, end: acc / total, frac: v / total };
  });
}
