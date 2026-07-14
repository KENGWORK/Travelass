import { describe, it, expect } from "vitest";
import { resourceListUrl, resourceItemUrl } from "./resource-url";

describe("resource-url", () => {
  it("resourceListUrl with no tripId", () => {
    expect(resourceListUrl("trips")).toBe("/api/resource/trips");
  });

  it("resourceListUrl with a tripId appends the query param", () => {
    expect(resourceListUrl("expenses", "t1")).toBe("/api/resource/expenses?trip_id=t1");
  });

  it("resourceItemUrl appends the id as a query param", () => {
    expect(resourceItemUrl("trips", "abc123")).toBe("/api/resource/trips?id=abc123");
  });

  it("resourceItemUrl URL-encodes the id", () => {
    expect(resourceItemUrl("trips", "a b/c")).toBe("/api/resource/trips?id=a%20b%2Fc");
  });
});
