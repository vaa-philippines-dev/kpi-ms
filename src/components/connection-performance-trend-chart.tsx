"use client";

import { useMemo, useState, type PointerEvent } from "react";
import { smoothLinePath, type Point } from "@/lib/svg-path";
import type { ConnectionPerformanceRow } from "@/app/dashboard/connections/actions";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const STATUS_DOT_CLASS: Record<PerformanceStatus, string> = {
  [PerformanceStatus.ON_TARGET]: "fill-success",
  [PerformanceStatus.AT_RISK]: "fill-warning",
  [PerformanceStatus.CRITICAL]: "fill-danger",
  [PerformanceStatus.NO_DATA]: "fill-surface-border",
};

const STATUS_LEGEND = [
  { status: PerformanceStatus.ON_TARGET, label: "On Target" },
  { status: PerformanceStatus.AT_RISK, label: "At Risk" },
  { status: PerformanceStatus.CRITICAL, label: "Critical" },
] as const;

const WIDTH = 320;
const HEIGHT = 170;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 20;

type SeriesPoint = {
  periodStart: Date;
  actualValue: number | null;
  targetValue: number;
  status: PerformanceStatus;
};

type Series = {
  kpiDefinitionId: string;
  name: string;
  period: KpiPeriod;
  points: SeriesPoint[];
};

function formatDate(d: Date, isMonthly: boolean) {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: isMonthly ? undefined : "numeric",
    timeZone: "UTC",
  });
}

/** One KPI's actual-vs-target line — connected runs through consecutive
 *  submitted periods only, dots colored by that period's status, with a
 *  hollow marker for the (possibly varying) target at each period. */
function SingleKpiTrend({ series }: { series: Series }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const isMonthly = series.period === KpiPeriod.MONTHLY;

  const points = useMemo(
    () => series.points.slice().sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime()),
    [series.points],
  );

  const values = points.flatMap((p) => [p.targetValue, p.actualValue ?? p.targetValue]);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = maxV - minV || Math.abs(maxV) || 1;
  const yPad = span * 0.2;
  const yMin = minV - yPad;
  const yMax = maxV + yPad;

  const xStep = points.length > 1 ? (WIDTH - PAD_X * 2) / (points.length - 1) : 0;
  const xAt = (i: number) => PAD_X + i * xStep;
  const yAt = (v: number) =>
    PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * (1 - (v - yMin) / (yMax - yMin || 1));

  const runs = useMemo(() => {
    const result: Point[][] = [];
    let current: Point[] = [];
    points.forEach((p, i) => {
      if (p.actualValue === null) {
        if (current.length) result.push(current);
        current = [];
        return;
      }
      current.push({ x: xAt(i), y: yAt(p.actualValue) });
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

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`${series.name} actual vs target, ${isMonthly ? "monthly" : "weekly"}`}
      >
        {runs.map((run, i) => (
          <path
            key={i}
            d={smoothLinePath(run)}
            fill="none"
            className="stroke-accent"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {points.map((p, i) => (
          <circle
            key={`t-${i}`}
            cx={xAt(i)}
            cy={yAt(p.targetValue)}
            r={3}
            className="fill-surface stroke-muted"
            strokeWidth={1.5}
          />
        ))}

        {points.map((p, i) =>
          p.actualValue === null ? null : (
            <circle
              key={`a-${i}`}
              cx={xAt(i)}
              cy={yAt(p.actualValue)}
              r={hoverIndex === i ? 4.5 : 3.5}
              className={STATUS_DOT_CLASS[p.status]}
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          ),
        )}

        {hoverX !== null && (
          <line
            x1={hoverX}
            y1={PAD_TOP - 4}
            x2={hoverX}
            y2={HEIGHT - PAD_BOTTOM}
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
        />
      </svg>

      {hovered && hoverX !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-36 rounded-lg border border-surface-border bg-surface p-2 text-xs shadow-lg"
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
          <p className="mt-0.5 text-muted">
            {hovered.actualValue ?? "—"} actual · {hovered.targetValue} target
          </p>
        </div>
      )}

      <div className="relative mt-1 h-3.5 text-[10px] text-muted">
        {points.map((p, i) => (
          <span
            key={p.periodStart.toISOString()}
            className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
            style={{ left: `${(xAt(i) / WIDTH) * 100}%` }}
          >
            {formatDate(p.periodStart, isMonthly)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-KPI small multiples for the Connections detail modal's Performance
 * tab's default graph view — one card per KPI, actual value line (dots
 * colored by status) against a hollow target marker per period. Cards order
 * by their own most recent period, newest first, so the layout groups by
 * week rather than alphabetically by KPI name (the List view alternative
 * remains available for scanning exact numbers).
 */
export function ConnectionPerformanceTrendChart({ rows }: { rows: ConnectionPerformanceRow[] }) {
  const series = useMemo(() => {
    const byKpi = new Map<string, Series>();
    for (const r of rows) {
      let s = byKpi.get(r.kpiDefinitionId);
      if (!s) {
        s = { kpiDefinitionId: r.kpiDefinitionId, name: r.kpiName, period: r.period, points: [] };
        byKpi.set(r.kpiDefinitionId, s);
      }
      s.points.push({
        periodStart: new Date(r.periodStart),
        actualValue: r.actualValue,
        targetValue: r.targetValue,
        status: r.status,
      });
    }
    return Array.from(byKpi.values()).sort((a, b) => {
      const aLatest = Math.max(...a.points.map((p) => p.periodStart.getTime()));
      const bLatest = Math.max(...b.points.map((p) => p.periodStart.getTime()));
      return bLatest - aLatest || a.name.localeCompare(b.name);
    });
  }, [rows]);

  if (series.length === 0) return null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {series.map((s) => (
          <div key={s.kpiDefinitionId} className="rounded-xl border border-surface-border p-3">
            <p className="mb-1 text-sm font-medium">{s.name}</p>
            <SingleKpiTrend series={s} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className="size-2.5 rounded-full border border-muted bg-surface" />
          Target
        </div>
        {STATUS_LEGEND.map((s) => (
          <div key={s.status} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`size-2.5 rounded-full ${STATUS_DOT_CLASS[s.status]}`} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
