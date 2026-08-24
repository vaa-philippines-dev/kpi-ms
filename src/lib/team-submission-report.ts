import { prisma } from "@/lib/prisma";
import { KpiPeriod, ConnectionStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type TeamWeekPoint = { periodStart: Date; submitted: number; total: number };

export type TeamSubmissionReportRow = {
  teamId: string;
  teamName: string;
  departmentId: string;
  departmentName: string;
  leaderName: string | null;
  weeks: TeamWeekPoint[];
  submitted: number;
  total: number;
  ratePct: number;
  avgRatePct: number;
};

/**
 * Per-team weekly submission-rate trend, for the "Team Report" reachable
 * from the Submissions page (Admin/DM only) — mirrors legacy's Team
 * Submission Report modal (AppSubmissions.html's
 * openTeamSubmissionReport()/_tsrRender()): one row per team with a
 * `weeks`-long trend (default 6, matching legacy) ending at `weeklyStart`,
 * this period's rate, and the average rate across the window.
 */
export async function getTeamSubmissionReport(
  scope: Prisma.ConnectionWhereInput,
  weeklyStart: Date,
  weeks = 6,
): Promise<TeamSubmissionReportRow[]> {
  const starts: Date[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    starts.push(new Date(weeklyStart.getTime() - i * 7 * 24 * 60 * 60 * 1000));
  }

  const withTeam = await prisma.connection.findMany({
    where: { ...scope, teamId: { not: null } },
    select: { teamId: true },
    distinct: ["teamId"],
  });
  const teamIds = withTeam.map((c) => c.teamId).filter((id): id is string => !!id);
  if (teamIds.length === 0) return [];

  const [teams, connections] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      include: { department: true, teamLeader: true },
      orderBy: { name: "asc" },
    }),
    // ACTIVE only — same fix as lib/dept-team-summary.ts and
    // lib/submission-trend.ts: "not paused" was also sweeping in ended
    // (END_OF_CONTRACT/END_OF_PROJECT) and not-yet-started (PENDING)
    // connections, and would now catch INACTIVE too.
    prisma.connection.findMany({
      where: { ...scope, teamId: { in: teamIds }, status: ConnectionStatus.ACTIVE },
      select: { id: true, teamId: true, createdAt: true, startDate: true },
    }),
  ]);

  // PerformanceSummary, not Submission — see lib/submission-trend.ts for why
  // (legacy bulk imports never create a Submission row, only a
  // PerformanceSummary one, so Submission alone undercounts every imported
  // period).
  const submissions = await prisma.performanceSummary.groupBy({
    by: ["connectionId", "periodStart"],
    where: {
      period: KpiPeriod.WEEKLY,
      periodStart: { in: starts },
      connectionId: { in: connections.map((c) => c.id) },
    },
  });
  const submittedSet = new Set(
    submissions.map((s) => `${s.connectionId}:${s.periodStart.getTime()}`),
  );

  const connsByTeam = new Map<string, typeof connections>();
  for (const c of connections) {
    if (!c.teamId) continue;
    if (!connsByTeam.has(c.teamId)) connsByTeam.set(c.teamId, []);
    connsByTeam.get(c.teamId)!.push(c);
  }

  return teams.map((team) => {
    const teamConns = connsByTeam.get(team.id) ?? [];
    const weekPoints: TeamWeekPoint[] = starts.map((periodStart) => {
      // Real business start date, not row-creation time — see
      // lib/submission-trend.ts for why createdAt alone flattens every
      // pre-sync week to 0.
      const countable = teamConns.filter((c) => (c.startDate ?? c.createdAt) <= periodStart);
      const total = countable.length;
      const submitted = countable.filter((c) =>
        submittedSet.has(`${c.id}:${periodStart.getTime()}`),
      ).length;
      return { periodStart, submitted, total };
    });
    const current = weekPoints[weekPoints.length - 1] ?? { submitted: 0, total: 0 };
    const ratedWeeks = weekPoints.filter((w) => w.total > 0);
    const avgRatePct = ratedWeeks.length
      ? Math.round(
          (ratedWeeks.reduce((sum, w) => sum + w.submitted / w.total, 0) / ratedWeeks.length) *
            100,
        )
      : 0;
    return {
      teamId: team.id,
      teamName: team.name,
      departmentId: team.departmentId,
      departmentName: team.department.name,
      leaderName: team.teamLeader?.name ?? team.teamLeader?.email ?? null,
      weeks: weekPoints,
      submitted: current.submitted,
      total: current.total,
      ratePct: current.total > 0 ? Math.round((current.submitted / current.total) * 100) : 0,
      avgRatePct,
    };
  });
}
