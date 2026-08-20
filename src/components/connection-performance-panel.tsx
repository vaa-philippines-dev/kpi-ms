"use client";

import { useEffect, useState, useTransition } from "react";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/ui/toast";
import {
  getConnectionPerformance,
  type ConnectionPerformanceRow,
} from "@/app/dashboard/connections/actions";
import { KpiPeriod } from "@/generated/prisma/enums";

const PERIOD_LABEL: Record<KpiPeriod, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

/**
 * Actual vs Target per KPI over recent periods — the Connections detail
 * modal's Performance tab. Mirrors legacy's renderPerfCharts()
 * (AppVAConnections.html:1078-1138) in substance (recent-period actual vs
 * target per KPI, with status), as a compact table rather than an SVG line
 * chart, per this app's existing "no full visual reskin" convention.
 */
export function ConnectionPerformancePanel({ connectionId }: { connectionId: string }) {
  const [rows, setRows] = useState<ConnectionPerformanceRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    setRows(null);
    startTransition(async () => {
      try {
        const result = await getConnectionPerformance(connectionId);
        setRows(result);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to load performance data.", "error");
        setRows([]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  if (isPending || rows === null) {
    return <TableSkeleton rows={4} />;
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        No performance data recorded yet for this connection.
      </p>
    );
  }

  return (
    <div className="max-h-[50vh] overflow-y-auto">
      <Table>
        <TableHead>
          <tr>
            <Th>KPI</Th>
            <Th>Period</Th>
            <Th>Actual</Th>
            <Th>Target</Th>
            <Th>Status</Th>
          </tr>
        </TableHead>
        <tbody>
          {rows.map((r, i) => (
            <Tr key={`${r.kpiDefinitionId}-${r.periodStart}-${i}`}>
              <Td>{r.kpiName}</Td>
              <Td className="text-muted">
                {PERIOD_LABEL[r.period]} · {new Date(r.periodStart).toLocaleDateString()}
              </Td>
              <Td className="text-muted">{r.actualValue ?? "—"}</Td>
              <Td className="text-muted">{r.targetValue}</Td>
              <Td>
                <StatusBadge status={r.status} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
