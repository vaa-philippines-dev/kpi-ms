"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getConnectionWeekDetail, type ConnectionWeekDetail } from "@/app/dashboard/performance/actions";
import { createIntervention } from "@/app/dashboard/interventions/actions";
import { CONNECTION_STATUS_LABELS, CONNECTION_STATUS_TONE } from "@/lib/connection-labels";
import { ConnectionStatus, KpiDirection } from "@/generated/prisma/enums";

function DirIndicator({ direction }: { direction: KpiDirection }) {
  return direction === KpiDirection.LOWER_IS_BETTER ? (
    <ArrowDown className="size-3.5 text-warning" aria-label="Lower is better" />
  ) : (
    <ArrowUp className="size-3.5 text-success" aria-label="Higher is better" />
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted uppercase">{label}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

type DotTone = "success" | "warning" | "danger" | "neutral";

const DOT_BADGE_STYLES: Record<DotTone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  neutral: "border border-surface-border text-muted",
};

const DOT_STYLES: Record<DotTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted",
};

function StatusDotBadge({ tone, children }: { tone: DotTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${DOT_BADGE_STYLES[tone]}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${DOT_STYLES[tone]}`} />
      {children}
    </span>
  );
}

/**
 * Row-click detail popup for the Performance Summary table — legacy's
 * `openConnWeekDetail()` (AppDashboards.html), which the new system's table
 * never wired up (see PerformanceSummaryTabs). Shows the connection header,
 * a "View Connection" deep link into the Connections screen, the week's
 * per-KPI actual/target/status table, and — since managers can act on what
 * they see here — an inline Log Intervention form plus that connection's
 * recent intervention history, same as legacy's side-by-side layout.
 */
export function PerformanceDetailModal({
  connectionId,
  periodStart,
  isManager,
  interventionTypes,
  onClose,
}: {
  connectionId: string;
  periodStart: string;
  isManager: boolean;
  interventionTypes: string[];
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ConnectionWeekDetail | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    startTransition(async () => {
      try {
        setDetail(await getConnectionWeekDetail(connectionId, periodStart));
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to load KPI submission detail.", "error");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, periodStart]);

  const weekLabel = detail ? new Date(detail.periodStart).toLocaleDateString() : "";

  return (
    <Modal open onClose={onClose} title="KPI Submissions" size="xl">
      {isPending || !detail ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Client</p>
                <p className="text-lg font-semibold">{detail.clientName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusDotBadge tone={CONNECTION_STATUS_TONE[detail.status as ConnectionStatus]}>
                  {(CONNECTION_STATUS_LABELS[detail.status as ConnectionStatus] ?? detail.status).toUpperCase()}
                </StatusDotBadge>
                <Link
                  href={`/dashboard/connections?open=${detail.connectionId}`}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-hover"
                >
                  View Connection
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-surface-border pt-4 sm:grid-cols-3 lg:grid-cols-6">
              <InfoItem label="Connection ID">{detail.shortCode ?? "—"}</InfoItem>
              <InfoItem label="Virtual Assistant">{detail.vaName}</InfoItem>
              <InfoItem label="Start Date">
                {detail.startDate ? new Date(detail.startDate).toLocaleDateString() : "—"}
              </InfoItem>
              <InfoItem label="Week">{weekLabel}</InfoItem>
              <InfoItem label="Team">{detail.teamName ?? "—"}</InfoItem>
              <InfoItem label="Team Leader">{detail.teamLeaderName ?? "—"}</InfoItem>
            </div>

            {!detail.hasSubmission && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="size-3.5 shrink-0" />
                No submission received for this week
              </div>
            )}

            <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-surface-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-hover/60 text-xs text-muted uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">KPI</th>
                    <th className="px-3 py-2 text-left font-medium">Unit</th>
                    <th className="px-3 py-2 text-left font-medium">Target</th>
                    <th className="px-3 py-2 text-left font-medium">Actual</th>
                    <th className="px-3 py-2 text-center font-medium">Dir</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.kpiRows.map((r) => (
                    <tr key={r.kpiDefinitionId} className="border-t border-surface-border">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full border border-surface-border px-2 py-0.5 text-xs text-muted">
                          {r.unit ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted">
                        <span className="font-medium text-foreground">{r.targetValue}</span>
                        {r.benchmarkValue !== null && (
                          <div className="text-xs text-muted">Benchmark: {r.benchmarkValue}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">{r.actualValue ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <DirIndicator direction={r.direction} />
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {isManager && (
            <div className="shrink-0 space-y-4">
              <div className="rounded-xl border border-surface-border p-4">
                <h3 className="mb-3 text-sm font-semibold">Log Intervention</h3>
                <form
                  action={createIntervention}
                  onSubmit={() => toast("Intervention logged.", "success")}
                  className="space-y-2"
                >
                  <input type="hidden" name="connectionId" value={detail.connectionId} />
                  <Select
                    name="type"
                    required
                    defaultValue={interventionTypes[0] ?? ""}
                    className="w-full"
                  >
                    {interventionTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    name="description"
                    placeholder="What happened / what was discussed…"
                    required
                    rows={3}
                    className="w-full"
                  />
                  <Textarea
                    name="actionTaken"
                    placeholder="Action taken (optional)"
                    rows={2}
                    className="w-full"
                  />
                  <Button type="submit" className="w-full">
                    Save Intervention
                  </Button>
                </form>
              </div>

              <div className="rounded-xl border border-surface-border p-4">
                <h3 className="mb-3 text-sm font-semibold">
                  Intervention History ({detail.interventions.length})
                </h3>
                {detail.interventions.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted">
                    No interventions logged yet.
                  </p>
                ) : (
                  <div className="max-h-[30vh] space-y-2 overflow-y-auto pr-1">
                    {detail.interventions.map((iv) => (
                      <div key={iv.id} className="rounded-lg border border-surface-border p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{iv.type}</span>
                          <span className="text-muted">{iv.createdAtLabel}</span>
                        </div>
                        <p className="mt-1 text-muted">{iv.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
