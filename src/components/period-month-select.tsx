"use client";

import { useRouter } from "next/navigation";

/**
 * Client-side "jump to period" dropdown for PeriodNav — plain links can't
 * auto-navigate on selection, so this is the one bit of PeriodNav that needs
 * to be a client component.
 */
export function PeriodMonthSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string; href: string }[];
}) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => {
        const option = options.find((o) => o.value === e.target.value);
        if (option) router.push(option.href);
      }}
      aria-label="Jump to period"
      className="rounded-md border border-surface-border bg-surface px-2 py-1 text-xs outline-none transition focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
