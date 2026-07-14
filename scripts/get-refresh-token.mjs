// One-time script: run this yourself after creating the OAuth client in
// Google Cloud Console (Task list in the plan's Part B). Prints a URL to
// open, then exchanges the code you paste back for a refresh token.
//
// Usage: node scripts/get-refresh-token.mjs <client_id> <client_secret>

import { google } from "googleapis";
import readline from "node:readline/promises";

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error("Usage: node scripts/get-refresh-token.mjs <client_id> <client_secret>");
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:3000/oauth-callback";
const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

console.log("\n1. Open this URL in a browser signed into the Google account you want the app to use:\n");
console.log(authUrl);
console.log("\n2. After approving, you'll land on a page that fails to load (that's expected —");
console.log("   nothing is listening on localhost:3000 right now). Copy the \"code\" value out of");
console.log("   that browser's address bar (the part after code= and before &scope=).\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = await rl.question("Paste the code here: ");
rl.close();

const { tokens } = await oauth2Client.getToken(code.trim());
if (!tokens.refresh_token) {
  console.error("\nNo refresh_token in the response. This usually means the Google account already");
  console.error("authorized this OAuth client before. Go to https://myaccount.google.com/permissions,");
  console.error("remove this app's access, and run this script again.");
  process.exit(1);
}

console.log("\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
console.log("\nAdd that line to .env.local (and to the same variable in Vercel's project settings).");
