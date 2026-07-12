import { auth } from "@/auth";

// Preview / MVP mode: with no SPREADSHEET_ID configured, skip the auth gate so
// the app is usable without Google credentials. Set SPREADSHEET_ID to restore
// the login requirement automatically.
const PREVIEW = !process.env.SPREADSHEET_ID;

export const middleware = PREVIEW ? () => undefined : auth;
export const config = { matcher: ["/((?!login|api/auth|_next|favicon.ico).*)"] };
