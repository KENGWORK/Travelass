import { describe, it, expect } from "vitest";
import {
  buildQuickInfoList, buildQuickInfoDetail, buildBigText, buildQuickInfoReply,
  buildNoteList, buildNoteDetail, buildNoteFullText, buildNotesReply,
} from "./line-info-messages";
import { allText, texts, actionsOf, postbacksOf, hasEmptyText, mkQuickInfo, mkNote, mkTrip } from "./line-view.test-helpers";
import { imageUrl } from "./line-flex";

const ORIGIN = "https://app.test";
const phone = mkQuickInfo({ id: "q1", label: "ฉุกเฉิน", value: "999", pinned: true });
const url = mkQuickInfo({ id: "q2", label: "เว็บ MTR", value: "https://mtr.com.hk", sort_order: 1 });
const addr = mkQuickInfo({ id: "q3", label: "ที่อยู่โรงแรม", value: "17 Science Museum Rd", sort_order: 2, photo_ids: ["p1", "p2"] });
const plain = mkQuickInfo({ id: "q4", label: "wifi", value: "pass: abc12345", sort_order: 3 });

describe("buildQuickInfoList", () => {
  const msg = buildQuickInfoList({ rows: [phone, url, addr, plain], query: "", page: 1 });

  it("header with count; rows with pin/photo markers and 2-line values", () => {
    const text = allText(msg);
    expect(text).toContain("ℹ️ ข้อมูลด่วน · 4");
    expect(text).toContain("📌 ฉุกเฉิน");
    expect(text).toContain("ที่อยู่โรงแรม 📷");
    expect(JSON.stringify(msg)).toContain('"maxLines":2');
  });

  it("row buttons follow the value kind; rows open the detail", () => {
    const acts = actionsOf(msg);
    expect(acts.some((a) => a.type === "uri" && a.uri === "tel:999")).toBe(true);
    expect(acts.some((a) => a.type === "uri" && a.uri === "https://mtr.com.hk")).toBe(true);
    expect(acts.filter((a) => a.type === "clipboard").map((a) => a.clipboardText)).toEqual(["17 Science Museum Rd", "pass: abc12345"]);
    expect(postbacksOf(msg).filter((p) => p.a === "qi_detail").map((p) => p.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("shows the active query and pages after 15", () => {
    const rows = Array.from({ length: 16 }, (_, i) => mkQuickInfo({ id: `x${i}`, label: `L${i}`, value: "v" }));
    const m = buildQuickInfoList({ rows, query: "v", page: 1 });
    expect(allText(m)).toContain('กรอง "v"');
    expect(postbacksOf(m)).toContainEqual({ a: "qi_list", q: "v", n: "2" });
  });
});

describe("buildQuickInfoDetail", () => {
  it("returns the card followed by the plain value text", () => {
    const msgs = buildQuickInfoDetail({ origin: ORIGIN, row: phone });
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({ type: "text", text: "999" });
    const acts = actionsOf(msgs[0]);
    expect(acts.some((a) => a.type === "clipboard" && a.clipboardText === "999")).toBe(true);
    expect(acts.some((a) => a.uri === "tel:999")).toBe(true);
    expect(postbacksOf(msgs[0])).toContainEqual({ a: "qi_big", id: "q1" });
    expect(allText(msgs[0])).toContain("📌 ฉุกเฉิน");
  });

  it("address → maps buttons; >1 photo → photos button; hero opens the photo", () => {
    const [card] = buildQuickInfoDetail({ origin: ORIGIN, row: addr });
    const acts = actionsOf(card);
    expect(acts.some((a) => a.type === "uri" && String(a.uri).includes("amap"))).toBe(true);
    expect(acts.some((a) => a.type === "uri" && a.uri === imageUrl(ORIGIN, "p1"))).toBe(true);
    expect(postbacksOf(card)).toContainEqual({ a: "qi_photos", id: "q3" });
    expect(hasEmptyText(card)).toBe(false);
  });

  it("single photo → no photos button", () => {
    const [card] = buildQuickInfoDetail({ origin: ORIGIN, row: { ...plain, photo_ids: ["p9"] } });
    expect(postbacksOf(card).some((p) => p.a === "qi_photos")).toBe(false);
  });
});

describe("buildBigText", () => {
  it("giga bubble, size by length, no buttons, no label", () => {
    const msg = buildBigText("彌敦道 123號") as { contents: Record<string, unknown> };
    expect(msg.contents.size).toBe("giga");
    expect(JSON.stringify(msg)).toContain('"size":"5xl"');
    expect(actionsOf(msg)).toHaveLength(0);
    expect(JSON.stringify(buildBigText("x".repeat(70)))).toContain('"size":"3xl"');
  });
});

describe("buildQuickInfoReply", () => {
  const base = { trip: mkTrip(), origin: ORIGIN, page: 1 };
  it("empty → empty state linking to the quickinfo tab", () => {
    const [msg] = buildQuickInfoReply({ ...base, rows: [], query: "", autoDetail: true });
    expect(allText(msg)).toContain("ยังไม่มีข้อมูลด่วนในทริปนี้");
    expect(actionsOf(msg).some((a) => a.uri === "https://app.test/trips/t1/info?tab=quickinfo")).toBe(true);
  });
  it("no match → 'ไม่เจอ' + quick replies of existing labels (sorted)", () => {
    const [msg] = buildQuickInfoReply({ ...base, rows: [plain, phone], query: "zzz", autoDetail: true });
    expect(allText(msg)).toContain("ไม่เจอ 'zzz'");
    expect(postbacksOf(msg)).toEqual([{ a: "qi_detail", id: "q1" }, { a: "qi_detail", id: "q4" }]);
  });
  it("one match from a command → detail (card + text)", () => {
    expect(buildQuickInfoReply({ ...base, rows: [plain, phone], query: "wifi", autoDetail: true })).toHaveLength(2);
  });
  it("several → list, pinned first", () => {
    const [msg] = buildQuickInfoReply({ ...base, rows: [plain, phone], query: "", autoDetail: true });
    const t = allText(msg);
    expect(t.indexOf("ฉุกเฉิน")).toBeLessThan(t.indexOf("wifi"));
  });
});

describe("notes", () => {
  const visa = mkNote({ id: "n1", title: "วีซ่า", content: "ไทยไม่ต้องใช้วีซ่า\nอยู่ได้ 30 วัน", sort_order: 1 });
  const gifts = mkNote({ id: "n2", title: "", content: "ของฝาก\nขนมไข่", photo_ids: ["p1"], sort_order: 0 });
  const long = mkNote({ id: "n3", title: "ยาว", content: Array.from({ length: 20 }, (_, i) => `บรรทัด ${i}`).join("\n") });

  it("list: title (fallback to first line), preview, 📷 or ›, rows open detail", () => {
    const msg = buildNoteList({ rows: [gifts, visa], query: "", page: 1 });
    const t = allText(msg);
    expect(t).toContain("📒 โน้ต · 2");
    expect(t).toContain("ของฝาก");
    expect(t).toContain("ขนมไข่");
    expect(t).toContain("ไทยไม่ต้องใช้วีซ่า");
    expect(t).toContain("📷");
    expect(t).toContain("›");
    expect(postbacksOf(msg).map((p) => p.id)).toEqual(["n2", "n1"]);
    expect(hasEmptyText(msg)).toBe(false);
  });

  it("detail: short note has no read-full button; back goes to the list", () => {
    const msg = buildNoteDetail({ origin: ORIGIN, note: visa });
    expect(postbacksOf(msg).some((p) => p.a === "qn_full")).toBe(false);
    expect(postbacksOf(msg)).toContainEqual({ a: "qn_list" });
    expect(JSON.stringify(msg)).toContain('"maxLines":12');
  });

  it("detail: long note has read-full; photo note has hero + photos button", () => {
    expect(postbacksOf(buildNoteDetail({ origin: ORIGIN, note: long }))).toContainEqual({ a: "qn_full", id: "n3" });
    const withPhoto = buildNoteDetail({ origin: ORIGIN, note: gifts }) as { contents: Record<string, unknown> };
    expect(withPhoto.contents.hero).toBeDefined();
    expect(postbacksOf(withPhoto)).toContainEqual({ a: "qn_photos", id: "n2" });
  });

  it("detail: empty title uses the first line once (not repeated in the body)", () => {
    const nodes = texts(buildNoteDetail({ origin: ORIGIN, note: gifts }));
    expect(nodes.filter((t) => t.includes("ของฝาก"))).toEqual(["ของฝาก"]);
    expect(nodes).toContain("ขนมไข่");
  });

  it("detail: back button keeps the search query; list rows carry it", () => {
    expect(postbacksOf(buildNoteDetail({ origin: ORIGIN, note: visa, query: "วีซ่า" }))).toContainEqual({ a: "qn_list", q: "วีซ่า" });
    expect(postbacksOf(buildNoteList({ rows: [visa], query: "วีซ่า", page: 1 }))).toContainEqual({ a: "qn_detail", id: "n1", q: "วีซ่า" });
  });

  it("full text: splits and appends the app link when truncated", () => {
    const huge = mkNote({ id: "n9", content: "x".repeat(4800 * 6) });
    const msgs = buildNoteFullText(huge, "https://app.test/trips/t1/info?tab=quicknotes");
    expect(msgs).toHaveLength(5);
    expect(String((msgs[4] as { text: string }).text)).toContain("…ยังมีต่อ อ่านในแอป https://app.test/trips/t1/info?tab=quicknotes");
    expect(buildNoteFullText(visa, "x")).toEqual([expect.objectContaining({ type: "text", text: visa.content })]);
    expect(buildNoteFullText(mkNote(), "x")).toEqual([expect.objectContaining({ text: "โน้ตนี้ไม่มีเนื้อหา" })]);
  });

  it("reply: empty / not found / single / list", () => {
    const base = { trip: mkTrip(), origin: ORIGIN, page: 1 };
    expect(allText(buildNotesReply({ ...base, rows: [], query: "", autoDetail: true }))).toContain("ยังไม่มีโน้ตในทริปนี้");
    const [nf] = buildNotesReply({ ...base, rows: [visa, gifts], query: "zzz", autoDetail: true });
    expect(postbacksOf(nf)).toEqual([{ a: "qn_detail", id: "n2" }, { a: "qn_detail", id: "n1" }]);
    const [single] = buildNotesReply({ ...base, rows: [visa, gifts], query: "วีซ่า", autoDetail: true });
    expect(postbacksOf(single)).toContainEqual({ a: "qn_list", q: "วีซ่า" });
    const [list] = buildNotesReply({ ...base, rows: [visa, gifts], query: "", autoDetail: true });
    expect(allText(list)).toContain("📒 โน้ต · 2");
  });
});
