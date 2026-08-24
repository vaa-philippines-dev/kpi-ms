"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PerformanceDetailModal } from "@/components/performance-detail-modal";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import type { ConnectionSummaryRow } from "@/components/performance-summary-tabs";

const STATUS_CARD_STYLE: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "border-success/30 text-success",
  [PerformanceStatus.AT_RISK]: "border-warning/30 text-warning",
  [PerformanceStatus.CRITICAL]: "border-danger/30 text-danger",
  [PerformanceStatus.NO_DATA]: "border-surface-border text-muted",
};

const STATUS_CARD_LABEL: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "On Target",
  [PerformanceStatus.AT_RISK]: "At Risk",
  [PerformanceStatus.CRITICAL]: "Critical",
  [PerformanceStatus.NO_DATA]: "No Data",
};

/**
 * Total / On Target / At Risk / Critical stat cards on the Performance
 * Analytics page. The three status cards double as buttons — clicking one
 * lists the connections currently in that status, so managers can see who
 * is critical without leaving the trend view.
 */
export function PerformanceStatCards({
  totalConnections,
  connectionRows,
  periodStart,
  period,
  isManager,
  interventionTypes,
}: {
  totalConnections: number;
  connectionRows: ConnectionSummaryRow[];
  periodStart: string;
  period: KpiPeriod;
  isManager: boolean;
  interventionTypes: string[];
}) {
  const [openStatus, setOpenStatus] = useState<PerformanceStatus | null>(null);
  const [openConnectionId, setOpenConnectionId] = useState<string | null>(null);

  const statuses = [
    PerformanceStatus.ON_TARGET,
    PerformanceStatus.AT_RISK,
    PerformanceStatus.CRITICAL,
  ];
  const rowsByStatus = (status: PerformanceStatus) =>
    connectionRows.filter((r) => r.status === status);

  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-surface-border p-3">
          <div className="text-2xl font-semibold">{totalConnections}</div>
          <div className="mt-0.5 text-xs text-muted">Total</div>
        </div>
        {statuses.map((status) => {
          const count = rowsByStatus(status).length;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setOpenStatus(status)}
              className={`rounded-lg border p-3 text-left transition hover:bg-surface-hover ${STATUS_CARD_STYLE[status]}`}
            >
              <div className="text-2xl font-semibold">{count}</div>
              <div className="mt-0.5 text-xs">{STATUS_CARD_LABEL[status]}</div>
            </button>
          );
        })}
      </div>

      {openStatus && (
        <Modal
          open
          onClose={() => setOpenStatus(null)}
          title={`${STATUS_CARD_LABEL[openStatus]} Connections`}
        >
          {rowsByStatus(openStatus).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No connections in this status for the current period.
            </p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {rowsByStatus(openStatus).map((row) => (
                <li key={row.connectionId}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenConnectionId(row.connectionId);
                      setOpenStatus(null);
                    }}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:bg-surface-hover"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.clientName}</p>
                      <p className="truncate text-xs text-muted">
                        {row.vaName} · {row.departmentName}
                        {row.teamName ? ` · ${row.teamName}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                      {row.isFlagged && <Flag className="size-3.5 fill-danger text-danger" />}
                      {row.durationDays}d
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {openConnectionId && (
        <PerformanceDetailModal
          connectionId={openConnectionId}
          periodStart={periodStart}
          period={period}
          isManager={isManager}
          interventionTypes={interventionTypes}
          onClose={() => setOpenConnectionId(null)}
        />
      )}
    </>
  );
}
