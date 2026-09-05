import { fileToDataUrl, fileToUploadBlob } from "@/lib/image";
import { isGoogleConfigured } from "@/lib/backend";

// Shared by every photo-taking entry point (PhotoPicker, the FAB's slip
// capture) so there's one place that decides Google Drive upload vs. local
// data-URL fallback.
export async function uploadPhoto(file: File, tripName: string, kind: "photos" | "slips"): Promise<string> {
  if (!isGoogleConfigured()) return fileToDataUrl(file);

  // Vercel caps request bodies at 4.5MB — raw camera photos blow past that
  // and fail with no useful error, so always downscale before sending.
  const blob = await fileToUploadBlob(file);
  const form = new FormData();
  form.append("file", blob, file.name);
  form.append("tripName", tripName);
  form.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const { fileId } = await res.json();
  return fileId as string;
}
