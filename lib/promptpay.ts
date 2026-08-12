import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

// PromptPay IDs are typed freely (spaces/dashes, sometimes a leading 0
// dropped) -- strip everything but digits before handing it to the payload
// generator, which expects a bare phone/citizen-ID digit string.
export function normalizePromptPayId(raw: string): string {
  return raw.replace(/\D/g, "");
}

// Renders a scannable PromptPay QR (as a data URL) for `amount` THB to
// `promptpayId`. Entirely client-side -- the payload never leaves the
// device before it's turned into an image.
export async function promptPayQrDataUrl(promptpayId: string, amount: number): Promise<string> {
  const payload = generatePayload(normalizePromptPayId(promptpayId), { amount });
  return QRCode.toDataURL(payload, { margin: 1, width: 320 });
}
