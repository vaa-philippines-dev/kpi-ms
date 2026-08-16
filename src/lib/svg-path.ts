export type Point = { x: number; y: number };

/**
 * Catmull-Rom-to-cubic-Bezier conversion — the standard way to get a smooth
 * curve through a set of points without a charting library. Returns only
 * the `C x1 y1, x2 y2, x y` segments (no leading `M`), so callers can
 * compose an SVG path by moving to the first point themselves and
 * appending these segments — which is what lets a stacked area's top and
 * bottom boundary share exactly the same smoothing function.
 */
export function smoothSegments(points: Point[]): string {
  if (points.length < 2) return "";
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** A full smooth open path through `points`, starting with a moveto. */
export function smoothLinePath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return `M ${points[0].x} ${points[0].y} ${smoothSegments(points)}`;
}

/**
 * A closed, smoothly-curved band between an `upper` and `lower` boundary
 * (same length, same x positions) — used for stacked-area segments. Both
 * boundaries are smoothed independently and joined with a straight edge at
 * each end, so adjacent bands share an identical curve at their border.
 */
export function smoothBandPath(upper: Point[], lower: Point[]): string {
  if (upper.length === 0 || lower.length === 0) return "";
  const lowerReversed = [...lower].reverse();
  const last = lower[lower.length - 1];
  return (
    `M ${upper[0].x} ${upper[0].y} ${smoothSegments(upper)}` +
    ` L ${last.x} ${last.y} ${smoothSegments(lowerReversed)} Z`
  );
}
