// Local-only display-order override for the "ข้อมูลด่วน" tab. Hotel-booking
// and pickup-transport cards are auto-derived from other entities (no
// sort_order field of their own, nothing sane to sync to Sheets for a pure
// view preference), so the combined order lives in localStorage per device.
function orderKey(tripId: string): string {
  return `travelass:quickinfo-order:${tripId}`;
}

export function getQuickInfoOrder(tripId: string): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(orderKey(tripId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setQuickInfoOrder(tripId: string, ids: string[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(orderKey(tripId), JSON.stringify(ids));
}
