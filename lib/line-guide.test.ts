// lib/line-guide.test.ts
import { describe, it, expect } from "vitest";
import * as router from "./line-router";
import { GUIDE_KEYWORDS, GUIDE_TOPICS, buildGuideMessage, matchGuide, topicFromId, type GuideTopic } from "./line-guide";
import { actions, findNode, hasEmptyText, walk, type Node } from "./line-test-helpers";

const ids = GUIDE_TOPICS.map((t) => t.id);
const messageActions = (root: unknown): Node[] => {
  const out: Node[] = [];
  walk(root, (n) => {
    if (n.type === "message") out.push(n);
  });
  return out;
};
const bubbleFor = (t: GuideTopic) => (buildGuideMessage(t).contents as Node);

describe("GUIDE_TOPICS", () => {
  it("has the 7 topics, each with 4-6 commands and 2-3 examples", () => {
    expect(ids).toEqual(["expense", "plan", "booking", "places", "info", "transport", "other"]);
    for (const t of GUIDE_TOPICS) {
      expect(t.commands.length).toBeGreaterThanOrEqual(4);
      expect(t.commands.length).toBeLessThanOrEqual(6);
      expect(t.examples.length).toBeGreaterThanOrEqual(2);
      expect(t.examples.length).toBeLessThanOrEqual(3);
    }
  });

  it("[ลองเลย] texts are only side-effect-free view commands", () => {
    const allowed = new Set(["แพลน", "ต่อไป", "จอง", "ร้าน", "ที่เที่ยว", "ข้อมูล", "โน้ต", "เดินทาง"]);
    for (const t of GUIDE_TOPICS) for (const x of t.tries) expect(allowed.has(x.text)).toBe(true);
  });
});

describe("buildGuideMessage", () => {
  it("null topic → a carousel: contents page + one bubble per topic", () => {
    const msg = buildGuideMessage(null);
    expect(msg.type).toBe("flex");
    const carousel = msg.contents as Node;
    expect(carousel.type).toBe("carousel");
    expect((carousel.contents as Node[]).length).toBe(8);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("the contents page jumps to each topic with menu_go postbacks", () => {
    const toc = ((buildGuideMessage(null).contents as Node).contents as Node[])[0];
    const acts = actions(toc);
    expect(acts.map((a) => [a.data.a, a.data.t, a.data.q])).toEqual(ids.map((id) => ["menu_go", "guide", id]));
    for (const a of acts) expect(a.label.length).toBeLessThanOrEqual(20);
  });

  it("a topic → one bubble with title, command rows, examples and a way back to the contents", () => {
    const msg = buildGuideMessage("plan");
    expect(msg.altText).toContain("แพลน");
    const bubble = msg.contents as Node;
    expect(bubble.type).toBe("bubble");
    const json = JSON.stringify(bubble);
    for (const c of GUIDE_TOPICS.find((t) => t.id === "plan")!.commands) expect(json).toContain(c.cmd);
    expect(actions(bubble).some((a) => a.data.a === "menu_go" && a.data.t === "guide" && a.data.q === undefined)).toBe(true);
  });

  it("the expense bubble has NO message action (a tap would save a real expense) but offers copy", () => {
    expect(messageActions(bubbleFor("expense"))).toEqual([]);
    expect(messageActions(buildGuideMessage(null))).not.toEqual([]); // other topics do have [ลองเลย]
    const copy = actions(bubbleFor("expense")).find((a) => a.type === "clipboard");
    expect(copy?.label).toBe("คัดลอกตัวอย่าง");
  });

  it("view-command topics have [ลองเลย] message buttons", () => {
    const sent = messageActions(bubbleFor("plan")).map((n) => n.text);
    expect(sent).toEqual(["แพลน", "ต่อไป"]);
    expect(messageActions(bubbleFor("transport")).map((n) => n.text)).toEqual(["เดินทาง"]);
    expect(messageActions(bubbleFor("other"))).toEqual([]);
  });

  it("is built from the topic data (every command and example appears in the carousel)", () => {
    const json = JSON.stringify(buildGuideMessage(null));
    for (const t of GUIDE_TOPICS) {
      for (const c of t.commands) expect(json).toContain(c.cmd);
      for (const x of t.examples) expect(json).toContain(x);
    }
    expect(findNode(buildGuideMessage(null), (n) => n.type === "text" && String(n.text).includes("คู่มือการใช้งาน"))).toBeDefined();
  });
});

describe("matchGuide", () => {
  it.each([
    ["คู่มือการใช้งาน", null],
    ["คู่มือ", null],
    ["ขอดูคู่มือ", null],
    ["  คู่มือ  ", null],
    ["คู่มือ ค่าใช้จ่าย", "expense"],
    ["คู่มือ แพลน", "plan"],
    ["คู่มือการใช้งาน แพลน", "plan"],
    ["คู่มือ plan", "plan"],
    ["คู่มือ จอง", "booking"],
    ["คู่มือ ตั๋ว", "booking"],
    ["คู่มือ เอกสาร", "booking"],
    ["คู่มือ ร้าน", "places"],
    ["คู่มือ ที่เที่ยว", "places"],
    ["คู่มือ ข้อมูล", "info"],
    ["คู่มือ โน้ต", "info"],
    ["คู่มือ เดินทาง", "transport"],
    ["คู่มือ อื่นๆ", "other"],
    ["คู่มือ เรื่องอะไรสักอย่าง", null],
  ])("%s", (text, topic) => {
    expect(matchGuide(text)).toEqual({ topic });
  });

  it("คู่มือ จอง and คู่มือ ตั๋ว are the same topic", () => {
    expect(matchGuide("คู่มือ จอง")).toEqual(matchGuide("คู่มือ ตั๋ว"));
  });

  it("returns null for everything that is not the guide command", () => {
    for (const t of ["แพลน", "เมนู", "120 ข้าว", "สวัสดี", "ตั๋วรถ 50", "ทำคู่มือ"]) expect(matchGuide(t)).toBeNull();
  });

  it("topicFromId only knows real topics", () => {
    expect(topicFromId("plan")).toBe("plan");
    expect(topicFromId("nope")).toBeNull();
    expect(topicFromId(undefined)).toBeNull();
  });
});

describe("keyword coverage: every command word the router knows is in the guide", () => {
  const lists = Object.entries(router).filter(([name]) => name.endsWith("_KEYWORDS")) as [string, readonly string[]][];

  it("finds the router's keyword lists (guards the dynamic lookup)", () => {
    expect(lists.length).toBeGreaterThanOrEqual(10);
  });

  it("appears in the guide at least once", () => {
    const text = JSON.stringify(buildGuideMessage(null));
    for (const [name, words] of [...lists, ["GUIDE_KEYWORDS", GUIDE_KEYWORDS] as [string, readonly string[]]]) {
      for (const w of words) expect({ name, w, found: text.includes(w) }).toEqual({ name, w, found: true });
    }
  });
});
