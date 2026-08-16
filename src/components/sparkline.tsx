import { smoothLinePath } from "@/lib/svg-path";

/**
 * Minimal inline-SVG trend line — no charting library. Smoothed with the
 * same catmull-rom curve as the dashboard's main trend chart, with a soft
 * wash under the line and a ringed endpoint dot, in the same restrained,
 * iOS/macOS-Health-app register.
 */
export function Sparkline({
  values,
  width = 200,
  height = 40,
  className = "",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length === 0) return null;
  if (values.length === 1) {
    return (
      <svg width={width} height={height} className={className}>
        <circle cx={width / 2} cy={height / 2} r={3} className="fill-accent" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const padY = 3;

  const points = values.map((v, i) => ({
    x: i * stepX,
    y: padY + (1 - (v - min) / range) * (height - padY * 2),
  }));

  const linePath = smoothLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L ${last.x} ${height} L ${first.x} ${height} Z`;

  return (
    <svg width={width} height={height} className={className} role="img" aria-hidden="true">
      <path d={areaPath} className="fill-accent" fillOpacity={0.1} stroke="none" />
      <path
        d={linePath}
        fill="none"
        className="stroke-accent"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={last.x}
        cy={last.y}
        r={3}
        className="fill-accent"
        stroke="var(--surface)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
