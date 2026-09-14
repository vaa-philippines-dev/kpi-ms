import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { ActivityLogTable, type ActivityLogRow } from "@/components/activity-log-table";
import { requireSession } from "@/lib/connection-scope";

// Recent-window default for the page itself — loading the *entire* log (and
// growing without bound, currently 16,000+ rows each carrying a joined actor
// record) on every single page view was found to be a major contributor to
// a Supabase egress spike (2026-09-07); "?all=1" still reaches full history
// on demand, it's just no longer the default cost of opening this page. The
// CSV export deliberately stays uncapped — an admin explicitly asking for
// the full trail is a rare, intentional pull, not a per-visit cost.
const RECENT_LIMIT = 2000;

// Admin-only — this is the one place every mutation across the system
// (KPI edits, submissions, deletions, connection/team/user changes made by
// DMs/OMs/Team Leaders, etc.) shows up in one unified trail, so it's kept as
// sensitive as Login Activity but without the DM/OM department-scoped view
// that page has — an activity log scoped to "only what I can see" would
// silently hide cross-department changes, defeating the point of an audit
// trail.
export default async function ActivityLogPage(props: PageProps<"/dashboard/activity">) {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "EXECUTIVE") {
    redirect("/dashboard");
  }

  const searchParams = await props.searchParams;
  const showAll = searchParams.all === "1";

  const [logs, departments, totalCount, actionCounts] = await Promise.all([
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      include: { actor: true },
      ...(showAll ? {} : { take: RECENT_LIMIT }),
    }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.activityLog.count(),
    prisma.activityLog.groupBy({ by: ["action"], _count: true }),
  ]);
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));
  const countByAction = new Map(actionCounts.map((r) => [r.action, r._count]));

  const rows: ActivityLogRow[] = logs.map((log) => ({
    id: log.id,
    createdAtMs: log.createdAt.getTime(),
    createdAtLabel: log.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
    actorName: log.actor?.name ?? log.actor?.email ?? "System",
    actorEmail: log.actor?.email ?? null,
    actorRole: log.actorRole,
    action: log.action,
    entityType: log.entityType,
    entityLabel: log.entityLabel ?? log.entityId,
    summary: log.summary,
    departmentName: log.departmentId ? (departmentNameById.get(log.departmentId) ?? null) : null,
    changes: Array.isArray(log.changes)
      ? (log.changes as unknown as ActivityLogRow["changes"])
      : null,
  }));

  const createCount = countByAction.get("CREATE") ?? 0;
  const updateCount = countByAction.get("UPDATE") ?? 0;
  const deleteCount = countByAction.get("DELETE") ?? 0;

  return (
    <>
      <PageHeader
        title="Activity Log"
        description={
          showAll || totalCount <= RECENT_LIMIT
            ? "Every tracked KPI edit, submission, deletion, and change made by DMs, OMs, and Team Leaders across the system, since the log began."
            : `Showing the most recent ${RECENT_LIMIT.toLocaleString()} of ${totalCount.toLocaleString()} events. Nothing is deleted — it's just not all loaded by default.`
        }
      />

      {rows.length === 0 ? (
        <ComingSoon note="No activity recorded yet." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/api/export/activity"
              className="inline-block text-xs text-accent hover:underline"
            >
              Export CSV →
            </a>
            {!showAll && totalCount > RECENT_LIMIT && (
              <a href="/dashboard/activity?all=1" className="inline-block text-xs text-accent hover:underline">
                Load full history ({totalCount.toLocaleString()} events) →
              </a>
            )}
            {showAll && (
              <a href="/dashboard/activity" className="inline-block text-xs text-accent hover:underline">
                Show recent only →
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{totalCount}</div>
              <div className="mt-1 text-sm text-muted">Total Events</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold text-success">{createCount}</div>
              <div className="mt-1 text-sm text-muted">Created</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold text-warning">{updateCount}</div>
              <div className="mt-1 text-sm text-muted">Updated</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold text-danger">{deleteCount}</div>
              <div className="mt-1 text-sm text-muted">Deleted</div>
            </div>
          </div>

          <ActivityLogTable rows={rows} />
        </div>
      )}
    </>
  );
}
