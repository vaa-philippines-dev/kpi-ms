"use client";

import { useMemo, useState } from "react";
import type { TrendPoint } from "@/lib/trend";
import { smoothLinePath, smoothBandPath, type Point } from "@/lib/svg-path";

const BANDS = [
  { key: "onTarget", label: "On Target", fill: "fill-success", stroke: "stroke-success" },
  { key: "atRisk", label: "At Risk", fill: "fill-warning", stroke: "stroke-warning" },
  { key: "critical", label: "Critical", fill: "fill-danger", stroke: "stroke-danger" },
  { key: "noData", label: "No Data", fill: "fill-muted", stroke: "stroke-muted" },
] as const;

const WIDTH = 480;
const HEIGHT = 160;
const PAD_X = 6;
const PAD_TOP = 14;

/**
 * Smooth stacked-area system-wide status trend — mirrors legacy's
 * "Performance Overview" chart, redrawn in a lighter, iOS/macOS-Health-app
 * register: thin catmull-rom-smoothed boundaries, a soft wash under each
 * band, a crosshair + one tooltip listing every series on hover, and a
 * direct label on the final total rather than axis ticks on every value.
 */
export function PerformanceTrendChart({ points }: { points: TrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const totals = points.map((p) => p.onTarget + p.atRisk + p.critical + p.noData);
  const max = Math.max(...totals, 1);

  const xStep = points.length > 1 ? (WIDTH - PAD_X * 2) / (points.length - 1) : 0;
  const xAt = (i: number) => PAD_X + i * xStep;
  const yAt = (v: number) => HEIGHT - (v / max) * (HEIGHT - PAD_TOP);

  // Cumulative boundary curves, bottom-up: [0, onTarget, +atRisk, +critical, +noData].
  const boundaries = useMemo<Point[][]>(() => {
    const cum = new Array(points.length).fill(0);
    const lines: Point[][] = [points.map((_, i) => ({ x: xAt(i), y: yAt(0) }))];
    for (const band of BANDS) {
      points.forEach((p, i) => {
        cum[i] += p[band.key];
      });
      lines.push(cum.map((v: number, i: number) => ({ x: xAt(i), y: yAt(v) })));
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, max]);

  if (totals.every((t) => t === 0)) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No performance data in this window yet.
      </p>
    );
  }

  const grandTotal = totals[totals.length - 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredTotal = hoverIndex !== null ? totals[hoverIndex] : null;
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
        aria-label="System-wide performance status by period"
      >
        <line
          x1={0}
          y1={HEIGHT - 0.5}
          x2={WIDTH}
          y2={HEIGHT - 0.5}
          className="stroke-surface-border"
          strokeWidth={1}
        />

        {BANDS.map((band, i) => {
          const upper = boundaries[i + 1];
          const lower = boundaries[i];
          return (
            <g key={band.key}>
              <path
                d={smoothBandPath(upper, lower)}
                className={band.fill}
                fillOpacity={0.14}
                stroke="none"
              />
              <path
                d={smoothLinePath(upper)}
                className={band.stroke}
                fill="none"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* Endpoint marker + direct label on the grand total. */}
        <circle
          cx={xAt(points.length - 1)}
          cy={yAt(grandTotal)}
          r={3.5}
          className="fill-accent"
          stroke="var(--surface)"
          strokeWidth={2}
        />

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

        {/* Transparent overlay carrying the hover/crosshair hit area. */}
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
        <span className="text-xs font-semibold text-foreground">{grandTotal}</span>
        <span className="ml-1 text-[10.5px] text-muted">total</span>
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
            <span className="ml-1.5 font-normal text-muted">
              · {hoveredTotal} total
            </span>
          </p>
          <div className="space-y-1">
            {BANDS.map((band) => (
              <div key={band.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className={`h-0.5 w-3 rounded-full ${band.stroke.replace("stroke-", "bg-")}`} />
                  {band.label}
                </span>
                <span className="font-medium text-foreground">{hovered[band.key]}</span>
              </div>
            ))}
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

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {BANDS.map((band) => (
          <div key={band.key} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`h-1.5 w-3 rounded-sm ${band.stroke.replace("stroke-", "bg-")}`} />
            {band.label}
          </div>
        ))}
      </div>
    </div>
  );
}
