// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google/sheets", () => ({
  ensureTabs: vi.fn().mockResolvedValue(undefined),
  listRows: vi.fn().mockResolvedValue([{ id: "a" }]),
  appendRow: vi.fn().mockResolvedValue(undefined),
  updateRow: vi.fn().mockResolvedValue(undefined),
  deleteRow: vi.fn().mockResolvedValue(undefined),
  bulkUpsertRows: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/google/drive", () => ({
  uploadImage: vi.fn().mockResolvedValue("drive-file-id-123"),
  getImageStream: vi.fn().mockResolvedValue({ stream: "fake-stream", mime: "image/jpeg" }),
}));

describe("lib/store", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SPREADSHEET_ID;
  });

  it("PREVIEW is true when SPREADSHEET_ID is unset", async () => {
    const { PREVIEW } = await import("./store");
    expect(PREVIEW).toBe(true);
  });

  it("PREVIEW is false when SPREADSHEET_ID is set", async () => {
    process.env.SPREADSHEET_ID = "sheet-123";
    const { PREVIEW } = await import("./store");
    expect(PREVIEW).toBe(false);
  });

  it("listRows delegates to google/sheets.listRows with the same args", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { listRows } = await import("./store");
    const result = await listRows("trips", "t1");
    expect(sheets.listRows).toHaveBeenCalledWith("trips", "t1");
    expect(result).toEqual([{ id: "a" }]);
  });

  it("appendRow delegates to google/sheets.appendRow", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { appendRow } = await import("./store");
    await appendRow("trips", { id: "a" });
    expect(sheets.appendRow).toHaveBeenCalledWith("trips", { id: "a" });
  });

  it("updateRow delegates to google/sheets.updateRow", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { updateRow } = await import("./store");
    await updateRow("trips", "a", { id: "a", name: "x" });
    expect(sheets.updateRow).toHaveBeenCalledWith("trips", "a", { id: "a", name: "x" });
  });

  it("deleteRow delegates to google/sheets.deleteRow", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { deleteRow } = await import("./store");
    await deleteRow("trips", "a");
    expect(sheets.deleteRow).toHaveBeenCalledWith("trips", "a");
  });

  it("bulkUpsertRows delegates to google/sheets.bulkUpsertRows", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { bulkUpsertRows } = await import("./store");
    const rows = [{ id: "a" }, { id: "b" }];
    await bulkUpsertRows("expenses", rows);
    expect(sheets.bulkUpsertRows).toHaveBeenCalledWith("expenses", rows);
  });

  it("ensureTabs delegates to google/sheets.ensureTabs", async () => {
    const sheets = await import("@/lib/google/sheets");
    const { ensureTabs } = await import("./store");
    await ensureTabs();
    expect(sheets.ensureTabs).toHaveBeenCalled();
  });

  it("saveImage delegates to google/drive.uploadImage and returns its fileId", async () => {
    const drive = await import("@/lib/google/drive");
    const { saveImage } = await import("./store");
    const buf = Buffer.from("fake");
    const id = await saveImage(buf, "image/jpeg", "Tokyo Trip", "slips", "receipt.jpg");
    expect(drive.uploadImage).toHaveBeenCalledWith(buf, "image/jpeg", "Tokyo Trip", "slips", "receipt.jpg");
    expect(id).toBe("drive-file-id-123");
  });

  it("loadImage delegates to google/drive.getImageStream and returns {body, mime}", async () => {
    const drive = await import("@/lib/google/drive");
    const { loadImage } = await import("./store");
    const result = await loadImage("drive-file-id-123");
    expect(drive.getImageStream).toHaveBeenCalledWith("drive-file-id-123");
    expect(result).toEqual({ body: "fake-stream", mime: "image/jpeg" });
  });
});
