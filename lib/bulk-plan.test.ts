import { describe, it, expect } from "vitest";
import { planBulkUpsert, planDedupe, planChecklistDedupe } from "./bulk-plan";

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

  // duplicateIndices lets the caller delete exactly these rows in place
  // instead of clearing the whole range and rewriting `unique` -- a
  // clear+rewrite is one bad read away from wiping rows it never saw.
  it("duplicateIndices points at the later occurrence's position in the input", () => {
    const rows = [
      ["a", "x"],
      ["b", "y"],
      ["a", "z"],
    ];
    const plan = planDedupe(rows);
    expect(plan.duplicateIndices).toEqual([2]);
  });

  it("duplicateIndices covers every later occurrence in a triplicate", () => {
    const plan = planDedupe([["a", "1"], ["a", "2"], ["a", "3"]]);
    expect(plan.duplicateIndices).toEqual([1, 2]);
  });

  it("a blank-id row contributes no duplicateIndex", () => {
    const plan = planDedupe([["", "x"], ["a", "y"]]);
    expect(plan.duplicateIndices).toEqual([]);
  });
});

describe("planChecklistDedupe", () => {
  it("drops later rows with the same trip+group+item, keeping the first", () => {
    const rows = [
      { id: "1", trip_id: "t1", group: "เอกสาร", item: "พาสปอร์ต", done: false },
      { id: "2", trip_id: "t1", group: "เอกสาร", item: "พาสปอร์ต", done: false },
    ];
    const removeIds = planChecklistDedupe(rows);
    expect(removeIds).toEqual(["2"]);
  });

  it("prefers keeping a done row over an undone duplicate, regardless of order", () => {
    const rows = [
      { id: "1", trip_id: "t1", group: "ของใช้", item: "ยา", done: false },
      { id: "2", trip_id: "t1", group: "ของใช้", item: "ยา", done: true },
    ];
    const removeIds = planChecklistDedupe(rows);
    expect(removeIds).toEqual(["1"]);
  });

  it("different group with the same item text is not a duplicate", () => {
    const rows = [
      { id: "1", trip_id: "t1", group: "เอกสาร", item: "แลกเงิน", done: false },
      { id: "2", trip_id: "t1", group: "to-do", item: "แลกเงิน", done: false },
    ];
    expect(planChecklistDedupe(rows)).toEqual([]);
  });

  it("same group+item on a different trip is not a duplicate", () => {
    const rows = [
      { id: "1", trip_id: "t1", group: "เอกสาร", item: "พาสปอร์ต", done: false },
      { id: "2", trip_id: "t2", group: "เอกสาร", item: "พาสปอร์ต", done: false },
    ];
    expect(planChecklistDedupe(rows)).toEqual([]);
  });

  it("no duplicates -> nothing removed", () => {
    const rows = [{ id: "1", trip_id: "t1", group: "เอกสาร", item: "พาสปอร์ต", done: false }];
    expect(planChecklistDedupe(rows)).toEqual([]);
  });

  it("empty input", () => {
    expect(planChecklistDedupe([])).toEqual([]);
  });
});
