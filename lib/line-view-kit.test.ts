import { describe, it, expect } from "vitest";
import {
  NO_TRIP_TEXT, GONE_TEXT, truncate, firstLine, exceedsLines, pageSlice, includesCI, joinParts,
  tripNowHHMM, appUrl, emptyStateMessage, zoomHero, albumMessage, outOfRangeText, norm, splitLongText, longTextMessages,
} from "./line-view-kit";
import { actionsOf, allText, hasEmptyText, mkTrip } from "./line-view.test-helpers";
import { imageUrl } from "./line-flex";

const ORIGIN = "https://app.test";

describe("text helpers", () => {
  it("truncate keeps short text and cuts long text with an ellipsis", () => {
    expect(truncate("abc", 4)).toBe("abc");
    expect(truncate("abcdef", 4)).toBe("abc…");
  });

  it("norm trims and collapses whitespace", () => {
    expect(norm("  a   b \n c ")).toBe("a b c");
  });

  it("firstLine returns the first non-empty trimmed line", () => {
    expect(firstLine("\n   \n hello \nworld")).toBe("hello");
    expect(firstLine("")).toBe("");
  });

  it("exceedsLines counts explicit and wrapped lines", () => {
    expect(exceedsLines("a\nb\nc", 3)).toBe(false);
    expect(exceedsLines("a\nb\nc\nd", 3)).toBe(true);
    expect(exceedsLines("x".repeat(100), 3)).toBe(true); // ceil(100/32) = 4 lines
    expect(exceedsLines("x".repeat(90), 3)).toBe(false);
  });

  it("includesCI matches case-insensitively and treats an empty query as a match", () => {
    expect(includesCI(["Mong Kok"], "mong")).toBe(true);
    expect(includesCI(["a", null, undefined], "")).toBe(true);
    expect(includesCI(["a"], "z")).toBe(false);
  });

  it("includesCI needs every token, each in any field", () => {
    expect(includesCI(["wifi", "HK-5G pass"], "wifi 5g")).toBe(true);
    expect(includesCI(["wifi", "HK-5G pass"], "wifi 6g")).toBe(false);
  });

  it("joinParts drops empty parts", () => {
    expect(joinParts(["a", "", null, undefined, false, "b"])).toBe("a · b");
    expect(joinParts(["a", "b"], "/")).toBe("a/b");
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  it("returns 15 per page and reports more", () => {
    expect(pageSlice(items, 1)).toEqual({ items: items.slice(0, 15), hasMore: true });
    expect(pageSlice(items, 2)).toEqual({ items: items.slice(15), hasMore: false });
  });
  it("treats an invalid page as page 1", () => {
    expect(pageSlice(items, 0).items[0]).toBe(0);
    expect(pageSlice(items, Number.NaN).items[0]).toBe(0);
  });
});

describe("trip helpers", () => {
  it("tripNowHHMM uses the trip timezone", () => {
    expect(tripNowHHMM(mkTrip(), new Date("2026-11-20T03:00:00Z"))).toBe("11:00");
  });
  it("appUrl builds an in-app link", () => {
    expect(appUrl(ORIGIN, "t1", "bookings")).toBe("https://app.test/trips/t1/bookings");
  });
  it("outOfRangeText mentions the trip range", () => {
    expect(outOfRangeText(mkTrip())).toContain("นอกช่วงทริป");
  });
  it("exposes the verbatim no-trip text", () => {
    expect(NO_TRIP_TEXT).toBe('ยังไม่มีทริปที่สถานะ "กำลังเที่ยว" อยู่ตอนนี้ เปลี่ยนสถานะทริปในแอปก่อนนะ');
    expect(GONE_TEXT).toContain("ไม่เจอ");
  });
});

describe("splitLongText / longTextMessages", () => {
  it("short text is one part", () => expect(splitLongText("hello")).toEqual({ parts: ["hello"], truncated: false }));
  it("exactly max (4800) is one part", () => expect(splitLongText("a".repeat(4800)).parts).toHaveLength(1));
  it("cuts at the nearest newline", () => {
    expect(splitLongText(`${"a".repeat(10)}\n${"b".repeat(10)}`, 15)).toEqual({ parts: ["a".repeat(10), "b".repeat(10)], truncated: false });
  });
  it("hard-cuts when there is no newline", () => {
    expect(splitLongText("x".repeat(25), 10).parts).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
  it("stops at maxParts and reports truncation", () => {
    const r = splitLongText("x".repeat(100), 10, 5);
    expect(r.parts).toHaveLength(5);
    expect(r.truncated).toBe(true);
  });
  it("empty text has no parts", () => expect(splitLongText("")).toEqual({ parts: [], truncated: false }));

  it("longTextMessages: ≤ 5 texts, suffix on truncation, each ≤ 5000 chars", () => {
    const url = "https://app.test/trips/t1/info?tab=quicknotes";
    const msgs = longTextMessages("x".repeat(4800 * 6), url, "ว่าง");
    expect(msgs).toHaveLength(5);
    expect(String((msgs[4] as { text: string }).text)).toContain(`…ยังมีต่อ อ่านในแอป ${url}`);
    expect(msgs.every((m) => String((m as { text: string }).text).length <= 5000)).toBe(true);
    expect(longTextMessages("", url, "ว่าง")).toEqual([expect.objectContaining({ type: "text", text: "ว่าง" })]);
  });
});

describe("flex helpers", () => {
  it("emptyStateMessage shows the text and an open-app uri button", () => {
    const msg = emptyStateMessage("ทริปนี้ยังไม่มีการจอง", "https://app.test/trips/t1/bookings");
    expect(allText(msg)).toContain("ทริปนี้ยังไม่มีการจอง");
    expect(actionsOf(msg).some((a) => a.type === "uri" && a.uri === "https://app.test/trips/t1/bookings")).toBe(true);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("zoomHero opens the full image and labels it", () => {
    const hero = zoomHero({ origin: ORIGIN, photoId: "p1" });
    expect(actionsOf(hero).some((a) => a.type === "uri" && a.uri === imageUrl(ORIGIN, "p1"))).toBe(true);
    expect(allText(hero)).toContain("แตะเพื่อขยาย");
    expect(hasEmptyText(hero)).toBe(false);
  });

  it("zoomHero shows a badge when given", () => {
    expect(allText(zoomHero({ origin: ORIGIN, photoId: "p1", badge: "⭐ ต้องลอง" }))).toContain("⭐ ต้องลอง");
  });

  it("albumMessage always returns a flex message containing the photos", () => {
    const msg = albumMessage({ origin: ORIGIN, photoIds: ["p1", "p2"], title: "รูป", moreUrl: `${ORIGIN}/trips/t1` });
    expect(msg.type).toBe("flex");
    expect(JSON.stringify(msg)).toContain(imageUrl(ORIGIN, "p2"));
  });
});
