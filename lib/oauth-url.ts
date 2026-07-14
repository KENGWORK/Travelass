// access_type=offline + prompt=consent are both required to get a refresh
// token back on the first exchange (Google otherwise only returns one the
// very first time an app is ever authorized, which is easy to lose).
export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
