import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TicketThread } from "@/components/ticket-thread";
import { TicketMetaPanel } from "@/components/ticket-meta-panel";
import { requireSession } from "@/lib/connection-scope";
import { roleLabel } from "@/lib/roles";
import { UserRole } from "@/generated/prisma/enums";

// Selected-conversation pane for the messenger-style Inbox — reuses the
// same TicketThread/TicketMetaPanel as the standalone
// /dashboard/dev/tickets/[id] route (which stays the shared detail page
// for non-admins' own tickets), just laid out to fill InboxShell's right
// pane instead of a full standalone page.
export default async function InboxTicketPage(props: PageProps<"/dashboard/dev/inbox/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN) {
    redirect("/dashboard/dev/tickets");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true, role: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { name: true, email: true } } },
      },
    },
  });

  if (!ticket) {
    redirect("/dashboard/dev/inbox");
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
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 p-4 xl:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-3 shrink-0">
          <h2 className="truncate text-lg font-semibold">{ticket.subject}</h2>
          <p className="text-xs text-muted">
            Raised by {ticket.createdBy.name ?? ticket.createdBy.email} ({roleLabel(ticket.createdBy.role)})
          </p>
        </div>
        <TicketThread
          ticketId={ticket.id}
          currentUserId={session.id}
          initialMessages={initialMessages}
          initialStatus={ticket.status}
          className="h-[60vh] min-h-0 xl:h-full"
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
        canModerate
        className="xl:h-full"
      />
    </div>
  );
}
