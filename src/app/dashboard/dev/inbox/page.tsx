import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { TicketListTable, type TicketListRow } from "@/components/ticket-list-table";
import { requireSession } from "@/lib/connection-scope";
import { roleLabel } from "@/lib/roles";
import { UserRole } from "@/generated/prisma/enums";

// Admin's all-tickets triage view — every ticket raised by every role,
// newest activity first. The Tickets page (src/app/dashboard/dev/tickets)
// is the everyone-else counterpart, scoped to a person's own (and, for
// DM/OPS_MANAGER/OM, their team's) tickets.
export default async function DevInboxPage() {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN) {
    redirect("/dashboard/dev/tickets");
  }

  const tickets = await prisma.ticket.findMany({
    include: { createdBy: { select: { name: true, email: true, role: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const rows: TicketListRow[] = tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    requester: t.createdBy.name ?? t.createdBy.email,
    requesterRole: roleLabel(t.createdBy.role),
    category: t.category,
    priority: t.priority,
    status: t.status,
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <>
      <PageHeader title="Inbox" description="Every ticket raised by every user, most recent activity first." />
      <TicketListTable rows={rows} showRequester emptyMessage="No tickets yet." />
    </>
  );
}
