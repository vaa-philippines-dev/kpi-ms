"use client";

import { useMemo, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ConnectionTrendPoint } from "@/lib/connection-trend";
import { StatusBadge } from "@/components/status-badge";
import { KpiDirection, PerformanceStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "On Target",
  [PerformanceStatus.AT_RISK]: "At Risk",
  [PerformanceStatus.CRITICAL]: "Critical",
  [PerformanceStatus.NO_DATA]: "No Data",
};

const STATUS_DOT_CLASS: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "fill-success",
  [PerformanceStatus.AT_RISK]: "fill-warning",
  [PerformanceStatus.CRITICAL]: "fill-danger",
  [PerformanceStatus.NO_DATA]: "fill-surface-border",
};

// Only these three carry a real "how are we doing" ordering — NO_DATA (a
// submission that explicitly had nothing to report) and null (nothing
// submitted at all) both live in a separate lane below the scale instead of
// pretending to rank worse than Critical.
const LEVEL: Partial<Record<PerformanceStatus, number>> = {
  [PerformanceStatus.CRITICAL]: 0,
  [PerformanceStatus.AT_RISK]: 1,
  [PerformanceStatus.ON_TARGET]: 2,
};

// Compact — roughly 2/3 the height of the original chart, freeing up room
// for the actual-KPI-values detail panel below without lengthening the page.
const WIDTH = 480;
const HEIGHT = 60;
const PAD_X = 8;
const PAD_TOP = 6;
const SCALE_BOTTOM = 36;
const GAP_LANE_Y = 50;

function formatDate(d: Date, isMonthly: boolean) {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: isMonthly ? undefined : "numeric",
    year: undefined,
    timeZone: "UTC",
  });
}

function DirIndicator({ direction }: { direction: KpiDirection }) {
  return direction === KpiDirection.LOWER_IS_BETTER ? (
    <ArrowDown className="size-3 text-warning" aria-label="Lower is better" />
  ) : (
    <ArrowUp className="size-3 text-success" aria-label="Higher is better" />
  );
}

/**
 * Per-connection status-over-time chart — a connected line through the
 * three ranked statuses (Critical/At Risk/On Target), with a separate lane
 * beneath the scale for periods with no data at all, so those don't read as
 * "worse than critical." A hover tooltip gives a quick date+status glance;
 * clicking a point (or its date label) pins that period below the chart as
 * a full table of the actual KPI values behind the rolled-up status — the
 * graph itself only ever encodes status, on purpose (that's what makes a
 * multi-period trend scannable), so the real numbers live in this separate
 * panel instead of being crammed into the chart.
 */
export function ConnectionStatusTrend({
  points,
  isMonthly,
}: {
  points: ConnectionTrendPoint[];
  isMonthly: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const lastSubmittedIndex = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].status !== null) return i;
    }
    return points.length - 1;
  }, [points]);
  const [selectedIndex, setSelectedIndex] = useState(lastSubmittedIndex);
  const selected = points[Math.min(selectedIndex, points.length - 1)] as
    | ConnectionTrendPoint
    | undefined;

  const xStep = points.length > 1 ? (WIDTH - PAD_X * 2) / (points.length - 1) : 0;
  const xAt = (i: number) => PAD_X + i * xStep;
  const yAt = (level: number) => SCALE_BOTTOM - (level / 2) * (SCALE_BOTTOM - PAD_TOP);

  // Contiguous runs of ranked statuses become connected polyline segments;
  // a gap-lane point (No Data / not submitted) always breaks the run, so
  // the line never implies a value through an unranked period.
  const runs = useMemo(() => {
    const result: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];
    points.forEach((p, i) => {
      const level = p.status ? LEVEL[p.status] : undefined;
      if (level === undefined) {
        if (current.length) result.push(current);
        current = [];
        return;
      }
      current.push({ x: xAt(i), y: yAt(level) });
    });
    if (current.length) result.push(current);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  function indexAtClientX(clientX: number, rect: DOMRect) {
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    const idx = Math.round((relX - PAD_X) / (xStep || 1));
    return Math.min(Math.max(idx, 0), points.length - 1);
  }

  function handlePointerMove(e: PointerEvent<SVGRectElement>) {
    setHoverIndex(indexAtClientX(e.clientX, e.currentTarget.getBoundingClientRect()));
  }

  function handleClick(e: PointerEvent<SVGRectElement>) {
    setSelectedIndex(indexAtClientX(e.clientX, e.currentTarget.getBoundingClientRect()));
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Status trend, ${isMonthly ? "monthly" : "weekly"}`}
      >
        {/* Scale guide lines for the three ranked rows, plus a dashed
            separator above the gap lane. */}
        {[0, 1, 2].map((level) => (
          <line
            key={level}
            x1={0}
            y1={yAt(level)}
            x2={WIDTH}
            y2={yAt(level)}
            className="stroke-surface-border"
            strokeWidth={1}
            strokeOpacity={0.5}
          />
        ))}
        <line
          x1={0}
          y1={(SCALE_BOTTOM + GAP_LANE_Y) / 2}
          x2={WIDTH}
          y2={(SCALE_BOTTOM + GAP_LANE_Y) / 2}
          className="stroke-surface-border"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {runs.map((run, i) => (
          <polyline
            key={i}
            points={run.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            className="stroke-accent"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {points.map((p, i) => {
          const level = p.status ? LEVEL[p.status] : undefined;
          const y = level !== undefined ? yAt(level) : GAP_LANE_Y;
          const isHovered = hoverIndex === i;
          const isSelected = selectedIndex === i;
          const ringProps = isSelected
            ? { stroke: "var(--accent)", strokeWidth: 2 }
            : { stroke: "var(--surface)", strokeWidth: 1.5 };
          if (!p.status) {
            return (
              <circle
                key={i}
                cx={xAt(i)}
                cy={y}
                r={isHovered || isSelected ? 4.5 : 3.5}
                className="fill-surface stroke-surface-border"
                strokeWidth={isSelected ? 2 : 1.5}
                strokeDasharray={isSelected ? undefined : "2 1.5"}
              />
            );
          }
          return (
            <circle
              key={i}
              cx={xAt(i)}
              cy={y}
              r={isHovered || isSelected ? 4.5 : 3.5}
              className={STATUS_DOT_CLASS[p.status]}
              {...ringProps}
            />
          );
        })}

        {hoverX !== null && (
          <line
            x1={hoverX}
            y1={0}
            x2={hoverX}
            y2={GAP_LANE_Y + 6}
            className="stroke-surface-border"
            strokeWidth={1}
          />
        )}

        <rect
          x={0}
          y={0}
          width={WIDTH}
          height={HEIGHT}
          fill="transparent"
          className="cursor-pointer"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
          onClick={handleClick}
        />
      </svg>

      {hovered && hoverX !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-32 rounded-lg border border-surface-border bg-surface p-2 text-xs shadow-lg"
          style={{
            left: `${(hoverX / WIDTH) * 100}%`,
            transform:
              hoverX / WIDTH > 0.75
                ? "translateX(-95%)"
                : hoverX / WIDTH < 0.25
                  ? "translateX(-5%)"
                  : "translateX(-50%)",
          }}
        >
          <p className="font-medium text-foreground">{formatDate(hovered.periodStart, isMonthly)}</p>
          <p className={`mt-0.5 ${hovered.status ? "" : "text-muted"}`}>
            {hovered.status ? STATUS_LABEL[hovered.status] : "Not submitted"}
          </p>
        </div>
      )}

      <div className="relative mt-1 h-3.5 text-[10px] text-muted">
        {points.map((p, i) => {
          const pct = (xAt(i) / WIDTH) * 100;
          return (
            <button
              key={p.periodStart.toISOString()}
              type="button"
              onClick={() => setSelectedIndex(i)}
              className={`absolute -translate-x-1/2 cursor-pointer whitespace-nowrap first:translate-x-0 last:-translate-x-full ${
                selectedIndex === i ? "font-semibold text-foreground" : "hover:text-foreground"
              }`}
              style={{ left: `${pct}%` }}
            >
              {formatDate(p.periodStart, isMonthly)}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-surface-border bg-surface-hover/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-foreground">
              {formatDate(selected.periodStart, isMonthly)}
            </p>
            {selected.status ? (
              <StatusBadge status={selected.status} />
            ) : (
              <span className="text-xs text-muted">Not submitted</span>
            )}
          </div>

          {selected.kpiRows.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-md border border-surface-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-hover/60 text-[10px] text-muted uppercase">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">KPI</th>
                    <th className="px-2 py-1.5 text-left font-medium">Target</th>
                    <th className="px-2 py-1.5 text-left font-medium">Actual</th>
                    <th className="px-2 py-1.5 text-center font-medium">Dir</th>
                    <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.kpiRows.map((r) => (
                    <tr key={r.kpiDefinitionId} className="border-t border-surface-border">
                      <td className="px-2 py-1.5 font-medium">{r.name}</td>
                      <td className="px-2 py-1.5 text-muted">
                        {r.targetValue}
                        {r.unit ? ` ${r.unit}` : ""}
                      </td>
                      <td className="px-2 py-1.5 text-muted">
                        {r.actualValue ?? "—"}
                        {r.actualValue !== null && r.unit ? ` ${r.unit}` : ""}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <DirIndicator direction={r.direction} />
                      </td>
                      <td className="px-2 py-1.5">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">Nothing was submitted for this period.</p>
          )}
        </div>
      )}
    </div>
  );
}
