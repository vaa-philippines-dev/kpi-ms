import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { TicketListTable, type TicketListRow } from "@/components/ticket-list-table";
import { NewTicketModal } from "@/components/new-ticket-modal";
import { requireSession } from "@/lib/connection-scope";
import { ticketScopeWhere } from "@/lib/ticket-scope";
import { roleLabel } from "@/lib/roles";
import { UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type TicketWithCreator = Prisma.TicketGetPayload<{
  include: { createdBy: { select: { name: true; email: true; role: true } } };
}>;

function toRow(t: TicketWithCreator): TicketListRow {
  return {
    id: t.id,
    subject: t.subject,
    requester: t.createdBy.name ?? t.createdBy.email,
    requesterRole: roleLabel(t.createdBy.role),
    category: t.category,
    priority: t.priority,
    status: t.status,
    updatedAt: t.updatedAt.toISOString(),
  };
}

// Everyone-but-admin's own(+scoped) view — the Inbox (src/app/dashboard/dev/inbox)
// is the admin-only counterpart across every ticket. DM/OPS_MANAGER/OM also
// see a second list of tickets raised by people in their scope
// (department or led teams — same shape as ticketScopeWhere), so they don't
// have to wait for the admin to relay a teammate's concern back to them.
export default async function DevTicketsPage() {
  const session = await requireSession();
  if (session.role === UserRole.ADMIN) {
    redirect("/dashboard/dev/inbox");
  }

  const canSeeTeam =
    session.role === UserRole.DM || session.role === UserRole.OPS_MANAGER || session.role === UserRole.OM;

  const [own, team] = await Promise.all([
    prisma.ticket.findMany({
      where: { createdById: session.id },
      include: { createdBy: { select: { name: true, email: true, role: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    canSeeTeam
      ? prisma.ticket.findMany({
          where: { AND: [ticketScopeWhere(session), { createdById: { not: session.id } }] },
          include: { createdBy: { select: { name: true, email: true, role: true } } },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Tickets"
          description="Raise a concern or question directly with the dev team."
          className="mb-0"
        />
        <NewTicketModal />
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted uppercase">My Tickets</h2>
          <TicketListTable
            rows={own.map(toRow)}
            showRequester={false}
            emptyMessage="You haven't raised any tickets yet."
          />
        </div>

        {canSeeTeam && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
              {session.role === UserRole.OM ? "My Team's Tickets" : "Department Tickets"}
            </h2>
            <TicketListTable
              rows={team.map(toRow)}
              showRequester
              emptyMessage="No tickets from your team yet."
            />
          </div>
        )}
      </div>
    </>
  );
}
