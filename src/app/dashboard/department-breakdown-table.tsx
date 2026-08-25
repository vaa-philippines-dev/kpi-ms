"use client";

import { useState } from "react";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/status-badge";
import { PerformanceDetailModal } from "@/components/performance-detail-modal";
import { PerformanceStatus, KpiPeriod } from "@/generated/prisma/enums";

export type DeptRow = {
  name: string;
  onTarget: number;
  atRisk: number;
  critical: number;
};

export type DeptConnectionRow = {
  connectionId: string;
  clientName: string;
  vaName: string;
  status: PerformanceStatus;
};

/**
 * Department breakdown at the bottom of the admin/DM Overview — clicking a
 * department opens a modal listing its VAs for the current period, and
 * clicking a VA there opens the same PerformanceDetailModal used by the
 * Performance page's Per Client tab (connection-scope.ts already limits
 * `connectionsByDept` to what this session can see).
 */
export function DepartmentBreakdownTable({
  rows,
  connectionsByDept,
  periodStart,
  period,
  isManager,
  interventionTypes,
}: {
  rows: DeptRow[];
  connectionsByDept: Record<string, DeptConnectionRow[]>;
  periodStart: string;
  period: KpiPeriod;
  isManager: boolean;
  interventionTypes: string[];
}) {
  const [openDept, setOpenDept] = useState<string | null>(null);
  const [openConnectionId, setOpenConnectionId] = useState<string | null>(null);

  return (
    <>
      <Table>
        <TableHead>
          <tr>
            <Th>Department</Th>
            <Th>On Target</Th>
            <Th>At Risk</Th>
            <Th>Critical</Th>
          </tr>
        </TableHead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.name} onClick={() => setOpenDept(r.name)}>
              <Td className="font-medium">{r.name}</Td>
              <Td className="text-success">{r.onTarget}</Td>
              <Td className="text-warning">{r.atRisk}</Td>
              <Td className="text-danger">{r.critical}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      {openDept && (
        <Modal open onClose={() => setOpenDept(null)} title={openDept}>
          {(connectionsByDept[openDept] ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No VAs with performance data for this period.
            </p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {connectionsByDept[openDept].map((row) => (
                <li key={row.connectionId}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenConnectionId(row.connectionId);
                      setOpenDept(null);
                    }}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:bg-surface-hover"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.vaName}</p>
                      <p className="truncate text-xs text-muted">{row.clientName}</p>
                    </div>
                    <StatusBadge status={row.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {openConnectionId && (
        <PerformanceDetailModal
          connectionId={openConnectionId}
          periodStart={periodStart}
          period={period}
          isManager={isManager}
          interventionTypes={interventionTypes}
          onClose={() => setOpenConnectionId(null)}
        />
      )}
    </>
  );
}
