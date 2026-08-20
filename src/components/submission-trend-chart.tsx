"use client";

import { useState } from "react";
import type { SubmissionTrendPoint } from "@/lib/submission-trend";
import { smoothLinePath, type Point } from "@/lib/svg-path";

const WIDTH = 480;
const HEIGHT = 160;
const PAD_X = 6;
const PAD_TOP = 14;

/** Legacy's submission-rate thresholds: >=80% healthy, >=60% at risk, else critical. */
function rateStroke(pct: number): string {
  if (pct >= 80) return "stroke-success";
  if (pct >= 60) return "stroke-warning";
  return "stroke-danger";
}
function rateFill(pct: number): string {
  if (pct >= 80) return "fill-success";
  if (pct >= 60) return "fill-warning";
  return "fill-danger";
}

/**
 * Single-line submission-rate trend — mirrors legacy's Submission Trend
 * chart (AppSettings.html `_renderSubTrendChart`), redrawn to match
 * PerformanceTrendChart's register: smoothed line, dashed 60/80% reference
 * lines, a crosshair + tooltip listing submitted/total on hover.
 */
export function SubmissionTrendChart({ points }: { points: SubmissionTrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.every((p) => p.total === 0)) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No connections in this window yet.
      </p>
    );
  }

  const xStep = points.length > 1 ? (WIDTH - PAD_X * 2) / (points.length - 1) : 0;
  const xAt = (i: number) => PAD_X + i * xStep;
  const yAt = (pct: number) => HEIGHT - (pct / 100) * (HEIGHT - PAD_TOP);

  const linePoints: Point[] = points.map((p, i) => ({ x: xAt(i), y: yAt(p.ratePct) }));
  const pathD = smoothLinePath(linePoints);
  const last = points[points.length - 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const idx = Math.round((relX - PAD_X) / (xStep || 1));
    setHoverIndex(Math.min(Math.max(idx, 0), points.length - 1));
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Submission rate by period"
      >
        {[60, 80].map((threshold) => (
          <line
            key={threshold}
            x1={0}
            y1={yAt(threshold)}
            x2={WIDTH}
            y2={yAt(threshold)}
            className="stroke-surface-border"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}

        <path
          d={pathD}
          className={rateStroke(last.ratePct)}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <circle
            key={p.periodStart.toISOString()}
            cx={xAt(i)}
            cy={yAt(p.ratePct)}
            r={i === points.length - 1 ? 3.5 : 2.5}
            className={rateFill(p.ratePct)}
            stroke="var(--surface)"
            strokeWidth={i === points.length - 1 ? 2 : 0}
          />
        ))}

        {hoverX !== null && (
          <line
            x1={hoverX}
            y1={PAD_TOP - 6}
            x2={hoverX}
            y2={HEIGHT}
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

      <div className="pointer-events-none absolute top-0 right-0 text-right">
        <span className="text-xs font-semibold text-foreground">{last.ratePct}%</span>
        <span className="ml-1 text-[10.5px] text-muted">latest</span>
      </div>

      {hovered && hoverX !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-40 rounded-lg border border-surface-border bg-surface p-2.5 text-xs shadow-lg"
          style={{
            left: `${(hoverX / WIDTH) * 100}%`,
            transform:
              hoverX / WIDTH > 0.75
                ? "translateX(-90%)"
                : hoverX / WIDTH < 0.25
                  ? "translateX(-10%)"
                  : "translateX(-50%)",
          }}
        >
          <p className="mb-1.5 font-medium text-foreground">
            {hovered.periodStart.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Submitted</span>
              <span className="font-medium text-foreground">
                {hovered.submitted}/{hovered.total}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Rate</span>
              <span className="font-medium text-foreground">{hovered.ratePct}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="relative mt-2 h-4 text-[10.5px] text-muted">
        {points.map((p, i) => {
          const pct = (xAt(i) / WIDTH) * 100;
          return (
            <span
              key={p.periodStart.toISOString()}
              className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
              style={{ left: `${pct}%` }}
            >
              {p.periodStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          );
        })}
      </div>
    </div>
  );
}
