export function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

export function decodeDataUrl(value: string): { buf: Buffer; mime: string } {
  const match = value.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!match) throw new Error("not a base64 data URL");
  const [, mime, b64] = match;
  return { buf: Buffer.from(b64, "base64"), mime };
}
