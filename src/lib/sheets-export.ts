import { google } from "googleapis";
import { loadServiceAccountCredentials } from "@/lib/legacy-sync/sheets-client";

// Separate auth instance from legacy-sync's (readonly) one — this needs
// write access to create/populate a sheet, plus Drive access to set its
// sharing, using the same underlying service account credentials.
let auth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuth() {
  if (!auth) {
    auth = new google.auth.GoogleAuth({
      credentials: loadServiceAccountCredentials(),
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        // .file (not the full "drive" scope) is enough to set sharing on a
        // file, as long as the same service account created that file —
        // true here, since createPublicSheet always creates it first.
        "https://www.googleapis.com/auth/drive.file",
      ],
    });
  }
  return auth;
}

function getSharedDriveId(): string {
  const id = process.env.GOOGLE_SHARED_DRIVE_ID;
  if (!id) {
    throw new Error(
      "GOOGLE_SHARED_DRIVE_ID is not set. The service account has no Drive storage " +
        "quota of its own, so it can only own files inside a Shared Drive it's a member " +
        "of — create one, add vaa-kpi-ms@vaa-philippines.iam.gserviceaccount.com as a " +
        "Content Manager, and set its ID here (and in Vercel's Environment Variables).",
    );
  }
  return id;
}

/**
 * Creates a new Google Sheet inside the configured Shared Drive (the service
 * account has no personal Drive storage quota, so a Shared Drive — which
 * draws from pooled org storage — is the only place it can own a file),
 * writes `headers` + `rows` starting at A1, sets it link-shareable ("anyone
 * with the link can view"), and returns its edit URL. There is no
 * delete/cleanup path — each call leaves a new file behind in that drive.
 */
export async function createPublicSheet(
  title: string,
  headers: string[],
  rows: (string | number)[][],
): Promise<string> {
  const sharedDriveId = getSharedDriveId();
  const authClient = getAuth();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const drive = google.drive({ version: "v3", auth: authClient });

  // Created via the Drive API (not sheets.spreadsheets.create) so it can be
  // parented directly under the Shared Drive — Sheets' own create call has
  // no way to specify a parent/drive, and would otherwise try (and fail) to
  // land the file in the service account's own zero-quota My Drive.
  const created = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [sharedDriveId],
    },
    supportsAllDrives: true,
    fields: "id",
  });
  const spreadsheetId = created.data.id;
  if (!spreadsheetId) throw new Error("Google Drive did not return a file ID.");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1",
    valueInputOption: "RAW",
    requestBody: { values: [headers, ...rows] },
  });

  await drive.permissions.create({
    fileId: spreadsheetId,
    supportsAllDrives: true,
    requestBody: { role: "reader", type: "anyone" },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
