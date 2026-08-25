"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/status-badge";
import { PerformanceDetailModal } from "@/components/performance-detail-modal";
import { PerformanceStatus, KpiPeriod } from "@/generated/prisma/enums";
import type { DeptConnectionRow } from "./department-breakdown-table";

const STATUS_TILES = [
  {
    status: PerformanceStatus.ON_TARGET,
    label: "On Target",
    icon: CheckCircle2,
    style: "border-success/30 text-success",
  },
  {
    status: PerformanceStatus.AT_RISK,
    label: "At Risk",
    icon: AlertTriangle,
    style: "border-warning/30 text-warning",
  },
  {
    status: PerformanceStatus.CRITICAL,
    label: "Critical",
    icon: XCircle,
    style: "border-danger/30 text-danger",
  },
  {
    status: PerformanceStatus.NO_DATA,
    label: "No Data",
    icon: HelpCircle,
    style: "border-surface-border text-muted",
  },
] as const;

/**
 * Dashboard Overview's top stat row. Active Connections links straight to
 * the Connections list; each status tile now opens the same "who's in this
 * status" drill-down PerformanceStatCards already gives the Performance
 * page, so a manager doesn't have to leave the dashboard to see who's
 * Critical this period.
 */
export function DashboardStatCards({
  totalConnections,
  counts,
  connectionRows,
  periodStart,
  period,
  interventionTypes,
}: {
  totalConnections: number;
  counts: Record<PerformanceStatus, number>;
  connectionRows: DeptConnectionRow[];
  periodStart: string;
  period: KpiPeriod;
  interventionTypes: string[];
}) {
  const [openStatus, setOpenStatus] = useState<PerformanceStatus | null>(null);
  const [openConnectionId, setOpenConnectionId] = useState<string | null>(null);

  const rowsByStatus = (status: PerformanceStatus) =>
    connectionRows.filter((r) => r.status === status);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Link
          href="/dashboard/connections"
          className="rounded-xl border border-surface-border bg-surface p-4 transition hover:bg-surface-hover"
        >
          <Link2 className="size-5 text-muted" />
          <div className="mt-3 text-3xl font-semibold">{totalConnections}</div>
          <div className="mt-1 text-sm text-muted">Active Connections</div>
        </Link>
        {STATUS_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.status}
              type="button"
              onClick={() => setOpenStatus(tile.status)}
              className={`rounded-xl border bg-surface p-4 text-left transition hover:bg-surface-hover ${tile.style}`}
            >
              <Icon className="size-5" />
              <div className="mt-3 text-3xl font-semibold">{counts[tile.status]}</div>
              <div className="mt-1 text-sm">{tile.label}</div>
            </button>
          );
        })}
      </div>

      {openStatus && (
        <Modal
          open
          onClose={() => setOpenStatus(null)}
          title={`${STATUS_TILES.find((t) => t.status === openStatus)!.label} Connections`}
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
                      <p className="truncate text-sm font-medium">{row.vaName}</p>
                      <p className="truncate text-xs text-muted">{row.clientName}</p>
                    </div>
                    <StatusBadge status={row.status} />
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
          isManager
          interventionTypes={interventionTypes}
          onClose={() => setOpenConnectionId(null)}
        />
      )}
    </>
  );
}
