import "server-only";
import * as sheets from "@/lib/google/sheets";
import * as drive from "@/lib/google/drive";
import * as local from "./local";

// Preview / MVP mode: when no spreadsheet is configured, back the app with a
// local file store instead of Google Sheets/Drive, and skip the auth gate.
// Set SPREADSHEET_ID (+ the other Google env vars) to switch to real Google.
export const PREVIEW = !process.env.SPREADSHEET_ID;

export const listRows: typeof sheets.listRows = PREVIEW ? local.listRows : sheets.listRows;
export const appendRow: typeof sheets.appendRow = PREVIEW ? local.appendRow : sheets.appendRow;
export const updateRow: typeof sheets.updateRow = PREVIEW ? local.updateRow : sheets.updateRow;
export const deleteRow: typeof sheets.deleteRow = PREVIEW ? local.deleteRow : sheets.deleteRow;
export const ensureTabs: typeof sheets.ensureTabs = PREVIEW ? local.ensureTabs : sheets.ensureTabs;

export async function saveImage(
  buf: Buffer,
  mime: string,
  tripName: string,
  kind: "slips" | "photos",
  filename: string,
): Promise<string> {
  return PREVIEW ? local.saveImage(buf, mime) : drive.uploadImage(buf, mime, tripName, kind, filename);
}

export async function loadImage(id: string): Promise<{ body: Buffer | NodeJS.ReadableStream; mime: string }> {
  if (PREVIEW) {
    const { buf, mime } = await local.loadImage(id);
    return { body: buf, mime };
  }
  const { stream, mime } = await drive.getImageStream(id);
  return { body: stream, mime };
}
