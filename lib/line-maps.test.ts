import { describe, it, expect } from "vitest";
import { mapButtons, googleSearchUrl, googleDirUrl, amapSearchUrl, toTravelMode } from "./line-maps";
import type { FlexNode } from "./line-flex";

const uriOf = (b: FlexNode) => (b.action as FlexNode).uri as string;
const labelOf = (b: FlexNode) => (b.action as FlexNode).label as string;

describe("URL builders", () => {
  it("encodes Chinese place names", () => {
    const enc = encodeURIComponent("迪士尼");
    expect(googleSearchUrl("迪士尼")).toBe(`https://www.google.com/maps/search/?api=1&query=${enc}`);
    expect(amapSearchUrl("迪士尼")).toBe(`https://uri.amap.com/search?keyword=${enc}`);
    expect(amapSearchUrl("迪士尼")).not.toContain("迪");
  });

  it("Google directions has a destination and travel mode but no origin", () => {
    const url = googleDirUrl("Hong Kong Disneyland", "transit");
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=Hong%20Kong%20Disneyland&travelmode=transit");
    expect(url).not.toContain("origin");
  });
});

describe("toTravelMode", () => {
  it("maps free-text transport modes", () => {
    expect(toTravelMode("เดิน")).toBe("walking");
    expect(toTravelMode("Walk")).toBe("walking");
    expect(toTravelMode("แท็กซี่")).toBe("driving");
    expect(toTravelMode("Taxi")).toBe("driving");
    expect(toTravelMode("รถไฟ MTR")).toBe("transit");
    expect(toTravelMode("")).toBe("transit");
  });
});

describe("mapButtons", () => {
  it("returns [] with neither query nor mapsLink", () => {
    expect(mapButtons({ query: "  " })).toEqual([]);
    expect(mapButtons({ query: "", mapsLink: "" })).toEqual([]);
  });

  it("returns Google + Amap search buttons for a query", () => {
    const buttons = mapButtons({ query: "Mong Kok" });
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.type === "button")).toBe(true);
    expect(labelOf(buttons[0])).toBe("Google Maps");
    expect(uriOf(buttons[0])).toBe(googleSearchUrl("Mong Kok"));
    expect(labelOf(buttons[1])).toBe("高德 Amap");
    expect(uriOf(buttons[1])).toBe(amapSearchUrl("Mong Kok"));
  });

  it("prefers the saved mapsLink for the Google button", () => {
    const buttons = mapButtons({ query: "Mong Kok", mapsLink: "https://maps.app.goo.gl/abc" });
    expect(uriOf(buttons[0])).toBe("https://maps.app.goo.gl/abc");
    expect(uriOf(buttons[1])).toBe(amapSearchUrl("Mong Kok"));
  });

  it("mapsLink wins even in directions mode", () => {
    const buttons = mapButtons({ query: "迪士尼", mapsLink: "https://maps.app.goo.gl/abc", directions: { mode: "รถไฟ" } });
    expect(uriOf(buttons[0])).toBe("https://maps.app.goo.gl/abc");
  });

  it("directions mode uses a Google directions URL", () => {
    const buttons = mapButtons({ query: "迪士尼", directions: { mode: "รถไฟ" } });
    expect(labelOf(buttons[0])).toBe("Google Maps นำทาง");
    expect(uriOf(buttons[0])).toBe(googleDirUrl("迪士尼", "transit"));
  });

  it("mapsLink without a query -> Google button only", () => {
    const buttons = mapButtons({ query: "", mapsLink: "https://maps.app.goo.gl/abc" });
    expect(buttons).toHaveLength(1);
    expect(uriOf(buttons[0])).toBe("https://maps.app.goo.gl/abc");
  });
});
