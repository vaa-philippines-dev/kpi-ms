import { randomBytes } from "crypto";

/**
 * CSC_ + 12 uppercase hex chars — same shape as the CMS's own IDs
 * (CONN_/CUST_). The CMS has no ID for a CS <-> client pairing, so KPI
 * generates one per CsClientAssignment row.
 */
export function randomAssignmentCode(): string {
  return `CSC_${randomBytes(6).toString("hex").toUpperCase()}`;
}
