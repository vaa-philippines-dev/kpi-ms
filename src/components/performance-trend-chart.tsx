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
const PAD_LEFT = 28; // room for the y-axis tick labels
const PAD_RIGHT = 6;
const PAD_TOP = 14;

/**
 * Round, evenly-spaced axis ticks from 0 to a value at least as large as
 * `maxValue` — e.g. 18 -> [0, 5, 10, 15, 20] rather than the raw max, so the
 * gridlines land on numbers a reader would actually pick. Values here are
 * always whole connection counts, so the step is never let drop below 1.
 */
function niceTicks(maxValue: number, targetCount = 4): number[] {
  if (maxValue <= 0) return [0, 1];
  const rawStep = maxValue / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  const step = Math.max(1, Math.round(niceResidual * magnitude));
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax; v += step) ticks.push(v);
  return ticks;
}

/**
 * Standard (non-stacked) system-wide status trend — mirrors legacy's
 * "Performance Overview" chart in a lighter, iOS/macOS-Health-app register:
 * thin catmull-rom-smoothed lines, a soft wash under each, a crosshair + one
 * tooltip listing every series on hover.
 *
 * Deliberately NOT a stacked area: Ian flagged the previous stacked version
 * as misleading (2026-08-24 dept meeting) — stacking At Risk/Critical/No
 * Data on top of On Target made a series's on-screen height depend on every
 * other series drawn below it, so a band could visually grow even when its
 * own count hadn't changed. Each band is now plotted independently against
 * the same zero baseline, so its height only ever reflects its own value.
 */
export function PerformanceTrendChart({ points }: { points: TrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const max = Math.max(...points.flatMap((p) => BANDS.map((band) => p[band.key])), 1);
  const ticks = useMemo(() => niceTicks(max), [max]);
  const niceMax = ticks[ticks.length - 1];

  const xStep = points.length > 1 ? (WIDTH - PAD_LEFT - PAD_RIGHT) / (points.length - 1) : 0;
  const xAt = (i: number) => PAD_LEFT + i * xStep;
  const yAt = (v: number) => HEIGHT - (v / niceMax) * (HEIGHT - PAD_TOP);

  // Each band's own line, plus a shared zero baseline to fill down to —
  // independent curves rather than cumulative boundaries, so nothing here
  // stacks.
  const { baseline, seriesLines } = useMemo(() => {
    const baseline = points.map((_, i) => ({ x: xAt(i), y: yAt(0) }));
    const seriesLines = new Map<(typeof BANDS)[number]["key"], Point[]>();
    for (const band of BANDS) {
      seriesLines.set(
        band.key,
        points.map((p, i) => ({ x: xAt(i), y: yAt(p[band.key]) })),
      );
    }
    return { baseline, seriesLines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, max]);

  if (points.every((p) => BANDS.every((band) => p[band.key] === 0))) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No performance data in this window yet.
      </p>
    );
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const idx = Math.round((relX - PAD_LEFT) / (xStep || 1));
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
        {/* Vertical gridlines, one per period — kept faint so they read as
            structure rather than competing with the series lines. */}
        {points.map((_, i) => (
          <line
            key={`v-${i}`}
            x1={xAt(i)}
            y1={PAD_TOP - 6}
            x2={xAt(i)}
            y2={HEIGHT}
            className="stroke-surface-border"
            strokeWidth={1}
            opacity={0.35}
          />
        ))}

        {/* Horizontal gridlines at each rounded tick, with the value
            labeled to the left — the "premium" axis treatment. */}
        {ticks.map((t) => (
          <g key={`h-${t}`}>
            <line
              x1={PAD_LEFT}
              y1={yAt(t)}
              x2={WIDTH}
              y2={yAt(t)}
              className="stroke-surface-border"
              strokeWidth={1}
              opacity={0.6}
            />
            <text
              x={PAD_LEFT - 6}
              y={yAt(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted"
              fontSize={9.5}
            >
              {t}
            </text>
          </g>
        ))}

        {BANDS.map((band) => {
          const line = seriesLines.get(band.key)!;
          return (
            <g key={band.key}>
              <path
                d={smoothBandPath(line, baseline)}
                className={band.fill}
                fillOpacity={0.1}
                stroke="none"
              />
              <path
                d={smoothLinePath(line)}
                className={band.stroke}
                fill="none"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Endpoint dot on this series' own final value — each band
                  labels itself directly instead of sharing one stacked total. */}
              <circle
                cx={line[line.length - 1].x}
                cy={line[line.length - 1].y}
                r={2.5}
                className={band.fill}
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            </g>
          );
        })}

        {hoverX !== null && (
          <line
            x1={hoverX}
            y1={PAD_TOP - 6}
            x2={hoverX}
            y2={HEIGHT}
            className="stroke-muted"
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
