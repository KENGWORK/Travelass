// Whether a Google Sheets/Drive sync target is configured. NEXT_PUBLIC_ so
// client components (lib/api.ts, PhotoPicker) can read it directly without a
// server round-trip. Unset or unrecognized -> false (fail safe — local
// storage is always the real store regardless; this only gates whether a
// background sync to Sheets/Drive also happens).
export function isGoogleConfigured(): boolean {
  return process.env.NEXT_PUBLIC_BACKEND === "google";
}
