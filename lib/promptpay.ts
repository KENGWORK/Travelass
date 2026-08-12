import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

// PromptPay IDs are typed freely (spaces/dashes, sometimes a leading 0
// dropped) -- strip everything but digits before handing it to the payload
// generator, which expects a bare phone/citizen-ID digit string.
export function normalizePromptPayId(raw: string): string {
  return raw.replace(/\D/g, "");
}

// PromptPay only recognizes 3 target shapes once normalized: a 10-digit
// mobile number, a 13-digit citizen/tax ID, or a 15-digit e-wallet ID. Not
// a guarantee the account exists or belongs to who you think -- just cheap
// enough to catch a dropped leading 0 or a fat-fingered digit before it
// ever reaches QR generation. The receiving bank app showing the verified
// account-holder name before a transfer is the real safety net.
export function isValidPromptPayId(raw: string): boolean {
  const digits = normalizePromptPayId(raw);
  return digits.length === 10 || digits.length === 13 || digits.length === 15;
}

// Renders a scannable PromptPay QR (as a data URL) for `amount` THB to
// `promptpayId`. Entirely client-side -- the payload never leaves the
// device before it's turned into an image.
export async function promptPayQrDataUrl(promptpayId: string, amount: number): Promise<string> {
  const payload = generatePayload(normalizePromptPayId(promptpayId), { amount });
  return QRCode.toDataURL(payload, { margin: 1, width: 320 });
}
