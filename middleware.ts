// No login gate — the app is used by one person/family with no need to
// restrict access, regardless of which storage backend (local or Google)
// is active. SPREADSHEET_ID only selects the backend now (see lib/store.ts),
// it no longer controls auth.
export const middleware = () => undefined;
export const config = { matcher: ["/((?!login|api/auth|_next|favicon.ico).*)"] };
