"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * One KPI's value entry, with a "no data available" escape hatch — mirrors
 * legacy's per-KPI `NoDataAvailable` submission flag, which this rewrite's
 * /submit form dropped when it required a number for every KPI.
 */
export function KpiValueField({
  name,
  label,
  hint,
}: {
  name: string;
  label: string;
  hint: string;
}) {
  const [noData, setNoData] = useState(false);

  return (
    <div>
      <label className="block text-sm">
        {label}
        <span className="ml-2 text-xs text-muted">({hint})</span>
      </label>
      <div className="mt-1 flex items-center gap-3">
        <Input
          name={name}
          type="number"
          step="any"
          required={!noData}
          disabled={noData}
          className="w-full disabled:opacity-40"
        />
      </div>
      <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          name={`${name}_nodata`}
          value="1"
          checked={noData}
          onChange={(e) => setNoData(e.target.checked)}
          className="size-3.5 rounded border-surface-border"
        />
        No data available for this period
      </label>
    </div>
  );
}
