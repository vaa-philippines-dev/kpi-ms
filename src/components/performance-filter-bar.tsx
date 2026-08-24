"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import { STATUS_LABEL } from "@/components/status-badge";
import { ConnectionType } from "@/generated/prisma/enums";

const TYPE_LABELS: Record<ConnectionType, string> = {
  REGULAR: "Regular",
  PROJECT_BASED: "Project-based",
};

export type FilterOption = { id: string; name: string };

const FILTER_KEYS = ["dept", "team", "type", "status"] as const;

/**
 * Department / Team / Type / Status filter for the Performance Analytics
 * page. Lives above every widget on the page (Performance Trend, Submission
 * Trend, Department/Team Summary, Performance Summary) and drives them all
 * from the same `?dept=&team=&type=&status=` search params, instead of the
 * old per-column filters that only ever narrowed the Performance Summary
 * table itself.
 */
export function PerformanceFilterBar({
  departments,
  teams,
}: {
  departments: FilterOption[];
  teams: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (value) query.set(key, value);
    else query.delete(key);
    const qs = query.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearFilters() {
    const query = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) query.delete(key);
    const qs = query.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilters = FILTER_KEYS.some((k) => searchParams.get(k));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Select
        aria-label="Filter by department"
        value={searchParams.get("dept") ?? ""}
        onChange={(e) => setParam("dept", e.target.value)}
        className="w-auto"
      >
        <option value="">All Departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by team"
        value={searchParams.get("team") ?? ""}
        onChange={(e) => setParam("team", e.target.value)}
        className="w-auto"
      >
        <option value="">All Teams</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by connection type"
        value={searchParams.get("type") ?? ""}
        onChange={(e) => setParam("type", e.target.value)}
        className="w-auto"
      >
        <option value="">All Types</option>
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by status"
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className="w-auto"
      >
        <option value="">All Statuses</option>
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-xs text-accent hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
