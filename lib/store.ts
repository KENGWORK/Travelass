import "server-only";

import * as sheets from "@/lib/google/sheets";
import * as drive from "@/lib/google/drive";
import type { EntityName } from "@/lib/models/mappers";

// Local-only mode (no Google credentials configured) is the default for a
// fresh clone/deploy. Setting SPREADSHEET_ID switches these server routes
// live and re-enables the NextAuth login wall in middleware.ts.
export const PREVIEW = !process.env.SPREADSHEET_ID;

export const ensureTabs = (): Promise<void> => sheets.ensureTabs();

export const listRows = <T,>(entity: EntityName, tripId?: string): Promise<T[]> =>
  sheets.listRows<T>(entity, tripId);

export const appendRow = <T,>(entity: EntityName, obj: T): Promise<void> =>
  sheets.appendRow<T>(entity, obj);

export const updateRow = <T,>(entity: EntityName, id: string, obj: T): Promise<void> =>
  sheets.updateRow<T>(entity, id, obj);

export const deleteRow = (entity: EntityName, id: string): Promise<void> =>
  sheets.deleteRow(entity, id);

export const bulkUpsertRows = <T extends { id: string }>(entity: EntityName, rows: T[]): Promise<void> =>
  sheets.bulkUpsertRows<T>(entity, rows);

export const saveImage = (
  buf: Buffer,
  mime: string,
  tripName: string,
  kind: "slips" | "photos",
  filename: string
): Promise<string> => drive.uploadImage(buf, mime, tripName, kind, filename);

export const loadImage = async (
  fileId: string
): Promise<{ body: NodeJS.ReadableStream; mime: string }> => {
  const { stream, mime } = await drive.getImageStream(fileId);
  return { body: stream, mime };
};
