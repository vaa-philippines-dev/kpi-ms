import { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/enums";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.IN_PROGRESS]: "In Progress",
  [TicketStatus.CLOSED]: "Closed",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  [TicketPriority.LOW]: "Low",
  [TicketPriority.NORMAL]: "Normal",
  [TicketPriority.URGENT]: "Urgent",
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  [TicketCategory.BUG]: "Bug",
  [TicketCategory.QUESTION]: "Question",
  [TicketCategory.FEATURE_REQUEST]: "Feature Request",
  [TicketCategory.DATA_ISSUE]: "Data Issue",
  [TicketCategory.OTHER]: "Other",
};

// Badge tone classes, matching the tone vocabulary src/components/ui/badge.tsx
// already exposes (success/warning/danger/neutral) — see BADGE_TONE below.
export const TICKET_STATUS_TONE: Record<TicketStatus, "success" | "warning" | "neutral"> = {
  [TicketStatus.OPEN]: "warning",
  [TicketStatus.IN_PROGRESS]: "neutral",
  [TicketStatus.CLOSED]: "success",
};

export const TICKET_PRIORITY_TONE: Record<TicketPriority, "success" | "warning" | "danger"> = {
  [TicketPriority.LOW]: "success",
  [TicketPriority.NORMAL]: "warning",
  [TicketPriority.URGENT]: "danger",
};
