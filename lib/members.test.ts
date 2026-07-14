import { describe, it, expect } from "vitest";
import { MEMBER_COLORS, nextMemberColor } from "./members";

describe("nextMemberColor", () => {
  it("returns the first color when none are used", () => {
    expect(nextMemberColor([])).toBe(MEMBER_COLORS[0]);
  });
  it("returns the first unused color", () => {
    expect(nextMemberColor([MEMBER_COLORS[0]])).toBe(MEMBER_COLORS[1]);
    expect(nextMemberColor([MEMBER_COLORS[0], MEMBER_COLORS[1]])).toBe(MEMBER_COLORS[2]);
  });
  it("cycles back to the first color when all are used", () => {
    expect(nextMemberColor([...MEMBER_COLORS])).toBe(MEMBER_COLORS[0]);
  });
});
