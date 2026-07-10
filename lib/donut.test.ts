import { describe, it, expect } from "vitest";
import { donutArcs } from "./donut";

describe("donutArcs", () => {
  it("fractions cover 0..1 in order", () => {
    const arcs = donutArcs({ a: 25, b: 75 });
    expect(arcs[0]).toEqual({ key: "a", start: 0, end: 0.25, frac: 0.25 });
    expect(arcs[1].end).toBe(1);
  });
  it("empty or zero total → []", () => {
    expect(donutArcs({})).toEqual([]);
    expect(donutArcs({ a: 0 })).toEqual([]);
  });
});
