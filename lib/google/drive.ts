import { Readable } from "node:stream";
import { getDrive } from "./client";

const folderCache = new Map<string, string>();

async function ensureFolder(name: string, parentId: string): Promise<string> {
  const key = `${parentId}/${name}`;
  const hit = folderCache.get(key);
  if (hit) return hit;
  const drive = getDrive();
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await drive.files.list({ q, fields: "files(id)" });
  let id = found.data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name, parents: [parentId], mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
    });
    id = created.data.id!;
  }
  folderCache.set(key, id);
  return id;
}

export async function uploadImage(buf: Buffer, mime: string, tripName: string, kind: "slips" | "photos", filename: string): Promise<string> {
  const tripFolder = await ensureFolder(tripName, process.env.DRIVE_ROOT_FOLDER_ID!);
  const kindFolder = await ensureFolder(kind, tripFolder);
  const res = await getDrive().files.create({
    requestBody: { name: filename, parents: [kindFolder] },
    media: { mimeType: mime, body: Readable.from(buf) },
    fields: "id",
  });
  return res.data.id!;
}

export async function getImageStream(fileId: string): Promise<{ stream: NodeJS.ReadableStream; mime: string }> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "mimeType" });
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  return { stream: res.data as unknown as NodeJS.ReadableStream, mime: meta.data.mimeType ?? "image/jpeg" };
}
