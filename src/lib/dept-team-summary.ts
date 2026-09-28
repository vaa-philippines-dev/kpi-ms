import { prisma } from "@/lib/prisma";
import { KpiPeriod, ConnectionStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { pickTeamForDepartment } from "@/lib/user-teams";
import { getSubmittedConnectionIds } from "@/lib/submitted-connections";

export type GroupSubmissionRow = {
  id: string;
  name: string;
  leaderName: string | null;
  submitted: number;
  total: number;
  ratePct: number;
};

async function buildRow(
  id: string,
  name: string,
  leaderName: string | null,
  scope: Prisma.ConnectionWhereInput,
  period: KpiPeriod,
  periodStart: Date,
): Promise<GroupSubmissionRow> {
  // ACTIVE only, not "anything but paused" — mirrors legacy's
  // getDeptSubmissionSummary/getTeamSubmissionSummary (SubmissionsCore.js),
  // which both filter to `Status === 'active'`. A connection that has ended
  // (END_OF_CONTRACT/END_OF_PROJECT) or hasn't started yet (PENDING) was
  // never expected to submit this period, so counting it here inflated the
  // denominator and understated the real submission rate (e.g. legacy's
  // 265/265 for a department read as 266/314 here, the extra 37 being that
  // department's already-ended connections).
  const connections = await prisma.connection.findMany({
    where: { ...scope, status: ConnectionStatus.ACTIVE },
    select: { id: true },
  });
  const total = connections.length;
  if (total === 0) {
    return { id, name, leaderName, submitted: 0, total: 0, ratePct: 0 };
  }
  // Submission OR a non-NO_DATA PerformanceSummary — see
  // lib/submitted-connections.ts for why neither table alone is enough.
  const submittedIds = await getSubmittedConnectionIds(
    connections.map((c) => c.id),
    period,
    periodStart,
  );
  return {
    id,
    name,
    leaderName,
    submitted: submittedIds.size,
    total,
    ratePct: Math.round((submittedIds.size / total) * 100),
  };
}

/**
 * One row per department, for the Admin "Department Summary" side panel.
 * `extraScope` narrows the connections counted within each department (team/
 * type/status filters from the Performance page's filter bar); `departmentIds`
 * restricts which departments get a row at all (its own "dept" filter).
 */
export async function getDepartmentSubmissionSummary(
  period: KpiPeriod,
  periodStart: Date,
  extraScope: Prisma.ConnectionWhereInput = {},
  departmentIds?: string[],
): Promise<GroupSubmissionRow[]> {
  const departments = await prisma.department.findMany({
    where: departmentIds ? { id: { in: departmentIds } } : undefined,
    orderBy: { name: "asc" },
  });
  return Promise.all(
    departments.map((dept) =>
      buildRow(dept.id, dept.name, null, { departmentId: dept.id, ...extraScope }, period, periodStart),
    ),
  );
}

/**
 * One row per team visible within `scope`, for the non-Admin "Team Summary"
 * side panel — e.g. a DM sees every team in their department, an OM sees
 * just the team(s) they lead (since `scope` is already narrowed to that).
 * Also prepends a leading "No Team" row for connections with no team
 * assigned at all — previously dropped from this panel entirely (only
 * connections with a `teamId` were ever looked at), which hid submissions
 * from otherwise-unassigned VAs rather than surfacing them as needing a
 * team.
 */
export async function getTeamSubmissionSummary(
  scope: Prisma.ConnectionWhereInput,
  period: KpiPeriod,
  periodStart: Date,
): Promise<GroupSubmissionRow[]> {
  // Team membership lives on the VA (User.teamId), never on the connection.
  // Connection.teamId is written once at creation/import and goes stale the
  // moment a VA transfers teams — teams/actions.ts's addTeamMember/
  // removeTeamMember/transferTeamMember update only User.teamId, by design
  // (see its own comment: "Connections.TeamID goes stale on transfer; only
  // User.teamId is trusted"). Legacy's getTeamSubmissionSummary
  // (SubmissionsCore.js) never read the connection's team field either — it
  // always grouped by the VA's own TeamID. Grouping by Connection.teamId
  // here (as this used to) diverged from legacy's per-team totals by up to
  // ~70% of a department's active connections (verified against Amazon's
  // roster: Team 01 read 22 instead of 31, Team 03 read 17 instead of 53).
  //
  // Bucketed here (in JS, from each connection's own department) rather
  // than by a `vaUser: { teamId }` relation filter per team, because a VA
  // can work across departments (User.additionalDepartments — e.g. one
  // Executive Assistant VA who also handles an Amazon client): their
  // `User.teamId` always points at their *home* department's team, which
  // has nothing to do with this connection's department. Filtering by
  // relation alone pulled that home team's row (and its unrelated leader —
  // confirmed against Amazon's "Team 04": Executive Assistant's own "Team
  // 04", led by Arlene Tacloy, was leaking in for exactly this reason) into
  // a department it doesn't belong to, just because the team-name/number
  // coincidentally matched one of this department's own teams. A
  // connection only counts toward its VA's team when that team's own
  // department matches the connection's department; otherwise it falls to
  // "No Team" for this department's purposes.
  const connections = await prisma.connection.findMany({
    where: scope,
    select: {
      id: true,
      departmentId: true,
      vaUser: {
        select: {
          team: { select: { id: true, departmentId: true } },
          additionalTeams: { select: { team: { select: { id: true, departmentId: true } } } },
        },
      },
    },
  });

  const idsByTeam = new Map<string, string[]>();
  const noTeamIds: string[] = [];
  for (const c of connections) {
    const team = pickTeamForDepartment(c.vaUser, c.departmentId);
    if (team) {
      const ids = idsByTeam.get(team.id) ?? [];
      ids.push(c.id);
      idsByTeam.set(team.id, ids);
    } else {
      noTeamIds.push(c.id);
    }
  }

  // Includes disbanded (isActive: false) teams too — excluding them here
  // used to mean any VA still pointing at a disbanded team (e.g. Amazon's
  // "Team 10") vanished from this panel entirely: not counted toward any
  // team, not counted toward "No Team" either (they still have a real
  // teamId, just one pointing at a disbanded team), silently understating
  // the department's real total. Shown with a "(Disbanded)" suffix instead
  // so it reads as "these still need reassigning," not a live team.
  const teamIds = [...idsByTeam.keys()];
  const teams =
    teamIds.length === 0
      ? []
      : await prisma.team.findMany({
          where: { id: { in: teamIds } },
          include: { teamLeader: true },
          orderBy: { name: "asc" },
        });

  const [teamRows, noTeamRow] = await Promise.all([
    Promise.all(
      teams.map((team) =>
        buildRow(
          team.id,
          team.isActive ? team.name : `${team.name} (Disbanded)`,
          team.teamLeader?.name ?? team.teamLeader?.email ?? null,
          { id: { in: idsByTeam.get(team.id)! } },
          period,
          periodStart,
        ),
      ),
    ),
    buildRow("no-team", "No Team", null, { id: { in: noTeamIds } }, period, periodStart),
  ]);

  return noTeamRow.total > 0 ? [noTeamRow, ...teamRows] : teamRows;
}

/**
 * One row per VA visible within `scope`, for a Team Leader's side panel —
 * unlike getTeamSubmissionSummary (one row per team, meant for a DM who
 * oversees several), an OM's `scope` is already narrowed to their own team,
 * so a single rolled-up row ("28/31") hides exactly the thing a team leader
 * needs: which of their people still haven't submitted. Reuses the same
 * ACTIVE-only "submitted" definition as buildRow.
 */
export async function getTeamMemberSubmissionSummary(
  scope: Prisma.ConnectionWhereInput,
  period: KpiPeriod,
  periodStart: Date,
): Promise<GroupSubmissionRow[]> {
  const connections = await prisma.connection.findMany({
    where: { ...scope, status: ConnectionStatus.ACTIVE },
    select: { id: true, vaUserId: true, vaUser: { select: { name: true, email: true } } },
  });
  if (connections.length === 0) return [];

  const submittedIds = await getSubmittedConnectionIds(
    connections.map((c) => c.id),
    period,
    periodStart,
  );

  const byVa = new Map<string, { name: string; total: number; submitted: number }>();
  for (const c of connections) {
    const entry = byVa.get(c.vaUserId) ?? {
      name: c.vaUser.name ?? c.vaUser.email,
      total: 0,
      submitted: 0,
    };
    entry.total++;
    if (submittedIds.has(c.id)) entry.submitted++;
    byVa.set(c.vaUserId, entry);
  }

  return [...byVa.entries()]
    .map(([vaUserId, v]) => ({
      id: vaUserId,
      name: v.name,
      leaderName: null,
      submitted: v.submitted,
      total: v.total,
      ratePct: Math.round((v.submitted / v.total) * 100),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
