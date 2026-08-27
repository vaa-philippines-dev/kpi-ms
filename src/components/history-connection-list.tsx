"use client";

import { useMemo, useState } from "react";
import type { Connection, Department } from "@/generated/prisma/client";
import { PerformanceStatus } from "@/generated/prisma/enums";
import type { ConnectionTrendPoint } from "@/lib/connection-trend";
import { ConnectionStatusTrend } from "@/components/connection-status-trend";

export type HistoryCard = {
  connection: Connection & { department: Department };
  points: ConnectionTrendPoint[];
};

const FILTERS: { status: PerformanceStatus; label: string; dotClass: string }[] = [
  { status: PerformanceStatus.ON_TARGET, label: "On Target", dotClass: "bg-success" },
  { status: PerformanceStatus.AT_RISK, label: "At Risk", dotClass: "bg-warning" },
  { status: PerformanceStatus.CRITICAL, label: "Critical", dotClass: "bg-danger" },
  { status: PerformanceStatus.NO_DATA, label: "No Data", dotClass: "bg-surface-border" },
];
const DOT_CLASS_BY_STATUS = new Map(FILTERS.map((f) => [f.status, f.dotClass]));

// A connection with nothing submitted for the latest period shown is
// treated the same as an explicit NO_DATA submission for filtering — both
// mean "nothing useful to review right now," which is exactly the clutter
// this filter defaults to hiding. The trend chart itself still tells the
// two apart (see ConnectionStatusTrend's dashed "not submitted" lane).
function latestFilterStatus(points: ConnectionTrendPoint[]): PerformanceStatus {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].status !== null) return points[i].status!;
  }
  return PerformanceStatus.NO_DATA;
}

/**
 * The VA-facing History page's connection picker — pulled into its own
 * client component for two reasons: the on-page status filter (defaulting
 * to hiding No Data, since most VAs have far more connections than ones
 * worth reviewing this week) needs to filter without a full page
 * round-trip, and a VA with several connections gets a tab strip instead of
 * every connection's chart stacked one under another — all the data for
 * every connection is already fetched up front (see history/page.tsx), so
 * switching tabs is an instant client-side swap, not a new page load.
 * Filters/tabs on each connection's most recent status in the shown window,
 * not every point in its trend — the chart underneath still shows the
 * connection's full history regardless of which tab is active.
 */
export function HistoryConnectionList({ cards, isMonthly }: { cards: HistoryCard[]; isMonthly: boolean }) {
  const [activeStatuses, setActiveStatuses] = useState<Set<PerformanceStatus>>(
    () =>
      new Set([
        PerformanceStatus.ON_TARGET,
        PerformanceStatus.AT_RISK,
        PerformanceStatus.CRITICAL,
      ]),
  );
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);

  function toggle(status: PerformanceStatus) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const visibleCards = useMemo(
    () => cards.filter((c) => activeStatuses.has(latestFilterStatus(c.points))),
    [cards, activeStatuses],
  );

  // Falls back to the first visible card whenever the active one isn't (or
  // is no longer, after a filter toggle) in the visible set, rather than
  // tracking that with an effect.
  const activeCard =
    visibleCards.find((c) => c.connection.id === activeConnectionId) ?? visibleCards[0];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Show:</span>
        {FILTERS.map(({ status, label, dotClass }) => {
          const active = activeStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggle(status)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-surface-border bg-surface-hover text-foreground"
                  : "border-surface-border/60 text-muted hover:text-foreground"
              }`}
            >
              <span className={`size-2 rounded-full ${dotClass} ${active ? "" : "opacity-40"}`} />
              {label}
            </button>
          );
        })}
      </div>

      {visibleCards.length === 0 ? (
        <p className="rounded-xl border border-surface-border bg-surface p-5 text-sm text-muted">
          No connections match the selected filters.
        </p>
      ) : (
        <>
          {visibleCards.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5 border-b border-surface-border pb-2">
              {visibleCards.map(({ connection, points }) => {
                const isActive = connection.id === activeCard?.connection.id;
                return (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => setActiveConnectionId(connection.id)}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-surface-hover text-foreground"
                        : "text-muted hover:bg-surface-hover/50 hover:text-foreground"
                    }`}
                  >
                    <span className={`size-2 rounded-full ${DOT_CLASS_BY_STATUS.get(latestFilterStatus(points))}`} />
                    {connection.clientName}
                  </button>
                );
              })}
            </div>
          )}

          {activeCard && (
            <div
              key={activeCard.connection.id}
              className="rounded-xl border border-surface-border bg-surface p-5"
            >
              <h2 className="text-sm font-semibold">{activeCard.connection.clientName}</h2>
              <p className="mb-4 text-xs text-muted">{activeCard.connection.department.name}</p>
              <ConnectionStatusTrend points={activeCard.points} isMonthly={isMonthly} />
            </div>
          )}
        </>
      )}
    </>
  );
}
