"use client";

import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_TONE,
  TICKET_PRIORITY_TONE,
} from "@/lib/ticket-labels";
import { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/enums";

export type TicketListRow = {
  id: string;
  subject: string;
  requester: string;
  requesterRole: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  updatedAt: string;
};

const CATEGORY_OPTIONS = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const PRIORITY_OPTIONS = Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => ({ value, label }));

/**
 * Shared ticket list table — used by the admin Inbox (every ticket, with a
 * Requester column) and the Tickets page (a person's own list, and for
 * DM/OPS_MANAGER/OM a second "team" list of everyone else in scope).
 */
export function TicketListTable({
  rows,
  showRequester,
  emptyMessage = "No tickets yet.",
}: {
  rows: TicketListRow[];
  showRequester: boolean;
  emptyMessage?: string;
}) {
  const router = useRouter();

  const columns: DataTableColumn<TicketListRow>[] = [
    { key: "subject", label: "Subject", sortable: true, filterable: true },
    ...(showRequester
      ? ([
          { key: "requester", label: "Requester", sortable: true, filterable: true },
          {
            key: "requesterRole",
            label: "Role",
            filterable: "select",
          },
        ] as DataTableColumn<TicketListRow>[])
      : []),
    {
      key: "category",
      label: "Category",
      filterable: "select",
      filterOptions: CATEGORY_OPTIONS,
      searchText: (r) => TICKET_CATEGORY_LABELS[r.category],
      render: (v) => TICKET_CATEGORY_LABELS[v as TicketCategory],
    },
    {
      key: "priority",
      label: "Priority",
      filterable: "select",
      filterOptions: PRIORITY_OPTIONS,
      searchText: (r) => TICKET_PRIORITY_LABELS[r.priority],
      render: (v) => (
        <Badge tone={TICKET_PRIORITY_TONE[v as TicketPriority]}>
          {TICKET_PRIORITY_LABELS[v as TicketPriority]}
        </Badge>
      ),
    },
    {
      key: "status",
      label: "Status",
      filterable: "select",
      filterOptions: STATUS_OPTIONS,
      searchText: (r) => TICKET_STATUS_LABELS[r.status],
      render: (v) => (
        <Badge tone={TICKET_STATUS_TONE[v as TicketStatus]}>{TICKET_STATUS_LABELS[v as TicketStatus]}</Badge>
      ),
    },
    {
      key: "updatedAt",
      label: "Last Activity",
      sortable: true,
      render: (v) => new Date(v as string).toLocaleString(),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => router.push(`/dashboard/dev/tickets/${r.id}`)}
      defaultSort={{ key: "updatedAt", dir: "desc" }}
      emptyMessage={emptyMessage}
    />
  );
}
