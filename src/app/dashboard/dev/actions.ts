"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TicketCategory, TicketPriority, TicketStatus, UserRole } from "@/generated/prisma/enums";
import { requireSession, type ScopingSession } from "@/lib/connection-scope";
import { ticketScopeWhere, getTicketWatcherIds } from "@/lib/ticket-scope";
import { emitTicketNotification } from "@/lib/realtime";
import { logActivity } from "@/lib/activity-log";

async function requireAdmin(): Promise<ScopingSession> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN) {
    throw new Error("Only the admin can do that.");
  }
  return session;
}

export type TicketThreadMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
};

export async function createTicket(formData: FormData) {
  const session = await requireSession();

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "OTHER");
  const priorityRaw = String(formData.get("priority") ?? "NORMAL");
  const attachmentUrl = String(formData.get("attachmentUrl") ?? "").trim() || null;

  if (!subject || !body) {
    throw new Error("Subject and message are required.");
  }
  const category = (Object.values(TicketCategory) as string[]).includes(categoryRaw)
    ? (categoryRaw as TicketCategory)
    : TicketCategory.OTHER;
  const priority = (Object.values(TicketPriority) as string[]).includes(priorityRaw)
    ? (priorityRaw as TicketPriority)
    : TicketPriority.NORMAL;

  const creator = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { name: true, email: true },
  });

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        subject,
        category,
        priority,
        createdById: session.id,
        messages: { create: { senderId: session.id, body, attachmentUrl } },
      },
    });
    await logActivity(tx, {
      actor: { id: session.id, role: session.role, departmentId: session.departmentId },
      action: "CREATE",
      entityType: "Ticket",
      entityId: created.id,
      entityLabel: subject,
      summary: `Opened ticket "${subject}"`,
    });
    return created;
  });

  // Self excluded — the creator doesn't need a toast about a ticket they
  // just submitted themselves.
  const watcherIds = await getTicketWatcherIds(session.id, session.departmentId, session.teamId);
  const recipients = watcherIds.filter((id) => id !== session.id);
  if (recipients.length > 0) {
    emitTicketNotification({
      ticketId: ticket.id,
      subject,
      kind: "created",
      status: ticket.status,
      actorName: creator.name ?? creator.email,
      createdAt: ticket.createdAt.toISOString(),
      recipientIds: recipients,
    });
  }

  revalidatePath("/dashboard/dev/inbox");
  revalidatePath("/dashboard/dev/tickets");
}

export async function sendTicketMessage(
  ticketId: string,
  body: string,
  attachmentUrl?: string | null,
): Promise<TicketThreadMessage> {
  const session = await requireSession();
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new Error("Message can't be empty.");
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...ticketScopeWhere(session) },
    select: {
      subject: true,
      status: true,
      createdById: true,
      createdBy: { select: { departmentId: true, teamId: true } },
    },
  });
  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  // Closed is a dead end for everyone except the admin — only the admin
  // replying reopens it (see `reopening` below); anyone else must wait for
  // that reopen instead of being able to revive a closed ticket themselves.
  if (ticket.status === TicketStatus.CLOSED && session.role !== UserRole.ADMIN) {
    throw new Error("This ticket is closed. Only an admin can reply.");
  }

  const sender = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { name: true, email: true },
  });
  const senderName = sender.name ?? sender.email;
  const cleanAttachmentUrl = attachmentUrl?.trim() || null;

  // A closed ticket is never a dead end for the admin — an admin replying
  // reopens it to In Progress rather than requiring a separate "Reopen"
  // action first. Non-admins never reach here while closed (blocked above).
  const reopening = ticket.status === TicketStatus.CLOSED;

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: { ticketId, senderId: session.id, body: trimmedBody, attachmentUrl: cleanAttachmentUrl },
    });
    await tx.ticket.update({
      where: { id: ticketId },
      data: reopening ? { status: TicketStatus.IN_PROGRESS } : {},
    });
    if (reopening) {
      await logActivity(tx, {
        actor: { id: session.id, role: session.role, departmentId: session.departmentId },
        action: "UPDATE",
        entityType: "Ticket",
        entityId: ticketId,
        entityLabel: ticket.subject,
        summary: `Reopened ticket "${ticket.subject}" (replied while closed)`,
      });
    }
    return created;
  });

  const watcherIds = await getTicketWatcherIds(
    ticket.createdById,
    ticket.createdBy.departmentId,
    ticket.createdBy.teamId,
  );
  const recipients = watcherIds.filter((id) => id !== session.id);
  if (recipients.length > 0) {
    emitTicketNotification({
      ticketId,
      subject: ticket.subject,
      kind: "message",
      status: reopening ? TicketStatus.IN_PROGRESS : ticket.status,
      actorName: senderName,
      createdAt: message.createdAt.toISOString(),
      message: {
        id: message.id,
        senderId: session.id,
        senderName,
        body: trimmedBody,
        attachmentUrl: cleanAttachmentUrl,
      },
      recipientIds: recipients,
    });
  }

  revalidatePath(`/dashboard/dev/tickets/${ticketId}`);
  revalidatePath("/dashboard/dev/inbox");
  revalidatePath("/dashboard/dev/tickets");

  return {
    id: message.id,
    senderId: session.id,
    senderName,
    body: trimmedBody,
    attachmentUrl: cleanAttachmentUrl,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function updateTicketStatus(ticketId: string, status: TicketStatus) {
  const session = await requireAdmin();
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      subject: true,
      status: true,
      createdById: true,
      createdBy: { select: { departmentId: true, teamId: true } },
    },
  });
  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  if (ticket.status === status) return;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        closedAt: status === TicketStatus.CLOSED ? new Date() : null,
        closedById: status === TicketStatus.CLOSED ? session.id : null,
      },
    });
    await logActivity(tx, {
      actor: { id: session.id, role: session.role, departmentId: session.departmentId },
      action: "UPDATE",
      entityType: "Ticket",
      entityId: ticketId,
      entityLabel: ticket.subject,
      summary: `Set ticket "${ticket.subject}" to ${status}`,
    });
  });

  const admin = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { name: true, email: true },
  });
  const watcherIds = await getTicketWatcherIds(
    ticket.createdById,
    ticket.createdBy.departmentId,
    ticket.createdBy.teamId,
  );
  const recipients = watcherIds.filter((id) => id !== session.id);
  if (recipients.length > 0) {
    emitTicketNotification({
      ticketId,
      subject: ticket.subject,
      kind: "status",
      status,
      actorName: admin.name ?? admin.email,
      createdAt: new Date().toISOString(),
      recipientIds: recipients,
    });
  }

  revalidatePath(`/dashboard/dev/tickets/${ticketId}`);
  revalidatePath("/dashboard/dev/inbox");
  revalidatePath("/dashboard/dev/tickets");
}

export async function deleteTicket(formData: FormData) {
  const session = await requireAdmin();
  const ticketId = String(formData.get("ticketId") ?? "");

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { subject: true } });
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  await prisma.$transaction(async (tx) => {
    // Logged before the delete (entityId isn't a real FK — see
    // ActivityLog.entityId — so the row survives the cascade fine) so the
    // audit trail has the subject even though the ticket itself is gone.
    await logActivity(tx, {
      actor: { id: session.id, role: session.role, departmentId: session.departmentId },
      action: "DELETE",
      entityType: "Ticket",
      entityId: ticketId,
      entityLabel: ticket.subject,
      summary: `Deleted ticket "${ticket.subject}"`,
    });
    // TicketMessage.ticket has onDelete: Cascade — no separate message cleanup needed.
    await tx.ticket.delete({ where: { id: ticketId } });
  });

  revalidatePath("/dashboard/dev/inbox");
  revalidatePath("/dashboard/dev/tickets");
}

export async function updateTicketMeta(
  ticketId: string,
  data: { priority?: TicketPriority; category?: TicketCategory },
) {
  const session = await requireAdmin();
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { subject: true } });
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticketId }, data });
    await logActivity(tx, {
      actor: { id: session.id, role: session.role, departmentId: session.departmentId },
      action: "UPDATE",
      entityType: "Ticket",
      entityId: ticketId,
      entityLabel: ticket.subject,
      summary: `Updated ticket "${ticket.subject}" details`,
    });
  });

  revalidatePath(`/dashboard/dev/tickets/${ticketId}`);
  revalidatePath("/dashboard/dev/inbox");
}
