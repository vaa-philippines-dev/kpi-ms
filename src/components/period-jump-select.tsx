"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

/**
 * The center date-range control in PeriodNav — looks like a label but is
 * actually a select, so clicking it jumps straight to another period
 * (mirrors legacy's `gp-period-select`) instead of only stepping one at a
 * time via the arrows.
 */
export function PeriodJumpSelect({
  value,
  label,
  options,
}: {
  value: string;
  label: string;
  options: { value: string; label: string; href: string }[];
}) {
  const router = useRouter();

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => {
          const option = options.find((o) => o.value === e.target.value);
          if (option) router.push(option.href);
        }}
        aria-label="Jump to period"
        className="min-w-[168px] appearance-none rounded-md border border-surface-border bg-surface py-1 pr-7 pl-3 text-center text-xs font-medium outline-none transition focus:border-accent"
      >
        {options.some((o) => o.value === value) ? null : (
          <option value={value}>{label}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-muted" />
    </div>
  );
}
