import { google } from "googleapis";

const LEGACY_SHEET_ID = "1uAr7WKpgtbmLz02ZOtC3uM487l8QvERQqE7-OSQEeQ0";

// The real Customer Management System's sheet — separate spreadsheet, same
// service account (shared with Viewer access), used by src/lib/cms-sync.
const CMS_SHEET_ID = "1Kar3bK16OdVYcIjpXRC_ty85P9b55m97SU9YkxW4lSo";

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

function loadServiceAccountCredentials() {
  const b64 = process.env.LEGACY_SERVICE_ACCOUNT_JSON_B64;
  if (!b64) {
    throw new Error(
      "LEGACY_SERVICE_ACCOUNT_JSON_B64 is not set. Base64-encode secrets/legacy-service-account.json and set it as an env var (locally in .env, and in the Vercel project's Environment Variables) instead of relying on the file being present on disk.",
    );
  }
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: loadServiceAccountCredentials(),
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
async function readSheet(spreadsheetId: string, tabName: string): Promise<Record<string, string>[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
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

export async function readLegacySheet(tabName: string): Promise<Record<string, string>[]> {
  return readSheet(LEGACY_SHEET_ID, tabName);
}

export async function readCmsSheet(tabName: string): Promise<Record<string, string>[]> {
  return readSheet(CMS_SHEET_ID, tabName);
}
