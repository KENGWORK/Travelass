import { describe, it, expect, vi, beforeEach } from "vitest";
import { convertToTHB, fetchRate, _clearCache } from "./fx";

describe("convertToTHB", () => {
  it("multiplies and rounds to 2dp", () => expect(convertToTHB(3200, 0.2299)).toBe(735.68));
  it("handles rate 1 (THB)", () => expect(convertToTHB(150.5, 1)).toBe(150.5));
});

describe("fetchRate", () => {
  beforeEach(() => { _clearCache(); vi.restoreAllMocks(); });
  it("returns 1 for THB without fetching", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await fetchRate("THB")).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });
  it("fetches frankfurter and caches", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rates: { THB: 0.2312 } })));
    expect(await fetchRate("JPY")).toBe(0.2312);
    expect(await fetchRate("JPY")).toBe(0.2312);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("api.frankfurter.dev/v1/latest?base=JPY&symbols=THB");
  });
});
