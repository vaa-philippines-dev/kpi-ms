"use client";

import { X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { PerformanceStatus } from "@/generated/prisma/enums";

export type ConnectionKpiRow = {
  name: string;
  target: number;
  actual: number | null;
  status: PerformanceStatus;
};

/**
 * Per-KPI actual/target/status drill-down for one connection, one period —
 * mirrors legacy's `openConnWeekDetail()` / `openDashCardDetail()` modal
 * (AppSettings.html / AppDashboards.html). Shared by the Team Leader
 * dashboard's connection cards and the CS Specialist dashboard's
 * system-wide status table — same modal, different launch points.
 */
export function ConnectionKpiModal({
  clientName,
  vaName,
  subtitle,
  kpiRows,
  onClose,
}: {
  clientName: string;
  vaName: string;
  subtitle: string;
  kpiRows: ConnectionKpiRow[];
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={clientName}
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-modal-pop relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-6 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted transition hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <h2 className="text-lg font-semibold tracking-tight">{clientName}</h2>
        <p className="mb-4 text-xs text-muted">
          {vaName} · {subtitle}
        </p>

        {kpiRows.length === 0 ? (
          <p className="text-sm text-muted">No KPIs configured for this connection.</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {kpiRows.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-surface-border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {r.actual ?? "—"}/{r.target}
                </span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
