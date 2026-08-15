import { google } from "googleapis";
import path from "path";

const LEGACY_SHEET_ID = "1uAr7WKpgtbmLz02ZOtC3uM487l8QvERQqE7-OSQEeQ0";
const KEY_PATH = path.join(process.cwd(), "secrets", "legacy-service-account.json");

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

/**
 * Reads a legacy tab as an array of {header: value} objects, keyed by the
 * header row's column names. Values past the last header column (the
 * unlabeled lookup/formula columns the legacy analysis flagged as schema
 * drift) are silently ignored, since Sheets' values.get returns each row
 * only as wide as its own last populated cell — not padded to a shared
 * width — so trailing extra cells past the headers are never misaligned
 * into a real field.
 */
export async function readLegacySheet(tabName: string): Promise<Record<string, string>[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: LEGACY_SHEET_ID,
    range: tabName,
  });
  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i] ?? "";
    });
    return obj;
  });
}
