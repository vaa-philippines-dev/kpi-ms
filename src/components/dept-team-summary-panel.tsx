import Link from "next/link";
import type { GroupSubmissionRow } from "@/lib/dept-team-summary";

function rateTextClass(pct: number): string {
  if (pct >= 80) return "text-success";
  if (pct >= 60) return "text-warning";
  return "text-danger";
}

function rateBarClass(pct: number): string {
  if (pct >= 80) return "bg-success";
  if (pct >= 60) return "bg-warning";
  return "bg-danger";
}

/**
 * Right-hand side panel on Performance Analytics — "Department Summary"
 * (Admin) or "Team Summary" (everyone else) from legacy's
 * `_buildPerfSidePanel`. Same submission-rate-per-group shape either way,
 * just a different title/link.
 */
export function DeptTeamSummaryPanel({
  title,
  rows,
  showTeamReportLink,
}: {
  title: string;
  rows: GroupSubmissionRow[];
  showTeamReportLink?: boolean;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {showTeamReportLink && (
          <Link
            href="/dashboard/reports/team-submissions"
            className="shrink-0 text-xs text-accent hover:underline"
          >
            Team Report →
          </Link>
        )}
      </div>
      <p className="mb-4 text-xs text-muted">Submission rate for this period</p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No data yet.</p>
      ) : (
        <div>
          <div className="flex items-center justify-between border-b border-surface-border pb-2 text-[10px] font-semibold tracking-wide text-muted uppercase">
            <span>Dept</span>
            <span>Submitted</span>
          </div>
          <ul className="divide-y divide-surface-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className={`h-full rounded-full ${rateBarClass(r.ratePct)}`}
                      style={{ width: `${r.ratePct}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-sm font-semibold ${rateTextClass(r.ratePct)}`}>
                    {r.ratePct}%
                  </div>
                  <div className="text-xs text-muted">
                    {r.submitted}/{r.total}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
