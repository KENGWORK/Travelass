// A photo id is either a local data: URL (client-side MVP mode) or an
// opaque Google Drive file id (Google-backend mode). Callers never need to
// know which — this picks the right rendering strategy from the id's shape.
export function photoUrl(id: string): string {
  if (id.startsWith("data:")) return id;
  return `/api/img/${encodeURIComponent(id)}`;
}
