import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { TicketThread } from "@/components/ticket-thread";
import { TicketMetaPanel } from "@/components/ticket-meta-panel";
import { requireSession } from "@/lib/connection-scope";
import { ticketScopeWhere } from "@/lib/ticket-scope";
import { roleLabel } from "@/lib/roles";
import { UserRole } from "@/generated/prisma/enums";

// Shared ticket detail route for every role — the admin Inbox and everyone
// else's Tickets page both link a row here. Non-admins outside the
// ticket's ticketScopeWhere are bounced back to their list rather than
// seeing a bare 404, since arriving here at all only happens via a link
// they clicked from a list they were already allowed to see.
export default async function TicketDetailPage(props: PageProps<"/dashboard/dev/tickets/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const isAdmin = session.role === UserRole.ADMIN;

  const ticket = await prisma.ticket.findFirst({
    where: { id, ...ticketScopeWhere(session) },
    include: {
      createdBy: { select: { name: true, email: true, role: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { name: true, email: true } } },
      },
    },
  });

  if (!ticket) {
    redirect(isAdmin ? "/dashboard/dev/inbox" : "/dashboard/dev/tickets");
  }

  const initialMessages = ticket.messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderName: m.sender.name ?? m.sender.email,
    body: m.body,
    attachmentUrl: m.attachmentUrl,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title={ticket.subject}
        description={`Raised by ${ticket.createdBy.name ?? ticket.createdBy.email} (${roleLabel(ticket.createdBy.role)})`}
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1">
          <TicketThread
            ticketId={ticket.id}
            currentUserId={session.id}
            initialMessages={initialMessages}
            initialStatus={ticket.status}
          />
        </div>
        <TicketMetaPanel
          ticketId={ticket.id}
          subject={ticket.subject}
          requesterName={ticket.createdBy.name ?? ticket.createdBy.email}
          requesterRole={roleLabel(ticket.createdBy.role)}
          createdAt={ticket.createdAt.toISOString()}
          status={ticket.status}
          priority={ticket.priority}
          category={ticket.category}
          canModerate={isAdmin}
        />
      </div>
    </>
  );
}
