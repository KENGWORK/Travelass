export const SUPPORTED_CURRENCIES = ["THB", "JPY", "USD", "EUR", "KRW", "CNY", "SGD", "GBP", "AUD", "TWD", "HKD", "VND", "MYR"];

export function convertToTHB(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

const TTL = 12 * 60 * 60 * 1000;
const cache = new Map<string, { rate: number; at: number }>();
export function _clearCache() { cache.clear(); }

export async function fetchRate(from: string): Promise<number> {
  if (from === "THB") return 1;
  const hit = cache.get(from);
  if (hit && Date.now() - hit.at < TTL) return hit.rate;
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=THB`);
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
  const data = (await res.json()) as { rates: { THB: number } };
  cache.set(from, { rate: data.rates.THB, at: Date.now() });
  return data.rates.THB;
}
