import { describe, it, expect } from "vitest";
import { buildAuthUrl } from "./oauth-url";

describe("buildAuthUrl", () => {
  it("builds a Google OAuth consent URL with the Sheets+Drive scopes", () => {
    const url = buildAuthUrl("client-123", "http://localhost:3000/oauth-callback");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("client_id")).toBe("client-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/oauth-callback");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive"
    );
  });
});
