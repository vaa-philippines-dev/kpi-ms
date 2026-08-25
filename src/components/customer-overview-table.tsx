"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatDuration } from "@/lib/period";
import { PerformanceStatus } from "@/generated/prisma/enums";

export type CustomerRow = {
  clientName: string;
  secondaryName: string | null;
  departmentName: string;
  sampleConnectionId: string;
  activeConnCount: number;
  maxDays: number;
  p0: PerformanceStatus | null;
  p1: PerformanceStatus | null;
  p2: PerformanceStatus | null;
  p3: PerformanceStatus | null;
  p4: PerformanceStatus | null;
  p5: PerformanceStatus | null;
};

const PERIOD_KEYS = ["p0", "p1", "p2", "p3", "p4", "p5"] as const;

function renderStatus(v: unknown) {
  return v ? <StatusBadge status={v as PerformanceStatus} /> : <span className="text-muted">—</span>;
}

/**
 * Client-component wrapper around DataTable — its column defs carry render
 * functions (JSX-returning closures), which can't be passed as props from a
 * Server Component straight into a "use client" component (they aren't
 * serializable across that boundary). The server page just hands over plain
 * row data and period labels; this owns the column/render definitions.
 *
 * The whole row is clickable (not just the client name) — both take you to
 * that client's Client Detail page, which surfaces the Client + VA pairing.
 */
export function CustomerOverviewTable({
  rows,
  periodLabels,
}: {
  rows: CustomerRow[];
  periodLabels: string[];
}) {
  const router = useRouter();
  const columns: DataTableColumn<CustomerRow>[] = [
    {
      key: "clientName",
      label: "Client",
      sortable: true,
      filterable: true,
      render: (v, row) => (
        <div>
          <Link
            href={`/dashboard/reports/client-detail?connectionId=${row.sampleConnectionId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium hover:text-accent hover:underline"
          >
            {v as string}
          </Link>
          {row.secondaryName && <div className="text-xs text-muted">{row.secondaryName}</div>}
        </div>
      ),
    },
    {
      key: "departmentName",
      label: "Department",
      sortable: true,
      filterable: "select",
      className: "text-muted",
    },
    {
      key: "activeConnCount",
      label: "Active",
      sortable: true,
      className: "text-center text-muted",
    },
    {
      key: "maxDays",
      label: "Duration",
      sortable: true,
      className: "text-muted",
      render: (v) => formatDuration(v as number),
    },
    ...PERIOD_KEYS.map((key, i) => ({
      key,
      label: periodLabels[i],
      className: "text-center",
      render: renderStatus,
    })),
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.clientName}
      defaultLimit={25}
      onRowClick={(row) =>
        router.push(`/dashboard/reports/client-detail?connectionId=${row.sampleConnectionId}`)
      }
      emptyMessage="No customers match the current filters."
    />
  );
}
