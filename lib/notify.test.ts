import { describe, it, expect, vi } from "vitest";
import { subscribe, notify } from "./notify";

describe("notify", () => {
  it("calls a subscribed listener when notified for the same entity", () => {
    const cb = vi.fn();
    subscribe("test-entity-1", cb);
    notify("test-entity-1");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not call listeners subscribed to a different entity", () => {
    const cb = vi.fn();
    subscribe("test-entity-2", cb);
    notify("test-entity-other");
    expect(cb).not.toHaveBeenCalled();
  });

  it("stops calling a listener after it unsubscribes", () => {
    const cb = vi.fn();
    const unsubscribe = subscribe("test-entity-3", cb);
    unsubscribe();
    notify("test-entity-3");
    expect(cb).not.toHaveBeenCalled();
  });

  it("calls every listener subscribed to the same entity", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe("test-entity-4", a);
    subscribe("test-entity-4", b);
    notify("test-entity-4");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
