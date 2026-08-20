import Link from "next/link";
import type { GroupSubmissionRow } from "@/lib/dept-team-summary";

function rateTextClass(pct: number): string {
  if (pct >= 80) return "text-success";
  if (pct >= 60) return "text-warning";
  return "text-danger";
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
            href="/dashboard/submissions"
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
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <span className={`shrink-0 text-xs font-semibold ${rateTextClass(r.ratePct)}`}>
                {r.ratePct}%
                <span className="ml-1 font-normal text-muted">
                  {r.submitted}/{r.total}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
