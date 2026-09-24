import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { readCmsSheet } from "@/lib/legacy-sync/sheets-client";
import { mapWithConcurrency } from "@/lib/legacy-sync/concurrency";
import { ConnectionStatus, CustomerStatus, UserRole } from "@/generated/prisma/enums";
import type { PhaseResult, SyncReport } from "./connection-sync";

function emptyResult(): PhaseResult {
  return { created: 0, updated: 0, skipped: 0, errors: [] };
}

// CMS Users.Role values imported as CS_SPECIALIST. CS Managers are included
// by the user's explicit decision (2026-09-24) — several of them carry their
// own client book as Customers.AssignedSpecialist, the same as a Specialist.
const CS_ROLES = new Set(["CS Specialist", "CS Manager"]);
const COMPANY_DOMAIN = "@vaaphilippines.com";

// A connection in any of these keeps its client ACTIVE on the KPI side —
// same "live" set the CMS connection sync imports (Active/Pending/Paused).
const LIVE_STATUSES = new Set<ConnectionStatus>([
  ConnectionStatus.ACTIVE,
  ConnectionStatus.PAUSED,
  ConnectionStatus.PENDING,
]);

const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** CSC_ + 12 uppercase hex chars — same shape as the CMS's own IDs (CONN_/CUST_). */
function randomAssignmentCode(): string {
  return `CSC_${randomBytes(6).toString("hex").toUpperCase()}`;
}

/**
 * Imports CS Specialists from the CMS and links each one to their clients
 * (and, through the client, to every VA connection under that client):
 *
 *  1. Users tab → User(role CS_SPECIALIST). Creates new accounts and keeps
 *     name/isActive current on existing CS_SPECIALIST accounts; an email
 *     that already belongs to a non-CS KPI account is never re-roled, just
 *     reported. Non-company (e.g. gmail) addresses are skipped, since they
 *     can't sign in anyway.
 *  2. Customers tab → Customer, and Connection.customerId: via the KPI
 *     connection's externalCmsId → VAConnections.CustomerID, falling back to
 *     a client-name match only when exactly one CMS customer has that name.
 *     Only Connection.customerId is ever written — no other connection field.
 *  3. Customer.status is derived from the KPI's own connection statuses,
 *     never copied from the CMS — a client the CMS still lists as Active but
 *     whose KPI connections have all ended is set INACTIVE here.
 *  4. Customers.AssignedSpecialist → CsClientAssignment (generated CSC_ code,
 *     since the CMS has no ID for this pairing). A CMS reassignment
 *     deactivates the previous row instead of deleting it.
 *
 * Safe to re-run: every step is an idempotent upsert/diff.
 */
export async function runCmsCsSync(
  onProgress?: (phase: string, done: number, total: number) => void,
): Promise<{ report: SyncReport; notes: string[] }> {
  const report: SyncReport = {};
  const notes: string[] = [];

  // Sequential, not Promise.all — the Sheets API's per-minute read quota is
  // shared with every other sync on the same service account.
  const userRows = await readCmsSheet("Users");
  const customerRows = await readCmsSheet("Customers");
  const vaConnRows = await readCmsSheet("VAConnections");

  // --- 1. CS users ---
  const usersResult = emptyResult();
  const csRows = userRows.filter((r) => CS_ROLES.has((r.Role ?? "").trim()));
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: csRows.map((r) => (r.Email ?? "").trim().toLowerCase()) } },
    select: { id: true, email: true, role: true, name: true, isActive: true },
  });
  const existingByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
  const csUserIdByEmail = new Map<string, string>();

  for (const row of csRows) {
    const email = (row.Email ?? "").trim().toLowerCase();
    const name = (row.Name ?? "").trim() || null;
    const isActive = (row.IsActive ?? "").trim().toUpperCase() !== "FALSE";
    if (!email.endsWith(COMPANY_DOMAIN)) {
      usersResult.skipped++;
      notes.push(`Skipped CS user ${row.UserID} (${email || "no email"}): not a ${COMPANY_DOMAIN} address.`);
      continue;
    }
    try {
      const existing = existingByEmail.get(email);
      if (!existing) {
        const user = await prisma.user.create({
          data: { email, name, role: UserRole.CS_SPECIALIST, isActive },
        });
        csUserIdByEmail.set(email, user.id);
        usersResult.created++;
      } else if (existing.role !== UserRole.CS_SPECIALIST) {
        usersResult.skipped++;
        notes.push(`Skipped CS user ${email}: already a ${existing.role} account in KPI (role left unchanged).`);
        continue;
      } else {
        if (existing.name !== name || existing.isActive !== isActive) {
          await prisma.user.update({ where: { id: existing.id }, data: { name, isActive } });
          usersResult.updated++;
        } else {
          usersResult.skipped++;
        }
        csUserIdByEmail.set(email, existing.id);
      }
    } catch (e) {
      usersResult.errors.push(`${row.UserID} (${email}): ${(e as Error).message}`);
    }
  }
  report["cs-users"] = usersResult;

  // --- 2. Customers + Connection.customerId ---
  const customerRowById = new Map(
    customerRows.filter((r) => (r.CustomerID ?? "").trim()).map((r) => [r.CustomerID.trim(), r]),
  );
  const customerIdsByName = new Map<string, string[]>();
  for (const [id, r] of customerRowById) {
    const key = normName(r.CustomerName ?? "");
    if (!key) continue;
    customerIdsByName.set(key, [...(customerIdsByName.get(key) ?? []), id]);
  }
  const cmsCustomerIdByConnId = new Map(
    vaConnRows
      .filter((r) => r.ConnectionID && (r.CustomerID ?? "").trim())
      .map((r) => [r.ConnectionID.trim(), r.CustomerID.trim()]),
  );

  const connections = await prisma.connection.findMany({
    select: { id: true, externalCmsId: true, clientName: true, status: true, customerId: true },
  });

  // Resolve every KPI connection to a CMS CustomerID (or leave unlinked).
  const cmsCustomerIdByKpiConn = new Map<string, string>();
  let unlinked = 0;
  let ambiguous = 0;
  for (const c of connections) {
    const viaId = c.externalCmsId ? cmsCustomerIdByConnId.get(c.externalCmsId) : undefined;
    if (viaId && customerRowById.has(viaId)) {
      cmsCustomerIdByKpiConn.set(c.id, viaId);
      continue;
    }
    const byName = customerIdsByName.get(normName(c.clientName)) ?? [];
    if (byName.length === 1) {
      cmsCustomerIdByKpiConn.set(c.id, byName[0]);
    } else {
      if (byName.length > 1) ambiguous++;
      else unlinked++;
    }
  }
  if (ambiguous) notes.push(`${ambiguous} connection(s) left unlinked: more than one CMS customer shares that client name.`);
  if (unlinked) notes.push(`${unlinked} connection(s) left unlinked: no matching CMS customer.`);

  // Import only customers that matter here: linked to a KPI connection, or
  // assigned to a CS we just imported.
  const neededCustomerIds = new Set(cmsCustomerIdByKpiConn.values());
  for (const [id, r] of customerRowById) {
    const email = (r.AssignedSpecialist ?? "").trim().toLowerCase();
    if (email && csUserIdByEmail.has(email)) neededCustomerIds.add(id);
  }

  const customersResult = emptyResult();
  const existingCustomers = await prisma.customer.findMany();
  const kpiCustomerByCmsId = new Map(existingCustomers.map((c) => [c.externalCmsId, c]));

  // KPI-derived status: ACTIVE iff at least one of its KPI connections is live.
  const liveCmsCustomerIds = new Set<string>();
  for (const c of connections) {
    const cmsId = cmsCustomerIdByKpiConn.get(c.id);
    if (cmsId && LIVE_STATUSES.has(c.status)) liveCmsCustomerIds.add(cmsId);
  }

  let cmsActiveKpiInactive = 0;
  await mapWithConcurrency([...neededCustomerIds], 8, async (cmsId) => {
    const row = customerRowById.get(cmsId)!;
    const name = (row.CustomerName ?? "").trim() || cmsId;
    const cmsStatus = (row.Status ?? "").trim() || null;
    const status = liveCmsCustomerIds.has(cmsId) ? CustomerStatus.ACTIVE : CustomerStatus.INACTIVE;
    if (cmsStatus === "Active" && status === CustomerStatus.INACTIVE) cmsActiveKpiInactive++;
    try {
      const existing = kpiCustomerByCmsId.get(cmsId);
      if (!existing) {
        const created = await prisma.customer.create({
          data: { externalCmsId: cmsId, name, cmsStatus, status },
        });
        kpiCustomerByCmsId.set(cmsId, created);
        customersResult.created++;
      } else if (existing.name !== name || existing.cmsStatus !== cmsStatus || existing.status !== status) {
        await prisma.customer.update({ where: { id: existing.id }, data: { name, cmsStatus, status } });
        customersResult.updated++;
      } else {
        customersResult.skipped++;
      }
    } catch (e) {
      customersResult.errors.push(`${cmsId}: ${(e as Error).message}`);
    }
  }, (done, total) => onProgress?.("cms-customers", done, total));
  report["customers"] = customersResult;
  if (cmsActiveKpiInactive) {
    notes.push(
      `${cmsActiveKpiInactive} client(s) are Active in the CMS but have no live KPI connection — set INACTIVE here (KPI connection statuses left untouched).`,
    );
  }

  const linkResult = emptyResult();
  const toLink = connections.filter((c) => {
    const cmsId = cmsCustomerIdByKpiConn.get(c.id);
    const kpiId = cmsId ? kpiCustomerByCmsId.get(cmsId)?.id : undefined;
    return (kpiId ?? null) !== c.customerId && kpiId !== undefined;
  });
  linkResult.skipped = connections.length - toLink.length;
  await mapWithConcurrency(toLink, 8, async (c) => {
    try {
      const kpiId = kpiCustomerByCmsId.get(cmsCustomerIdByKpiConn.get(c.id)!)!.id;
      await prisma.connection.update({ where: { id: c.id }, data: { customerId: kpiId } });
      linkResult.updated++;
    } catch (e) {
      linkResult.errors.push(`${c.id}: ${(e as Error).message}`);
    }
  }, (done, total) => onProgress?.("connection-customer-links", done, total));
  report["connection-links"] = linkResult;

  // --- 4. CS <-> client assignments ---
  const assignResult = emptyResult();
  const existingAssignments = await prisma.csClientAssignment.findMany();
  const usedCodes = new Set(existingAssignments.map((a) => a.code));
  const assignmentsByCustomer = new Map<string, typeof existingAssignments>();
  for (const a of existingAssignments) {
    assignmentsByCustomer.set(a.customerId, [...(assignmentsByCustomer.get(a.customerId) ?? []), a]);
  }

  const unassignedEmails = new Map<string, number>();
  for (const cmsId of neededCustomerIds) {
    const customer = kpiCustomerByCmsId.get(cmsId);
    if (!customer) continue;
    const email = (customerRowById.get(cmsId)!.AssignedSpecialist ?? "").trim().toLowerCase();
    const csUserId = email ? csUserIdByEmail.get(email) : undefined;
    if (email && !csUserId) unassignedEmails.set(email, (unassignedEmails.get(email) ?? 0) + 1);
    const current = assignmentsByCustomer.get(customer.id) ?? [];
    try {
      // Deactivate anyone who's no longer the assigned CS for this client.
      for (const a of current) {
        if (a.isActive && a.csUserId !== csUserId) {
          await prisma.csClientAssignment.update({ where: { id: a.id }, data: { isActive: false } });
          assignResult.updated++;
        }
      }
      if (!csUserId) continue;
      const mine = current.find((a) => a.csUserId === csUserId);
      if (mine) {
        if (!mine.isActive) {
          await prisma.csClientAssignment.update({ where: { id: mine.id }, data: { isActive: true } });
          assignResult.updated++;
        } else {
          assignResult.skipped++;
        }
        continue;
      }
      let code = randomAssignmentCode();
      while (usedCodes.has(code)) code = randomAssignmentCode();
      usedCodes.add(code);
      await prisma.csClientAssignment.create({
        data: { code, csUserId, customerId: customer.id, isActive: true },
      });
      assignResult.created++;
    } catch (e) {
      assignResult.errors.push(`${cmsId}: ${(e as Error).message}`);
    }
  }
  for (const [email, n] of unassignedEmails) {
    notes.push(`${n} client(s) assigned to ${email} in the CMS left unassigned: not an imported CS user.`);
  }
  report["cs-client-assignments"] = assignResult;

  return { report, notes };
}
