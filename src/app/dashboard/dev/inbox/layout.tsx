import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { InboxShell, type InboxTicketRow } from "@/components/inbox-shell";
import { requireSession } from "@/lib/connection-scope";
import { roleLabel } from "@/lib/roles";
import { UserRole } from "@/generated/prisma/enums";

// Admin's all-tickets triage view, messenger-style — a conversation list
// (InboxShell) shared across every route under /dashboard/dev/inbox/*, with
// the selected ticket's thread rendered via `children` ([id]/page.tsx, or
// page.tsx's empty state when nothing's selected). Fetched once here per
// navigation rather than per-page so switching conversations doesn't
// re-fetch or flash the sidebar. The Tickets page
// (src/app/dashboard/dev/tickets) is still the everyone-else counterpart,
// scoped to a person's own (and, for DM/OPS_MANAGER/OM, their team's)
// tickets, and keeps its plain table — this redesign is Inbox-only.
export default async function DevInboxLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN) {
    redirect("/dashboard/dev/tickets");
  }

  const tickets = await prisma.ticket.findMany({
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: { select: { name: true } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows: InboxTicketRow[] = tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    requesterId: t.createdBy.id,
    requesterName: t.createdBy.name ?? t.createdBy.email,
    requesterRole: roleLabel(t.createdBy.role),
    departmentName: t.createdBy.department?.name ?? null,
    category: t.category,
    priority: t.priority,
    status: t.status,
    updatedAt: t.updatedAt.toISOString(),
    lastMessage: t.messages[0] ? { body: t.messages[0].body, senderId: t.messages[0].senderId } : null,
  }));

  return (
    <>
      <PageHeader title="Inbox" description="Every ticket raised by every user, most recent activity first." />
      <InboxShell tickets={rows}>{children}</InboxShell>
    </>
  );
}
