import { describe, it, expect } from "vitest";
import { planBulkUpsert, planDedupe } from "./bulk-plan";

describe("planBulkUpsert", () => {
  const rows = [
    { id: "a", trip_id: "t1", name: "A" },
    { id: "b", trip_id: "t1", name: "B" },
    { id: "c", trip_id: "t1", name: "C" },
  ];

  it("splits rows into creates (id not on sheet) and updates (id on sheet, with its 1-based sheet row)", () => {
    // Sheet column A2:A ids in order: ["x", "b", "y", "c"]
    const plan = planBulkUpsert(rows, ["x", "b", "y", "c"]);
    expect(plan.creates).toEqual([rows[0]]);
    expect(plan.updates).toEqual([
      { row: rows[1], sheetRow: 3 }, // "b" at index 1 -> A2-based row 3
      { row: rows[2], sheetRow: 5 }, // "c" at index 3 -> row 5
    ]);
  });

  it("all creates when the sheet is empty", () => {
    const plan = planBulkUpsert(rows, []);
    expect(plan.creates).toEqual(rows);
    expect(plan.updates).toEqual([]);
  });

  it("all updates when every id exists", () => {
    const plan = planBulkUpsert(rows, ["a", "b", "c"]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates.map((u) => u.sheetRow)).toEqual([2, 3, 4]);
  });

  it("empty input yields empty plan", () => {
    const plan = planBulkUpsert([], ["a"]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it("uses the first occurrence when the sheet has a duplicated id", () => {
    const plan = planBulkUpsert([rows[0]], ["a", "z", "a"]);
    expect(plan.updates).toEqual([{ row: rows[0], sheetRow: 2 }]);
  });
});

describe("planDedupe", () => {
  it("keeps the first occurrence of each id, drops later duplicates", () => {
    const rows = [
      ["a", "x"],
      ["b", "y"],
      ["a", "z"],
    ];
    const plan = planDedupe(rows);
    expect(plan.unique).toEqual([
      ["a", "x"],
      ["b", "y"],
    ]);
    expect(plan.duplicateCount).toBe(1);
  });

  it("no duplicates -> unique equals input, duplicateCount 0", () => {
    const rows = [["a", "x"], ["b", "y"]];
    const plan = planDedupe(rows);
    expect(plan.unique).toEqual(rows);
    expect(plan.duplicateCount).toBe(0);
  });

  it("skips rows with a blank id", () => {
    const plan = planDedupe([["", "x"], ["a", "y"]]);
    expect(plan.unique).toEqual([["a", "y"]]);
    expect(plan.duplicateCount).toBe(0);
  });

  it("empty input", () => {
    const plan = planDedupe([]);
    expect(plan.unique).toEqual([]);
    expect(plan.duplicateCount).toBe(0);
  });

  it("triplicate id counts as 2 duplicates", () => {
    const plan = planDedupe([["a", "1"], ["a", "2"], ["a", "3"]]);
    expect(plan.unique).toEqual([["a", "1"]]);
    expect(plan.duplicateCount).toBe(2);
  });
});
