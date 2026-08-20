import { prisma } from "@/lib/prisma";
import { readLegacySheet } from "./sheets-client";
import { mapWithConcurrency } from "./concurrency";
import {
  UserRole,
  ConnectionStatus,
  ConnectionType,
  KpiDirection,
  KpiPeriod,
} from "@/generated/prisma/enums";

export type PhaseResult = { created: number; updated: number; skipped: number; errors: string[] };
export type SyncReport = Record<string, PhaseResult>;

function emptyResult(): PhaseResult {
  return { created: 0, updated: 0, skipped: 0, errors: [] };
}

const boolFromLegacy = (v: string | undefined) => (v ?? "").trim().toUpperCase() === "TRUE";

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Legacy stores WEEK_START_DAY as a day name ("Monday"); ours is 0-6. */
function normalizeSettingValue(key: string, value: string): string {
  if (key === "WEEK_START_DAY") {
    const idx = WEEKDAY_NAMES.indexOf(value.trim().toLowerCase());
    if (idx !== -1) return String(idx);
  }
  return value;
}
const numOrNull = (v: string | undefined) => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dateOrNull = (v: string | undefined) => {
  if (v === undefined || v === "") return null;
  const d = new Date(`${v.trim().slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Confirmed with the user: legacy's 5 roles map onto this schema's enum as
// Administrator→ADMIN, Manager→DM, Team Leader→OM, CS Specialist→
// SERVICE_MANAGER, Virtual Assistant→VA.
const ROLE_MAP: Record<string, UserRole> = {
  Administrator: UserRole.ADMIN,
  Manager: UserRole.DM,
  "Team Leader": UserRole.OM,
  "CS Specialist": UserRole.SERVICE_MANAGER,
  "Virtual Assistant": UserRole.VA,
};

const STATUS_MAP: Record<string, ConnectionStatus> = {
  Active: ConnectionStatus.ACTIVE,
  Paused: ConnectionStatus.PAUSED,
  "End of Contract": ConnectionStatus.END_OF_CONTRACT,
  "End of Project": ConnectionStatus.END_OF_PROJECT,
  Pending: ConnectionStatus.PENDING,
};

/**
 * Reads Departments, Services, Teams, Users, Connections, KPI_Master,
 * KPI_Config, Interventions, and Settings from the legacy Sheet and
 * upserts them here, keyed by a legacy-id field (or email/name where a
 * natural key already existed) — safe to re-run on demand from the
 * Settings page's "Sync Reference Data" button instead of a cron job.
 *
 * Every phase pre-fetches the set of already-imported keys in ONE query
 * before looping, instead of a findUnique-per-row check — with KPI_Config
 * alone carrying 11k+ legacy rows (fanning out to ~23k of our rows across
 * weekly/monthly variants), a per-row existence check would mean tens of
 * thousands of extra round-trips to a remote Postgres instance.
 */
export async function runReferenceSync(triggeredByUserId: string): Promise<SyncReport> {
  const report: SyncReport = {};

  // --- Departments (upsert by name, already unique) ---
  const deptResult = emptyResult();
  const deptMap = new Map<string, string>(); // legacy DeptID -> our id
  const legacyDepts = await readLegacySheet("Departments");
  const existingDeptNames = new Set(
    (await prisma.department.findMany({ select: { name: true } })).map((d) => d.name),
  );
  for (const row of legacyDepts) {
    try {
      if (!row.DeptID || !row.DeptName) {
        deptResult.skipped++;
        continue;
      }
      const willUpdate = existingDeptNames.has(row.DeptName);
      const dept = await prisma.department.upsert({
        where: { name: row.DeptName },
        create: { name: row.DeptName },
        update: {},
      });
      deptMap.set(row.DeptID, dept.id);
      if (willUpdate) deptResult.updated++;
      else deptResult.created++;
    } catch (e) {
      deptResult.errors.push(`${row.DeptID}: ${(e as Error).message}`);
    }
  }
  report.departments = deptResult;

  // --- Services ---
  const svcResult = emptyResult();
  const svcMap = new Map<string, string>(); // legacy ServiceID -> our id
  const legacySvcs = await readLegacySheet("Services");
  const existingSvcIds = new Set(
    (await prisma.service.findMany({ where: { legacyId: { not: null } }, select: { legacyId: true } })).map(
      (s) => s.legacyId,
    ),
  );
  for (const row of legacySvcs) {
    try {
      const departmentId = deptMap.get(row.DeptID ?? "");
      if (!row.ServiceID || !row.ServiceName || !departmentId) {
        svcResult.skipped++;
        continue;
      }
      const willUpdate = existingSvcIds.has(row.ServiceID);
      const svc = await prisma.service.upsert({
        where: { legacyId: row.ServiceID },
        create: {
          legacyId: row.ServiceID,
          name: row.ServiceName,
          departmentId,
          isActive: boolFromLegacy(row.IsActive),
        },
        update: {
          name: row.ServiceName,
          departmentId,
          isActive: boolFromLegacy(row.IsActive),
        },
      });
      svcMap.set(row.ServiceID, svc.id);
      if (willUpdate) svcResult.updated++;
      else svcResult.created++;
    } catch (e) {
      svcResult.errors.push(`${row.ServiceID}: ${(e as Error).message}`);
    }
  }
  report.services = svcResult;

  // --- Users (upsert by email, already unique) ---
  const userResult = emptyResult();
  const userMap = new Map<string, string>(); // legacy UserID -> our id
  const legacyUsers = await readLegacySheet("Users");
  const existingUserEmails = new Set(
    (await prisma.user.findMany({ select: { email: true } })).map((u) => u.email),
  );
  for (const row of legacyUsers) {
    try {
      const email = (row.Email ?? "").trim().toLowerCase();
      const role = ROLE_MAP[row.Role ?? ""];
      if (!row.UserID || !email || !role) {
        userResult.skipped++;
        continue;
      }
      const name = [row.FirstName, row.LastName].filter(Boolean).join(" ") || null;
      const departmentId = deptMap.get(row.Department ?? "");
      const serviceId = svcMap.get(row.ServiceID ?? "");
      const willUpdate = existingUserEmails.has(email);
      const user = await prisma.user.upsert({
        where: { email },
        create: {
          email,
          name,
          role,
          departmentId,
          serviceId,
          isActive: boolFromLegacy(row.IsActive),
        },
        update: {
          name,
          role,
          departmentId,
          serviceId,
          isActive: boolFromLegacy(row.IsActive),
        },
      });
      userMap.set(row.UserID, user.id);
      if (willUpdate) userResult.updated++;
      else userResult.created++;
    } catch (e) {
      userResult.errors.push(`${row.UserID}: ${(e as Error).message}`);
    }
  }
  report.users = userResult;

  // --- Teams (two-pass: create/update core fields, then wire leader refs
  // now that userMap is fully populated) ---
  const teamResult = emptyResult();
  const teamMap = new Map<string, string>(); // legacy TeamID -> our id
  const legacyTeams = await readLegacySheet("Teams");
  const existingTeamIds = new Set(
    (await prisma.team.findMany({ where: { legacyId: { not: null } }, select: { legacyId: true } })).map(
      (t) => t.legacyId,
    ),
  );
  for (const row of legacyTeams) {
    try {
      const departmentId = deptMap.get(row.DeptID ?? "");
      if (!row.TeamID || !row.TeamName || !departmentId) {
        teamResult.skipped++;
        continue;
      }
      const willUpdate = existingTeamIds.has(row.TeamID);
      const team = await prisma.team.upsert({
        where: { legacyId: row.TeamID },
        create: {
          legacyId: row.TeamID,
          name: row.TeamName,
          departmentId,
          isActive: boolFromLegacy(row.IsActive),
        },
        update: {
          name: row.TeamName,
          departmentId,
          isActive: boolFromLegacy(row.IsActive),
        },
      });
      teamMap.set(row.TeamID, team.id);
      if (willUpdate) teamResult.updated++;
      else teamResult.created++;
    } catch (e) {
      teamResult.errors.push(`${row.TeamID}: ${(e as Error).message}`);
    }
  }
  for (const row of legacyTeams) {
    const teamId = teamMap.get(row.TeamID ?? "");
    if (!teamId) continue;
    const teamLeaderId = userMap.get(row.TeamLeaderUserID ?? "");
    const tempLeader1Id = userMap.get(row.TempLeader1UserID ?? "");
    const tempLeader2Id = userMap.get(row.TempLeader2UserID ?? "");
    if (!teamLeaderId && !tempLeader1Id && !tempLeader2Id) continue;
    try {
      await prisma.team.update({
        where: { id: teamId },
        data: { teamLeaderId, tempLeader1Id, tempLeader2Id },
      });
      if (teamLeaderId) {
        await prisma.user.update({ where: { id: teamLeaderId }, data: { teamId } });
      }
    } catch (e) {
      teamResult.errors.push(`${row.TeamID} (leader wiring): ${(e as Error).message}`);
    }
  }
  report.teams = teamResult;

  // --- Connections (upsert by externalWfmId = legacy ConnectionID) ---
  const connResult = emptyResult();
  const connMap = new Map<string, string>(); // legacy ConnectionID -> our id
  const legacyConns = await readLegacySheet("Connections");
  const existingConnIds = new Set(
    (
      await prisma.connection.findMany({
        where: { externalWfmId: { not: null } },
        select: { externalWfmId: true },
      })
    ).map((c) => c.externalWfmId),
  );
  for (const row of legacyConns) {
    try {
      const vaUserId = userMap.get(row.VAUserID ?? "");
      const departmentId = deptMap.get(row.DeptID ?? "");
      if (!row.ConnectionID || !vaUserId || !departmentId || !row.ClientName) {
        connResult.skipped++;
        continue;
      }
      const serviceId = svcMap.get(row.ServiceID ?? "");
      const teamId = teamMap.get(row.TeamID ?? "");
      const status = STATUS_MAP[row.Status ?? ""] ?? ConnectionStatus.ACTIVE;
      const connectionType =
        row.ConnectionType === "Project-based"
          ? ConnectionType.PROJECT_BASED
          : ConnectionType.REGULAR;

      const willUpdate = existingConnIds.has(row.ConnectionID);
      const secondaryName = row.SecondaryName || null;
      const startDate = dateOrNull(row.StartDate);
      const conn = await prisma.connection.upsert({
        where: { externalWfmId: row.ConnectionID },
        create: {
          externalWfmId: row.ConnectionID,
          vaUserId,
          clientName: row.ClientName,
          secondaryName,
          startDate,
          departmentId,
          serviceId,
          teamId,
          status,
          connectionType,
        },
        update: {
          vaUserId,
          clientName: row.ClientName,
          secondaryName,
          startDate,
          departmentId,
          serviceId,
          teamId,
          status,
          connectionType,
        },
      });
      connMap.set(row.ConnectionID, conn.id);
      if (willUpdate) connResult.updated++;
      else connResult.created++;
    } catch (e) {
      connResult.errors.push(`${row.ConnectionID}: ${(e as Error).message}`);
    }
  }
  report.connections = connResult;

  // --- KPI_Master -> KpiDefinition (one legacy row fans out to a WEEKLY
  // and/or MONTHLY row, since legacy carries both targets on one row) ---
  const kpiResult = emptyResult();
  const kpiDefMap = new Map<string, string>(); // `${legacyKpiId}:${period}` -> our id
  const legacyKpis = await readLegacySheet("KPI_Master");
  const existingKpiDefKeys = new Set(
    (
      await prisma.kpiDefinition.findMany({
        where: { legacyId: { not: null } },
        select: { legacyId: true, period: true },
      })
    ).map((k) => `${k.legacyId}:${k.period}`),
  );
  for (const row of legacyKpis) {
    const departmentId = deptMap.get(row.DeptID ?? "");
    if (!row.KPIID || !row.KPIName || !departmentId) {
      kpiResult.skipped++;
      continue;
    }
    const serviceId = svcMap.get(row.ServiceID ?? "");
    const direction =
      (row.PerformanceDirection ?? "").toLowerCase() === "lower"
        ? KpiDirection.LOWER_IS_BETTER
        : KpiDirection.HIGHER_IS_BETTER;
    const deviationThresholdPct = numOrNull(row.DeviationThreshold) ?? 10;
    const criticalThresholdPct = numOrNull(row.AtRiskThreshold) ?? 25;
    const cluster = row.Cluster || row.KPIName;

    const variants: { period: KpiPeriod; targetValue: number | null }[] = [
      { period: KpiPeriod.WEEKLY, targetValue: numOrNull(row.WeeklyTarget) },
      { period: KpiPeriod.MONTHLY, targetValue: numOrNull(row.MonthlyTarget) },
    ];
    for (const { period, targetValue } of variants) {
      if (targetValue === null) continue;
      try {
        const willUpdate = existingKpiDefKeys.has(`${row.KPIID}:${period}`);
        const def = await prisma.kpiDefinition.upsert({
          where: { legacyId_period: { legacyId: row.KPIID, period } },
          create: {
            legacyId: row.KPIID,
            name: row.KPIName,
            cluster,
            departmentId,
            serviceId,
            direction,
            period,
            targetValue,
            deviationThresholdPct,
            criticalThresholdPct,
          },
          update: {
            name: row.KPIName,
            cluster,
            departmentId,
            serviceId,
            direction,
            targetValue,
            deviationThresholdPct,
            criticalThresholdPct,
          },
        });
        kpiDefMap.set(`${row.KPIID}:${period}`, def.id);
        if (willUpdate) kpiResult.updated++;
        else kpiResult.created++;
      } catch (e) {
        kpiResult.errors.push(`${row.KPIID}:${period}: ${(e as Error).message}`);
      }
    }
  }
  report.kpiDefinitions = kpiResult;

  // --- KPI_Config (per-connection override; same fan-out as KPI_Master) ---
  const cfgResult = emptyResult();
  const legacyConfigs = await readLegacySheet("KPI_Config");
  const existingCfgKeys = new Set(
    (
      await prisma.kpiConfig.findMany({
        select: { connectionId: true, kpiDefinitionId: true },
      })
    ).map((c) => `${c.connectionId}:${c.kpiDefinitionId}`),
  );
  type CfgJob = {
    configId: string;
    connectionId: string;
    kpiDefinitionId: string;
    period: KpiPeriod;
    targetValue: number | null;
    deviationThresholdPct: number | null;
    criticalThresholdPct: number | null;
    isApplicable: boolean;
    updatedById: string;
  };
  const cfgJobs: CfgJob[] = [];
  for (const row of legacyConfigs) {
    const connectionId = connMap.get(row.ConnectionID ?? "");
    if (!row.ConfigID || !connectionId || !row.KPIID) {
      cfgResult.skipped++;
      continue;
    }
    const isApplicable =
      row.IsApplicable === undefined || row.IsApplicable === ""
        ? true
        : boolFromLegacy(row.IsApplicable);
    const updatedById = userMap.get(row.UpdatedBy ?? "") ?? triggeredByUserId;
    const deviationThresholdPct = numOrNull(row.DeviationThreshold);
    const criticalThresholdPct = numOrNull(row.AtRiskThreshold);

    const variants: { period: KpiPeriod; targetValue: number | null }[] = [
      { period: KpiPeriod.WEEKLY, targetValue: numOrNull(row.WeeklyTarget) },
      { period: KpiPeriod.MONTHLY, targetValue: numOrNull(row.MonthlyTarget) },
    ];
    for (const { period, targetValue } of variants) {
      const kpiDefinitionId = kpiDefMap.get(`${row.KPIID}:${period}`);
      if (!kpiDefinitionId) continue;
      cfgJobs.push({
        configId: row.ConfigID,
        connectionId,
        kpiDefinitionId,
        period,
        targetValue,
        deviationThresholdPct,
        criticalThresholdPct,
        isApplicable,
        updatedById,
      });
    }
  }
  await mapWithConcurrency(cfgJobs, 10, async (job) => {
    const {
      configId,
      connectionId,
      kpiDefinitionId,
      period,
      targetValue,
      deviationThresholdPct,
      criticalThresholdPct,
      isApplicable,
      updatedById,
    } = job;
    try {
      const willUpdate = existingCfgKeys.has(`${connectionId}:${kpiDefinitionId}`);
        await prisma.kpiConfig.upsert({
          where: { connectionId_kpiDefinitionId: { connectionId, kpiDefinitionId } },
          create: {
            connectionId,
            kpiDefinitionId,
            targetValue,
            deviationThresholdPct,
            criticalThresholdPct,
            isApplicable,
            updatedById,
          },
          update: {
            targetValue,
            deviationThresholdPct,
            criticalThresholdPct,
            isApplicable,
            updatedById,
            version: { increment: 1 },
          },
        });
        if (willUpdate) cfgResult.updated++;
        else cfgResult.created++;
    } catch (e) {
      cfgResult.errors.push(`${configId}:${period}: ${(e as Error).message}`);
    }
  });
  report.kpiConfigs = cfgResult;

  // --- Interventions ---
  const ivResult = emptyResult();
  const legacyIvs = await readLegacySheet("Interventions");
  const existingIvIds = new Set(
    (
      await prisma.intervention.findMany({
        where: { legacyId: { not: null } },
        select: { legacyId: true },
      })
    ).map((i) => i.legacyId),
  );
  for (const row of legacyIvs) {
    try {
      const connectionId = connMap.get(row.ConnectionID ?? "");
      if (!row.InterventionID || !connectionId || !row.Type || !row.Description) {
        ivResult.skipped++;
        continue;
      }
      const createdById = userMap.get(row.CreatedBy ?? "") ?? triggeredByUserId;
      const willUpdate = existingIvIds.has(row.InterventionID);
      await prisma.intervention.upsert({
        where: { legacyId: row.InterventionID },
        create: {
          legacyId: row.InterventionID,
          connectionId,
          type: row.Type,
          description: row.Description,
          actionTaken: row.ActionTaken || null,
          outcome: row.Outcome || null,
          createdById,
        },
        update: {
          type: row.Type,
          description: row.Description,
          actionTaken: row.ActionTaken || null,
          outcome: row.Outcome || null,
        },
      });
      if (willUpdate) ivResult.updated++;
      else ivResult.created++;
    } catch (e) {
      ivResult.errors.push(`${row.InterventionID}: ${(e as Error).message}`);
    }
  }
  report.interventions = ivResult;

  // --- Settings ---
  const settingResult = emptyResult();
  const legacySettings = await readLegacySheet("Settings");
  const existingSettingKeys = new Set(
    (await prisma.setting.findMany({ select: { key: true } })).map((s) => s.key),
  );
  for (const row of legacySettings) {
    try {
      // APP_NAME is this app's own branding, not legacy config — never
      // let a re-sync clobber it with the old system's name.
      if (!row.SettingKey || row.SettingKey === "APP_NAME") {
        settingResult.skipped++;
        continue;
      }
      const value = normalizeSettingValue(row.SettingKey, row.SettingValue ?? "");
      const willUpdate = existingSettingKeys.has(row.SettingKey);
      await prisma.setting.upsert({
        where: { key: row.SettingKey },
        create: { key: row.SettingKey, value, updatedById: triggeredByUserId },
        update: { value, updatedById: triggeredByUserId },
      });
      if (willUpdate) settingResult.updated++;
      else settingResult.created++;
    } catch (e) {
      settingResult.errors.push(`${row.SettingKey}: ${(e as Error).message}`);
    }
  }
  report.settings = settingResult;

  return report;
}
