import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { ActivityLogTable, type ActivityLogRow } from "@/components/activity-log-table";
import { requireSession } from "@/lib/connection-scope";

// Loaded upfront and sliced client-side, same pattern as every other report
// in the app (DataTable) — capped to the most recent window so the page
// stays fast even as the log grows unbounded over time (submission creates
// alone add one row per VA submission).
const RECENT_LIMIT = 2000;

// Admin-only — this is the one place every mutation across the system
// (KPI edits, submissions, deletions, connection/team/user changes made by
// DMs/OMs/Team Leaders, etc.) shows up in one unified trail, so it's kept as
// sensitive as Login Activity but without the DM/OM department-scoped view
// that page has — an activity log scoped to "only what I can see" would
// silently hide cross-department changes, defeating the point of an audit
// trail.
export default async function ActivityLogPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [logs, departments] = await Promise.all([
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: { actor: true },
    }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ]);
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));

  const rows: ActivityLogRow[] = logs.map((log) => ({
    id: log.id,
    createdAtMs: log.createdAt.getTime(),
    createdAtLabel: log.createdAt.toLocaleString(),
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

  const createCount = rows.filter((r) => r.action === "CREATE").length;
  const updateCount = rows.filter((r) => r.action === "UPDATE").length;
  const deleteCount = rows.filter((r) => r.action === "DELETE").length;

  return (
    <>
      <PageHeader
        title="Activity Log"
        description={`Every tracked KPI edit, submission, deletion, and change made by DMs, OMs, and Team Leaders across the system. Showing the most recent ${RECENT_LIMIT.toLocaleString()} events.`}
      />

      {rows.length === 0 ? (
        <ComingSoon note="No activity recorded yet." />
      ) : (
        <div className="space-y-6">
          <a
            href="/api/export/activity"
            className="inline-block text-xs text-accent hover:underline"
          >
            Export CSV →
          </a>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{rows.length}</div>
              <div className="mt-1 text-sm text-muted">Events Shown</div>
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
