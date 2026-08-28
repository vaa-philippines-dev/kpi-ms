import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/connection-scope";
import { ticketScopeWhere } from "@/lib/ticket-scope";
import { prisma } from "@/lib/prisma";
import type { TicketNotification } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Polled feed of ticket notifications. Unlike the submission poll, there's
 * no role gate here — any signed-in user can be a ticket participant
 * (creator, ADMIN triaging the Inbox, or a DM/OPS_MANAGER/OM watching their
 * scope) — ticketScopeWhere (src/lib/ticket-scope.ts) decides what this
 * session can see.
 *
 * Reads straight off Ticket/TicketMessage rows instead of an in-memory
 * pub/sub — replaced an SSE stream that held a Vercel function invocation
 * open for as long as a dashboard tab stayed open (billed as continuous
 * compute time). Three DB-derived event kinds:
 * - "created": a new ticket in scope, not authored by this session.
 * - "message": a new reply in scope, not sent by this session.
 * - "status": an existing ticket touched (Ticket.updatedAt bumped) with no
 *   accompanying new message in this window — i.e. an admin status change.
 *   Self-closes are filtered via closedById; other self-authored status
 *   changes can't be detected without an updatedById column, so this is an
 *   approximation, not exact parity with the old push-based recipient list.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const now = new Date();
  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam) : new Date(now.getTime() - 60_000);
  const scope = ticketScopeWhere(session);

  const [newTickets, newMessages, touchedTickets] = await Promise.all([
    prisma.ticket.findMany({
      where: { ...scope, createdAt: { gt: since }, createdById: { not: session.id } },
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    prisma.ticketMessage.findMany({
      where: { ticket: scope, createdAt: { gt: since }, senderId: { not: session.id } },
      select: {
        id: true,
        ticketId: true,
        body: true,
        attachmentUrl: true,
        createdAt: true,
        senderId: true,
        sender: { select: { name: true, email: true } },
        ticket: { select: { subject: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    prisma.ticket.findMany({
      where: { ...scope, updatedAt: { gt: since }, createdAt: { lte: since } },
      select: {
        id: true,
        subject: true,
        status: true,
        updatedAt: true,
        closedById: true,
        closedBy: { select: { name: true, email: true } },
      },
    }),
  ]);

  const events: TicketNotification[] = [];

  for (const t of newTickets) {
    events.push({
      ticketId: t.id,
      subject: t.subject,
      kind: "created",
      status: t.status,
      actorName: t.createdBy.name ?? t.createdBy.email,
      createdAt: t.createdAt.toISOString(),
    });
  }

  const messageTicketIds = new Set(newMessages.map((m) => m.ticketId));
  for (const m of newMessages) {
    events.push({
      ticketId: m.ticketId,
      subject: m.ticket.subject,
      kind: "message",
      status: m.ticket.status,
      actorName: m.sender.name ?? m.sender.email,
      createdAt: m.createdAt.toISOString(),
      message: {
        id: m.id,
        senderId: m.senderId,
        senderName: m.sender.name ?? m.sender.email,
        body: m.body,
        attachmentUrl: m.attachmentUrl,
      },
    });
  }

  for (const t of touchedTickets) {
    if (messageTicketIds.has(t.id)) continue;
    if (t.closedById === session.id) continue;
    events.push({
      ticketId: t.id,
      subject: t.subject,
      kind: "status",
      status: t.status,
      actorName: t.closedBy ? (t.closedBy.name ?? t.closedBy.email) : "Admin",
      createdAt: t.updatedAt.toISOString(),
    });
  }

  events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return NextResponse.json({ events, serverTime: now.toISOString() });
}
