import type { TicketStatus } from "@/generated/prisma/enums";

export type TicketNotification = {
  ticketId: string;
  subject: string;
  kind: "created" | "message" | "status";
  status: TicketStatus;
  actorName: string;
  createdAt: string;
  // Full message payload for kind "message" — lets an open TicketThread
  // (see ticket-live-bus.ts) append it directly without a refetch. Absent
  // for "created"/"status", which have nothing extra to render inline.
  message?: {
    id: string;
    senderId: string;
    senderName: string;
    body: string;
    attachmentUrl: string | null;
  };
};
