import { describe, it, expect } from "vitest";
import { selectRows, insertRow, patchRow, removeRow, type DB } from "./local-db";

describe("local-db transforms", () => {
  it("selectRows returns [] for unknown entity", () => {
    expect(selectRows({}, "trips")).toEqual([]);
  });

  it("selectRows filters by trip_id when given", () => {
    const db: DB = {
      expenses: [
        { id: "a", trip_id: "t1" },
        { id: "b", trip_id: "t2" },
        { id: "c", trip_id: "t1" },
      ],
    };
    expect(selectRows(db, "expenses", "t1").map((r) => r.id)).toEqual(["a", "c"]);
    expect(selectRows(db, "expenses")).toHaveLength(3);
  });

  it("insertRow appends without mutating the input db", () => {
    const db: DB = { trips: [{ id: "a" }] };
    const next = insertRow(db, "trips", { id: "b" });
    expect(next.trips.map((r) => r.id)).toEqual(["a", "b"]);
    expect(db.trips).toHaveLength(1); // original untouched
  });

  it("insertRow creates the entity array when absent", () => {
    const next = insertRow({}, "trips", { id: "a" });
    expect(next.trips).toEqual([{ id: "a" }]);
  });

  it("patchRow merges fields into the matching row only", () => {
    const db: DB = { trips: [{ id: "a", name: "x", status: "planning" }, { id: "b", name: "y" }] };
    const next = patchRow(db, "trips", "a", { status: "active" });
    expect(next.trips[0]).toEqual({ id: "a", name: "x", status: "active" });
    expect(next.trips[1]).toEqual({ id: "b", name: "y" });
    expect(db.trips[0].status).toBe("planning"); // original untouched
  });

  it("patchRow is a no-op when id is not found", () => {
    const db: DB = { trips: [{ id: "a" }] };
    expect(patchRow(db, "trips", "missing", { name: "z" })).toEqual(db);
  });

  it("removeRow drops the matching row without mutating input", () => {
    const db: DB = { trips: [{ id: "a" }, { id: "b" }] };
    const next = removeRow(db, "trips", "a");
    expect(next.trips.map((r) => r.id)).toEqual(["b"]);
    expect(db.trips).toHaveLength(2);
  });

  it("preserves array fields (e.g. photo data URLs) intact", () => {
    const url = "data:image/jpeg;base64,AAAA,BBBB"; // contains commas
    const next = insertRow({}, "expenses", { id: "a", slip_photo_ids: [url] });
    expect(selectRows(next, "expenses")[0].slip_photo_ids).toEqual([url]);
  });
});
