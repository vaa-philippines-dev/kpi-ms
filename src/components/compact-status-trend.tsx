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

const LEVEL: Partial<Record<PerformanceStatus, number>> = {
  [PerformanceStatus.CRITICAL]: 0,
  [PerformanceStatus.AT_RISK]: 1,
  [PerformanceStatus.ON_TARGET]: 2,
};

const WIDTH = 480;
const HEIGHT = 60;
const PAD_X = 8;
const PAD_TOP = 6;
const SCALE_BOTTOM = 36;
const GAP_LANE_Y = 50;

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A compact, dashboard-sized cut of ConnectionStatusTrend (components/
 * connection-status-trend.tsx) — same scale, dates, and hover tooltip, but
 * with the click-to-pin "actual KPI values for this period" panel dropped
 * entirely. That panel is what makes the real History page useful for a
 * deep look at one period; here it would just make a dashboard teaser card
 * tall for no reason, so a further look is a click away at /dashboard/history
 * instead.
 */
export function CompactStatusTrend({ points }: { points: ConnectionTrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const xStep = points.length > 1 ? (WIDTH - PAD_X * 2) / (points.length - 1) : 0;
  const xAt = (i: number) => PAD_X + i * xStep;
  const yAt = (level: number) => SCALE_BOTTOM - (level / 2) * (SCALE_BOTTOM - PAD_TOP);

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
        aria-label="Status trend"
      >
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
                r={isHovered ? 3.5 : 2.5}
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
              r={isHovered ? 3.5 : 2.5}
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
          <p className="font-medium text-foreground">{formatDate(hovered.periodStart)}</p>
          <p className={`mt-0.5 ${hovered.status ? "" : "text-muted"}`}>
            {hovered.status ? STATUS_LABEL[hovered.status] : "Not submitted"}
          </p>
        </div>
      )}

      <div className="relative mt-1 h-3.5 text-[10px] text-muted">
        {points.map((p, i) => {
          const pct = (xAt(i) / WIDTH) * 100;
          return (
            <span
              key={p.periodStart.toISOString()}
              className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
              style={{ left: `${pct}%` }}
            >
              {formatDate(p.periodStart)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
