"use client";

import { useMemo, useState } from "react";
import { smoothLinePath, type Point } from "@/lib/svg-path";

export type KpiTrendSeries = {
  id: string;
  name: string;
  points: { periodStart: Date; pct: number }[];
};

// Fixed hue order — dataviz skill's validated categorical palette, one slot
// per KPI. Assigned by index and never reassigned when a series drops out,
// so a KPI keeps the same color everywhere it's charted.
const SERIES_CLASSES = [
  { stroke: "stroke-series-1", fill: "fill-series-1" },
  { stroke: "stroke-series-2", fill: "fill-series-2" },
  { stroke: "stroke-series-3", fill: "fill-series-3" },
  { stroke: "stroke-series-4", fill: "fill-series-4" },
  { stroke: "stroke-series-5", fill: "fill-series-5" },
  { stroke: "stroke-series-6", fill: "fill-series-6" },
  { stroke: "stroke-series-7", fill: "fill-series-7" },
  { stroke: "stroke-series-8", fill: "fill-series-8" },
] as const;

const WIDTH = 320;
const HEIGHT = 210;
const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 10;
const TARGET_PCT = 100;

/**
 * One small chart per KPI (small multiples) rather than every KPI overlaid
 * on a single shared chart — with more than a couple of KPIs the overlaid
 * lines and hover tooltip became hard to tell apart, so each series gets
 * its own card and axis and can be read independently.
 */
function SingleKpiChart({
  series,
  colorClass,
}: {
  series: KpiTrendSeries;
  colorClass: (typeof SERIES_CLASSES)[number];
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const sortedPoints = useMemo(
    () => series.points.slice().sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime()),
    [series.points],
  );

  const minT = sortedPoints[0]?.periodStart.getTime() ?? 0;
  const maxT = sortedPoints[sortedPoints.length - 1]?.periodStart.getTime() ?? 0;
  const spanT = maxT - minT || 1;
  const xAt = (t: number) => PAD_X + ((t - minT) / spanT) * (WIDTH - PAD_X * 2);

  const dataMax = Math.max(TARGET_PCT, ...sortedPoints.map((p) => p.pct));
  const yMax = Math.max(100, Math.ceil((dataMax * 1.1) / 25) * 25);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const yAt = (v: number) => PAD_TOP + plotHeight - (v / yMax) * plotHeight;

  const line = sortedPoints.map((p) => ({
    x: xAt(p.periodStart.getTime()),
    y: yAt(p.pct),
    pct: p.pct,
    periodStart: p.periodStart,
  }));

  if (line.length === 0) return null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    line.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? line[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="aspect-[320/210] w-full overflow-visible"
        role="img"
        aria-label={`${series.name} performance trend, percent of target over time`}
      >
        <line
          x1={0}
          y1={yAt(TARGET_PCT)}
          x2={WIDTH}
          y2={yAt(TARGET_PCT)}
          className="stroke-surface-border"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text x={WIDTH} y={yAt(TARGET_PCT) - 4} textAnchor="end" className="fill-muted text-[9px]">
          Target
        </text>

        <line
          x1={0}
          y1={HEIGHT - PAD_BOTTOM + 0.5}
          x2={WIDTH}
          y2={HEIGHT - PAD_BOTTOM + 0.5}
          className="stroke-surface-border"
          strokeWidth={1}
        />

        <path
          d={smoothLinePath(line as Point[])}
          fill="none"
          className={colorClass.stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={line[line.length - 1].x}
          cy={line[line.length - 1].y}
          r={3}
          className={colorClass.fill}
          stroke="var(--surface)"
          strokeWidth={1.5}
        />

        {hovered && (
          <>
            <line
              x1={hovered.x}
              y1={PAD_TOP - 4}
              x2={hovered.x}
              y2={HEIGHT - PAD_BOTTOM}
              className="stroke-surface-border"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={3.5} className={colorClass.fill} />
          </>
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

      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-36 rounded-lg border border-surface-border bg-surface p-2 text-xs shadow-lg"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
            transform:
              hovered.x / WIDTH > 0.75
                ? "translateX(-95%)"
                : hovered.x / WIDTH < 0.25
                  ? "translateX(-5%)"
                  : "translateX(-50%)",
          }}
        >
          <p className="font-medium text-foreground">
            {hovered.periodStart.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
          <p className="text-muted">{Math.round(hovered.pct)}% of target</p>
        </div>
      )}
    </div>
  );
}

export function ClientKpiTrendChart({ series }: { series: KpiTrendSeries[] }) {
  const chartable = series.filter((s) => s.points.length > 0);
  if (chartable.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {chartable.map((s, i) => (
        <div key={s.id} className="rounded-xl border border-surface-border p-4">
          <p className="mb-2 text-sm font-medium">{s.name}</p>
          <SingleKpiChart series={s} colorClass={SERIES_CLASSES[i % SERIES_CLASSES.length]} />
        </div>
      ))}
    </div>
  );
}
