"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import type { ConnectionWeekDetail } from "@/app/dashboard/performance/actions";
import type { KpiConfigGroupRow } from "@/app/dashboard/connections/kpi-config/actions";
import { KpiDirection } from "@/generated/prisma/enums";

export type MyKpiCard = {
  connectionId: string;
  clientName: string;
  departmentName: string;
  weekly: ConnectionWeekDetail;
  monthly: ConnectionWeekDetail;
  configRows: KpiConfigGroupRow[];
};

function DirIndicator({ direction }: { direction: KpiDirection }) {
  return direction === KpiDirection.LOWER_IS_BETTER ? (
    <ArrowDown className="size-3.5 text-warning" aria-label="Lower is better" />
  ) : (
    <ArrowUp className="size-3.5 text-success" aria-label="Higher is better" />
  );
}

/**
 * Purely informational — this page is a VA's read-only look at what their
 * KPI metrics currently are, not a place to act on them (no Submit CTA, no
 * "you're behind" nagging — that workflow already lives on the Dashboard's
 * Active Connections grid and the History page).
 */
function ActualsTable({ label, detail }: { label: string; detail: ConnectionWeekDetail }) {
  if (detail.kpiRows.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold text-muted uppercase">{label}</h3>
      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover/60 text-xs text-muted uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-medium">KPI</th>
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
                <td className="px-3 py-2 text-muted">
                  {r.targetValue}
                  {r.unit ? ` ${r.unit}` : ""}
                </td>
                <td className="px-3 py-2 text-muted">{r.actualValue ?? "—"}</td>
                <td className="px-3 py-2 text-center">
                  <DirIndicator direction={r.direction} />
                </td>
                <td className="px-3 py-2">
                  {r.submitted ? (
                    <StatusBadge status={r.status} />
                  ) : (
                    <span className="text-xs text-muted">Not submitted</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Read-only mirror of the manager-facing KpiConfigPanel table (see
 * components/kpi-config-panel.tsx) — same columns, same Custom/Default
 * language, no edit affordances. `onlyApplicable` (lifted to the page so one
 * toggle governs every connection's table at once) hides KPIs this
 * connection's KpiConfig has marked not-applicable, which otherwise pad out
 * the list with rows a VA never actually submits against.
 */
function ConfigTable({ rows, onlyApplicable }: { rows: KpiConfigGroupRow[]; onlyApplicable: boolean }) {
  const visible = onlyApplicable ? rows.filter((r) => r.isApplicable) : rows;
  const hiddenCount = rows.length - visible.length;

  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted uppercase">KPI Configuration</h3>
        {rows.some((r) => r.hasOverride) ? (
          <Badge tone="success">Custom Config</Badge>
        ) : (
          <Badge tone="warning">Using Defaults</Badge>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-surface-border py-4 text-center text-xs text-muted">
          {hiddenCount} KPI{hiddenCount === 1 ? "" : "s"} configured, but none apply to this
          connection.
        </p>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>KPI</Th>
              <Th>Weekly Target</Th>
              <Th>Monthly Target</Th>
              <Th>Deviation</Th>
              <Th>At Risk Max</Th>
              <Th>Config</Th>
            </tr>
          </TableHead>
          <tbody>
            {visible.map((r) => (
              <Tr key={r.key}>
                <Td>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted">{r.cluster}</div>
                </Td>
                <Td>{r.weekly ? r.weekly.targetValue : "—"}</Td>
                <Td>{r.monthly ? r.monthly.targetValue : "—"}</Td>
                <Td className="text-warning">{r.deviationThresholdPct}%</Td>
                <Td className="text-danger">{r.criticalThresholdPct}%</Td>
                <Td>
                  {r.hasOverride ? (
                    <span className="text-xs font-medium text-success">Custom</span>
                  ) : (
                    <span className="text-xs text-muted">Default</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {onlyApplicable && hiddenCount > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          {hiddenCount} not-applicable KPI{hiddenCount === 1 ? "" : "s"} hidden.
        </p>
      )}
    </div>
  );
}

export function MyKpiView({ cards }: { cards: MyKpiCard[] }) {
  const [onlyApplicable, setOnlyApplicable] = useState(true);
  const [activeId, setActiveId] = useState(cards[0]?.connectionId);
  const active = cards.find((c) => c.connectionId === activeId) ?? cards[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Client switcher — same tab-strip pattern as History's connection
            picker (components/history-connection-list.tsx), so a VA with
            several clients isn't stuck scrolling past every one's tables
            stacked on top of each other. Only shown once there's more than
            one to switch between. */}
        {cards.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {cards.map((c) => {
              const isActive = c.connectionId === active?.connectionId;
              const hasOverride = c.configRows.some((r) => r.hasOverride);
              return (
                <button
                  key={c.connectionId}
                  type="button"
                  onClick={() => setActiveId(c.connectionId)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-surface-hover text-foreground"
                      : "text-muted hover:bg-surface-hover/50 hover:text-foreground"
                  }`}
                >
                  <span className={`size-2 rounded-full ${hasOverride ? "bg-success" : "bg-surface-border"}`} />
                  {c.clientName}
                </button>
              );
            })}
          </div>
        ) : (
          <div />
        )}

        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted select-none">
          Only show KPIs I use
          <button
            type="button"
            role="switch"
            aria-checked={onlyApplicable}
            onClick={() => setOnlyApplicable((v) => !v)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${
              onlyApplicable ? "bg-accent" : "bg-surface-border"
            }`}
          >
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${
                onlyApplicable ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
        </label>
      </div>

      {active && (
        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <div>
            <h2 className="text-sm font-semibold">{active.clientName}</h2>
            <p className="text-xs text-muted">{active.departmentName}</p>
          </div>

          <ActualsTable label="This Week" detail={active.weekly} />
          <ActualsTable label="This Month" detail={active.monthly} />
          <ConfigTable rows={active.configRows} onlyApplicable={onlyApplicable} />

          {active.weekly.kpiRows.length === 0 &&
            active.monthly.kpiRows.length === 0 &&
            active.configRows.length === 0 && (
              <p className="mt-3 text-xs text-muted">
                No KPIs are configured for {active.departmentName} yet.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
