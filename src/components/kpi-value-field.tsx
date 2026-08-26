"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { getClusterIcon } from "@/lib/cluster-icons";

/**
 * One KPI's value entry, with a "no data available" escape hatch — mirrors
 * legacy's per-KPI `NoDataAvailable` submission flag, which this rewrite's
 * /submit form dropped when it required a number for every KPI.
 *
 * Laid out as a compact row (label/hint left, a fixed-width number field
 * right) rather than a full-width input — a bare number like "42" filling
 * an entire 480px-wide box read as broken/stretched, especially stacked
 * across a dozen KPIs.
 */
export function KpiValueField({
  name,
  label,
  hint,
  cluster,
  index = 0,
}: {
  name: string;
  label: string;
  hint: string;
  /** The KPI's cluster/area (e.g. "Facebook") — every field on a given
   * value-entry step belongs to the same cluster, so this just resolves
   * which icon to show to the left of the label. */
  cluster: string;
  index?: number;
}) {
  const [noData, setNoData] = useState(false);
  // Resolves an existing icon component from a static lookup table (not a
  // component defined inline), so it's stable across renders despite the
  // lint rule's generic "component created during render" heuristic.
  const Icon = getClusterIcon(cluster);

  return (
    <div
      className="animate-field-in flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-background/40 px-4 py-3 transition-colors hover:border-accent/40"
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      <div className="flex min-w-0 items-start gap-3">
        {/* eslint-disable-next-line react-hooks/static-components -- Icon
            resolves an existing component from a static lookup table, not
            one defined inline; it's stable across renders. */}
        <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <label htmlFor={name} className="block text-sm font-medium">
            {label}
          </label>
          <p className="text-xs text-muted">{hint}</p>
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              name={`${name}_nodata`}
              value="1"
              checked={noData}
              onChange={(e) => setNoData(e.target.checked)}
              className="size-3.5 rounded border-surface-border"
            />
            No data available
          </label>
        </div>
      </div>
      <Input
        id={name}
        name={name}
        type="number"
        step="any"
        required={!noData}
        disabled={noData}
        placeholder="0"
        className="w-24 shrink-0 text-right user-invalid:border-danger disabled:opacity-40"
      />
    </div>
  );
}
