import { uriAction, type FlexNode } from "@/lib/line-flex";

// Map buttons for LINE cards. Google Maps doesn't work inside mainland
// China, so every place also gets an Amap (高德) button. Pure.

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// No origin on purpose: Google Maps then routes from the phone's current location.
export function googleDirUrl(destination: string, travelmode: "transit" | "driving" | "walking"): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${travelmode}`;
}

export function amapSearchUrl(query: string): string {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(query)}`;
}

export function toTravelMode(mode: string): "transit" | "driving" | "walking" {
  const m = mode.toLowerCase();
  if (/เดิน|walk/.test(m)) return "walking";
  if (/แท็กซี่|taxi|รถยนต์|ขับ|car|drive|uber|grab|didi/.test(m)) return "driving";
  return "transit";
}

function mapButton(label: string, uri: string): FlexNode {
  return { type: "button", style: "secondary", height: "sm", action: uriAction(label, uri) };
}

export function mapButtons(p: { query: string; mapsLink?: string; directions?: { mode: string } }): FlexNode[] {
  const query = p.query.trim();
  const link = (p.mapsLink ?? "").trim();
  if (!query && !link) return [];
  const googleUri = link || (p.directions ? googleDirUrl(query, toTravelMode(p.directions.mode)) : googleSearchUrl(query));
  const buttons = [mapButton(p.directions ? "Google Maps นำทาง" : "Google Maps", googleUri)];
  if (query) buttons.push(mapButton("高德 Amap", amapSearchUrl(query)));
  return buttons;
}
