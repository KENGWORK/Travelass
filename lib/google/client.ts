import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

let auth: OAuth2Client | null = null;

export function getAuth(): OAuth2Client {
  if (!auth) {
    auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return auth;
}

export const getSheets = () => google.sheets({ version: "v4", auth: getAuth() });
export const getDrive = () => google.drive({ version: "v3", auth: getAuth() });
