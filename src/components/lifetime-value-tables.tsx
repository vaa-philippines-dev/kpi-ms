"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { PerformanceDetailModal } from "@/components/performance-detail-modal";
import { formatDuration } from "@/lib/period";
import { ConnectionStatus, KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const CONNECTION_STATUS_TONE: Record<ConnectionStatus, "success" | "warning" | "danger" | "neutral"> = {
  [ConnectionStatus.ACTIVE]: "success",
  [ConnectionStatus.PAUSED]: "warning",
  [ConnectionStatus.INACTIVE]: "warning",
  [ConnectionStatus.PENDING]: "neutral",
  [ConnectionStatus.END_OF_CONTRACT]: "danger",
  [ConnectionStatus.END_OF_PROJECT]: "danger",
};

export type LifetimeValueCustomer = {
  clientName: string;
  secondaryName: string | null;
  activeConnections: number;
  maxDays: number;
  longestStatus: ConnectionStatus;
  perfStatus: PerformanceStatus;
  // The connection driving `maxDays`/`longestStatus` — a client can have
  // several connections (one per service), but the "KPI Submissions" modal
  // this row opens is per-connection, so each client row points at its
  // single longest-running one, same as Customer Overview's sampleConnectionId.
  sampleConnectionId: string;
};

/**
 * Client-component wrapper around the Lifetime Value report's tables — owns
 * the "which client's KPI Submissions modal is open" state so a row click on
 * any of the three tables below (All Clients, Top 10 Longest, Top 10
 * Shortest) opens the same PerformanceDetailModal used on the Performance
 * page's Per Connection tab, scoped to that client's longest connection.
 */
export function LifetimeValueTables({
  allClients,
  top10Longest,
  top10Shortest,
  sort,
  periodStart,
  period,
  isManager,
  interventionTypes,
}: {
  allClients: LifetimeValueCustomer[];
  top10Longest: LifetimeValueCustomer[];
  top10Shortest: LifetimeValueCustomer[];
  sort: "asc" | "desc";
  periodStart: string;
  period: KpiPeriod;
  isManager: boolean;
  interventionTypes: string[];
}) {
  const [openConnectionId, setOpenConnectionId] = useState<string | null>(null);

  return (
    <>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">All Clients</h2>
            <p className="text-xs text-muted">
              One row per client · {sort === "asc" ? "shortest" : "longest"} first
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <Link
              href="?sort=desc"
              className={`rounded-full px-2 py-1 ${sort === "desc" ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
            >
              Longest first
            </Link>
            <Link
              href="?sort=asc"
              className={`rounded-full px-2 py-1 ${sort === "asc" ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
            >
              Shortest first
            </Link>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <Table>
            <TableHead>
              <tr>
                <Th>Client</Th>
                <Th>Active</Th>
                <Th>Longest Duration</Th>
                <Th>Status</Th>
                <Th>Performance</Th>
              </tr>
            </TableHead>
            <tbody>
              {allClients.map((c) => (
                <Tr key={c.clientName} onClick={() => setOpenConnectionId(c.sampleConnectionId)}>
                  <Td>
                    <span className="font-medium text-accent">{c.clientName}</span>
                    {c.secondaryName && (
                      <div className="text-xs text-muted">{c.secondaryName}</div>
                    )}
                  </Td>
                  <Td>
                    <Badge tone="success">{c.activeConnections}</Badge>
                  </Td>
                  <Td className="font-medium">{formatDuration(c.maxDays)}</Td>
                  <Td>
                    <Badge tone={CONNECTION_STATUS_TONE[c.longestStatus]}>
                      {c.longestStatus.replaceAll("_", " ")}
                    </Badge>
                  </Td>
                  <Td>
                    <StatusBadge status={c.perfStatus} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopClientsCard
          title="Top 10 Longest-Running"
          subtitle=""
          customers={top10Longest}
          onSelect={setOpenConnectionId}
        />
        <TopClientsCard
          title="Top 10 Shortest-Running"
          subtitle="Active connections only"
          customers={top10Shortest}
          onSelect={setOpenConnectionId}
        />
      </div>

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

function TopClientsCard({
  title,
  subtitle,
  customers,
  onSelect,
}: {
  title: string;
  subtitle: string;
  customers: LifetimeValueCustomer[];
  onSelect: (connectionId: string) => void;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mb-4 text-xs text-muted">{subtitle}</p>}
      {customers.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No data.</p>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>#</Th>
              <Th>Client</Th>
              <Th>Active</Th>
              <Th>Longest Duration</Th>
              <Th>Performance</Th>
            </tr>
          </TableHead>
          <tbody>
            {customers.map((c, idx) => (
              <Tr key={c.clientName} onClick={() => onSelect(c.sampleConnectionId)}>
                <Td className="font-semibold text-muted">{idx + 1}</Td>
                <Td>
                  <span className="font-medium">{c.clientName}</span>
                  {c.secondaryName && (
                    <div className="text-xs text-muted">{c.secondaryName}</div>
                  )}
                </Td>
                <Td>
                  <Badge tone="success">{c.activeConnections}</Badge>
                </Td>
                <Td className="font-medium text-accent">{formatDuration(c.maxDays)}</Td>
                <Td>
                  <StatusBadge status={c.perfStatus} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
