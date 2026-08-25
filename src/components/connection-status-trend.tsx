"use client";

import { useMemo, useState, type PointerEvent } from "react";
import type { ConnectionTrendPoint } from "@/lib/connection-trend";
import { PerformanceStatus } from "@/generated/prisma/enums";

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

const STATUS_STROKE_CLASS: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "stroke-success",
  [PerformanceStatus.AT_RISK]: "stroke-warning",
  [PerformanceStatus.CRITICAL]: "stroke-danger",
  [PerformanceStatus.NO_DATA]: "stroke-surface-border",
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

const WIDTH = 480;
const HEIGHT = 92;
const PAD_X = 8;
const PAD_TOP = 8;
const SCALE_BOTTOM = 54;
const GAP_LANE_Y = 74;

function formatDate(d: Date, isMonthly: boolean) {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: isMonthly ? undefined : "numeric",
    year: undefined,
    timeZone: "UTC",
  });
}

/**
 * Per-connection status-over-time chart — a connected line through the
 * three ranked statuses (Critical/At Risk/On Target), with a separate lane
 * beneath the scale for periods with no data at all, so those don't read as
 * "worse than critical." Replaces the old isolated-dot row on the History
 * page with something you can actually trace a trend through, plus a real
 * hover tooltip instead of relying on the native title attribute.
 */
export function ConnectionStatusTrend({
  points,
  isMonthly,
}: {
  points: ConnectionTrendPoint[];
  isMonthly: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  function handlePointerMove(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const idx = Math.round((relX - PAD_X) / (xStep || 1));
    setHoverIndex(Math.min(Math.max(idx, 0), points.length - 1));
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
          if (!p.status) {
            return (
              <circle
                key={i}
                cx={xAt(i)}
                cy={y}
                r={isHovered ? 4.5 : 3.5}
                className="fill-surface stroke-surface-border"
                strokeWidth={1.5}
                strokeDasharray="2 1.5"
              />
            );
          }
          return (
            <circle
              key={i}
              cx={xAt(i)}
              cy={y}
              r={isHovered ? 4.5 : 3.5}
              className={STATUS_DOT_CLASS[p.status]}
              stroke="var(--surface)"
              strokeWidth={1.5}
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
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
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

      <div className="relative mt-1.5 h-4 text-[10px] text-muted">
        {points.map((p, i) => {
          const pct = (xAt(i) / WIDTH) * 100;
          return (
            <span
              key={p.periodStart.toISOString()}
              className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
              style={{ left: `${pct}%` }}
            >
              {formatDate(p.periodStart, isMonthly)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
