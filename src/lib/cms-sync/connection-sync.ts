import { prisma } from "@/lib/prisma";
import { readCmsSheet } from "@/lib/legacy-sync/sheets-client";
import { mapWithConcurrency } from "@/lib/legacy-sync/concurrency";
import { dateOrNull } from "@/lib/legacy-sync/dates";
import { ConnectionStatus, ConnectionType, UserRole } from "@/generated/prisma/enums";

export type PhaseResult = { created: number; updated: number; skipped: number; errors: string[] };
export type SyncReport = Record<string, PhaseResult>;

function emptyResult(): PhaseResult {
  return { created: 0, updated: 0, skipped: 0, errors: [] };
}

// The CMS's VirtualAssistants.Department values, confirmed by a live sheet
// dump to match our Department.name exactly (case-sensitive) — the other
// value seen there ("VAA", an internal/admin bucket) and blanks are not
// department scope for KPI-MS and are skipped.
const KNOWN_DEPARTMENTS = new Set([
  "Social Media",
  "PPC",
  "Amazon",
  "Wholesale",
  "Creatives",
  "Executive Assistant",
  "Walmart",
]);

/**
 * Maps the CMS's VAConnections.ConnectionStatus onto our ConnectionStatus.
 * Confirmed with the user:
 *  - "Cancelled" / "Declined" / "Accepted" (and blank) are VA-request-
 *    workflow outcomes, not established connections — excluded (null).
 *  - Ended/historical connections are excluded entirely, not imported as
 *    INACTIVE — the user only wants live connections (Active, plus Pending
 *    and Paused, which aren't "history," just not-yet-started or
 *    temporarily halted) out of this sync, not the CMS's full historical
 *    archive. This covers "Terminated", and "Started" rows that also carry
 *    a TerminationDate (a CMS data-entry lag, not a real active connection).
 */
function mapCmsStatus(row: Record<string, string>): ConnectionStatus | null {
  const raw = (row.ConnectionStatus ?? "").trim();
  const hasTerminationDate = Boolean((row.TerminationDate ?? "").trim());
  switch (raw) {
    case "Cancelled":
    case "Declined":
    case "Accepted":
    case "Terminated":
    case "":
      return null;
    case "Paused":
      return ConnectionStatus.PAUSED;
    case "Pending":
      return ConnectionStatus.PENDING;
    case "Active":
      return ConnectionStatus.ACTIVE;
    case "Started":
      return hasTerminationDate ? null : ConnectionStatus.ACTIVE;
    default:
      return null;
  }
}

const pairKey = (vaUserId: string, clientName: string) =>
  `${vaUserId}::${clientName.trim().toLowerCase()}`;

/**
 * Imports new VA↔client connections from the real CMS (Customer Management
 * System) Google Sheet's VAConnections tab — see src/lib/legacy-sync's
 * reference-sync.ts for the older, separate legacy-KPI-sheet sync this
 * complements (different source, different ID space: externalWfmId there
 * vs externalCmsId here).
 *
 * By explicit decision this sync is CREATE-ONLY: it never updates an
 * existing Connection's fields, even if the CMS's data differs from what's
 * already recorded — Connections stay admin-managed once they exist here.
 * It only adds rows that look genuinely new, using two dedup checks:
 *   1. externalCmsId already recorded (this exact CMS row was synced before).
 *   2. Same VA + same client name already exists on ANY Connection (incl.
 *      ones from the older legacy-sheet sync) — CMS's ConnectionID and our
 *      externalWfmId are unrelated ID spaces, so without this a first run
 *      would create a near-duplicate for every connection that already
 *      exists here under the old sync.
 * Both checks (and the missing-VA-user create) are done as an in-memory
 * Set/Map check-then-add with no `await` between them, so concurrent rows
 * in the same run can't race past each other into duplicate creates.
 */
export async function runCmsConnectionSync(
  triggeredByUserId: string,
  onProgress?: (phase: string, done: number, total: number) => void,
): Promise<SyncReport> {
  const report: SyncReport = {};
  void triggeredByUserId;

  const [vaRows, connRows, departments, existingVaUsers, allUserEmails, existingConnections] = await Promise.all([
    readCmsSheet("VirtualAssistants"),
    readCmsSheet("VAConnections"),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: UserRole.VA }, select: { id: true, email: true } }),
    prisma.user.findMany({ select: { email: true } }),
    prisma.connection.findMany({
      select: { externalCmsId: true, shortCode: true, vaUserId: true, clientName: true },
    }),
  ]);

  const deptIdByName = new Map(departments.map((d) => [d.name, d.id]));
  // Only VA-role users resolve to a usable vaUserId for Connections — a CMS
  // "VA" row whose email actually belongs to an existing non-VA account
  // (a handful turned out to be DM/OM/Admin mailboxes, e.g.
  // system-admin@vaaphilippines.com) is never linked as a connection's VA;
  // its Connections are simply skipped, same as any other unresolvable row.
  const userIdByEmail = new Map(
    existingVaUsers.map((u) => [u.email.trim().toLowerCase(), u.id]),
  );
  // ALL existing emails (any role) — checked before creating a new VA user,
  // since User.email is unique account-wide, not just within role VA.
  const emailsInUse = new Set(allUserEmails.map((u) => u.email.trim().toLowerCase()));
  const vaById = new Map(vaRows.map((r) => [r.VAID, r]));

  const existingCmsIds = new Set(
    existingConnections.map((c) => c.externalCmsId).filter((v): v is string => Boolean(v)),
  );
  const existingShortCodes = new Set(existingConnections.map((c) => c.shortCode));
  const existingPairs = new Set(
    existingConnections.map((c) => pairKey(c.vaUserId, c.clientName)),
  );

  // --- Create any CMS VA not yet a User here (create-only: never updates
  // an existing User, e.g. one whose department/name has since diverged) ---
  const vaResult = emptyResult();
  await mapWithConcurrency(vaRows, 10, async (row) => {
    const email = (row.Email ?? "").trim().toLowerCase();
    const departmentId = deptIdByName.get((row.Department ?? "").trim());
    if (!email || emailsInUse.has(email) || !departmentId) {
      vaResult.skipped++;
      return;
    }
    // Synchronous check-then-reserve (no await before this point in the
    // branch) so two concurrent rows for the same new VA can't both pass
    // the `has()` check above and double-create.
    emailsInUse.add(email);
    try {
      const user = await prisma.user.create({
        data: {
          email,
          name: row.VAName || null,
          role: UserRole.VA,
          departmentId,
          isActive: (row.Status ?? "").trim().toUpperCase() !== "INACTIVE",
        },
      });
      userIdByEmail.set(email, user.id);
      vaResult.created++;
    } catch (e) {
      emailsInUse.delete(email);
      vaResult.errors.push(`${row.VAID} (${email}): ${(e as Error).message}`);
    }
  }, (done, total) => onProgress?.("cms-virtual-assistants", done, total));
  report["virtual-assistants"] = vaResult;

  // --- Create genuinely-new Connections from VAConnections ---
  const connResult = emptyResult();
  await mapWithConcurrency(connRows, 8, async (row) => {
    try {
      const connectionId = row.ConnectionID;
      const clientName = (row.CustomerName ?? "").trim();
      if (!connectionId || !clientName) {
        connResult.skipped++;
        return;
      }
      if (existingCmsIds.has(connectionId)) {
        connResult.skipped++;
        return;
      }
      const status = mapCmsStatus(row);
      if (status === null) {
        connResult.skipped++;
        return;
      }
      const va = vaById.get(row.VAID ?? "");
      const vaEmail = (va?.Email ?? "").trim().toLowerCase();
      const vaUserId = vaEmail ? userIdByEmail.get(vaEmail) : undefined;
      if (!va || !vaUserId) {
        connResult.skipped++;
        return;
      }
      const departmentId = KNOWN_DEPARTMENTS.has((va.Department ?? "").trim())
        ? deptIdByName.get(va.Department.trim())
        : undefined;
      if (!departmentId) {
        connResult.skipped++;
        return;
      }

      const pk = pairKey(vaUserId, clientName);
      if (existingPairs.has(pk)) {
        connResult.skipped++;
        return;
      }
      const shortCode = connectionId;
      if (existingShortCodes.has(shortCode)) {
        connResult.skipped++;
        return;
      }
      // Reserve both keys synchronously before the create's await, so a
      // concurrent duplicate row in this same batch is skipped instead of
      // racing into a unique-constraint error.
      existingPairs.add(pk);
      existingShortCodes.add(shortCode);
      existingCmsIds.add(connectionId);

      const startDate = dateOrNull(row.ActualStartDate) ?? dateOrNull(row.VAConnectionDate);
      const connectionType =
        row.ConnectionType === "Project-based" ? ConnectionType.PROJECT_BASED : ConnectionType.REGULAR;

      await prisma.connection.create({
        data: {
          externalCmsId: connectionId,
          shortCode,
          vaUserId,
          clientName,
          departmentId,
          status,
          startDate,
          connectionType,
          notes: row.Notes || null,
        },
      });
      connResult.created++;
    } catch (e) {
      connResult.errors.push(`${row.ConnectionID}: ${(e as Error).message}`);
    }
  }, (done, total) => onProgress?.("cms-connections", done, total));
  report.connections = connResult;

  return report;
}
