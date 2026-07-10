import { google } from "googleapis";
import http from "node:http";

const [clientId, clientSecret] = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET];
if (!clientId || !clientSecret) { console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first"); process.exit(1); }

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "http://localhost:8123/callback");
const url = oauth2.generateAuthUrl({
  access_type: "offline", prompt: "consent",
  scope: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"],
});
console.log("\nOpen this URL in your browser:\n\n" + url + "\n");

http.createServer(async (req, res) => {
  const code = new URL(req.url, "http://localhost:8123").searchParams.get("code");
  if (!code) return res.end("no code");
  const { tokens } = await oauth2.getToken(code);
  res.end("Done. Check your terminal.");
  console.log("\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
  process.exit(0);
}).listen(8123);
