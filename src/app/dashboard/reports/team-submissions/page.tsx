import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  TeamSubmissionReportTable,
  type TeamReportRow,
} from "@/components/team-submission-report-table";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { getTeamSubmissionReport } from "@/lib/team-submission-report";
import { KpiPeriod, UserRole } from "@/generated/prisma/enums";

// "Team Report" — reachable only via the button on the Submissions page,
// same as legacy's Team Submission Report modal (AppSubmissions.html:
// openTeamSubmissionReport()), which was likewise only opened from a button
// rather than living in the main nav. Restricted to Administrator/Manager
// there ('role==="Administrator"||role==="Manager"'); DM is this app's
// Manager equivalent (see lib/connection-scope.ts), so ADMIN/DM here.
export default async function TeamSubmissionReportPage(
  props: PageProps<"/dashboard/reports/team-submissions">,
) {
  const session = await requireSession();
  if (
    session.role !== UserRole.ADMIN &&
    session.role !== UserRole.EXECUTIVE &&
    session.role !== UserRole.DM &&
    session.role !== UserRole.OPS_MANAGER
  ) {
    redirect("/dashboard/submissions");
  }
  // Treated the same as ADMIN below (department picker, unscoped summary) —
  // EXECUTIVE has full read visibility but the department filter form is a
  // plain GET, so there's no mutation surface here to worry about.
  const isUnrestrictedViewer = session.role === UserRole.ADMIN || session.role === UserRole.EXECUTIVE;

  const searchParams = await props.searchParams;
  const dateParam = typeof searchParams.date === "string" ? searchParams.date : undefined;
  const anchor = parseAnchorDate(dateParam);
  const departmentId =
    typeof searchParams.departmentId === "string" ? searchParams.departmentId : "";

  const baseScope = connectionScopeWhere(session);
  // Department filter is admin-only (mirrors legacy's dept dropdown, which
  // only Admin sees) — a DM's scope is already department-locked.
  const scope =
    isUnrestrictedViewer && departmentId
      ? { ...baseScope, departmentId }
      : baseScope;
  const weekStartDay = await getWeekStartDay();
  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);

  const [departments, teamRows] = await Promise.all([
    isUnrestrictedViewer
      ? prisma.department.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    getTeamSubmissionReport(scope, weeklyStart),
  ]);

  const rows: TeamReportRow[] = teamRows.map((t) => ({
    teamId: t.teamId,
    teamName: t.teamName,
    departmentName: t.departmentName,
    leaderName: t.leaderName,
    weeklyRates: t.weeks.map((w) => (w.total > 0 ? Math.round((w.submitted / w.total) * 100) : 0)),
    submitted: t.submitted,
    total: t.total,
    ratePct: t.ratePct,
    avgRatePct: t.avgRatePct,
  }));

  return (
    <>
      <PageHeader
        title="Team Submission Report"
        description="Weekly submission-rate trend per team, for the selected period."
      />

      {isUnrestrictedViewer && departments.length > 0 && (
        <form method="GET" className="mb-6 flex flex-wrap gap-2">
          {dateParam && <input type="hidden" name="date" value={dateParam} />}
          <Select name="departmentId" defaultValue={departmentId} className="w-48">
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Button type="submit">Filter</Button>
        </form>
      )}

      {rows.length === 0 ? (
        <ComingSoon note="No teams with connections visible to your account yet." />
      ) : (
        <TeamSubmissionReportTable rows={rows} />
      )}
    </>
  );
}
