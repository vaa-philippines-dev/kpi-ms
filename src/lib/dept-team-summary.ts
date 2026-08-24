import { prisma } from "@/lib/prisma";
import { KpiPeriod, ConnectionStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type GroupSubmissionRow = {
  id: string;
  name: string;
  submitted: number;
  total: number;
  ratePct: number;
};

async function buildRow(
  id: string,
  name: string,
  scope: Prisma.ConnectionWhereInput,
  period: KpiPeriod,
  periodStart: Date,
): Promise<GroupSubmissionRow> {
  const connections = await prisma.connection.findMany({
    where: { ...scope, status: { not: ConnectionStatus.PAUSED } },
    select: { id: true },
  });
  const total = connections.length;
  if (total === 0) {
    return { id, name, submitted: 0, total: 0, ratePct: 0 };
  }
  // Measured via PerformanceSummary, not Submission — legacy bulk imports
  // write performance data straight into PerformanceSummary and never
  // create a Submission row for it, so checking Submission here undercounts
  // every period that has imported (rather than live-submitted) data. See
  // lib/submission-trend.ts for the full explanation.
  const submittedGroups = await prisma.performanceSummary.groupBy({
    by: ["connectionId"],
    where: {
      period,
      periodStart,
      connectionId: { in: connections.map((c) => c.id) },
    },
  });
  return {
    id,
    name,
    submitted: submittedGroups.length,
    total,
    ratePct: Math.round((submittedGroups.length / total) * 100),
  };
}

/** One row per department, for the Admin "Department Summary" side panel. */
export async function getDepartmentSubmissionSummary(
  period: KpiPeriod,
  periodStart: Date,
): Promise<GroupSubmissionRow[]> {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
  });
  return Promise.all(
    departments.map((dept) =>
      buildRow(dept.id, dept.name, { departmentId: dept.id }, period, periodStart),
    ),
  );
}

/**
 * One row per team visible within `scope`, for the non-Admin "Team Summary"
 * side panel — e.g. a DM sees every team in their department, an OM sees
 * just the team(s) they lead (since `scope` is already narrowed to that).
 */
export async function getTeamSubmissionSummary(
  scope: Prisma.ConnectionWhereInput,
  period: KpiPeriod,
  periodStart: Date,
): Promise<GroupSubmissionRow[]> {
  const withTeam = await prisma.connection.findMany({
    where: { ...scope, teamId: { not: null } },
    select: { teamId: true },
    distinct: ["teamId"],
  });
  const teamIds = withTeam.map((c) => c.teamId!).filter(Boolean);
  if (teamIds.length === 0) return [];

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    orderBy: { name: "asc" },
  });
  return Promise.all(
    teams.map((team) =>
      buildRow(team.id, team.name, { ...scope, teamId: team.id }, period, periodStart),
    ),
  );
}
