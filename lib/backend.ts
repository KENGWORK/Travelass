// Single switch between the two storage modes. NEXT_PUBLIC_ so client
// components (lib/api.ts, PhotoPicker) can read it directly without a
// server round-trip. Unset or unrecognized -> local (fail safe).
export function isGoogleBackend(): boolean {
  return process.env.NEXT_PUBLIC_BACKEND === "google";
}
