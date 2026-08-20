import { ConnectionStatus } from "@/generated/prisma/enums";

// Was previously duplicated identically across connections/page.tsx,
// reports/customer-overview/page.tsx, and reports/client-detail/page.tsx.
export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  END_OF_CONTRACT: "End of Contract",
  END_OF_PROJECT: "End of Project",
  PENDING: "Pending",
};

export function connectionStatusLabel(status: ConnectionStatus): string {
  return CONNECTION_STATUS_LABELS[status] ?? status;
}

// Color coding for status badges — green for active, amber for paused
// ("inactive"), gray for not-yet-started, red for the terminal states —
// so status is discernible at a glance, not just by reading the label.
export const CONNECTION_STATUS_TONE: Record<
  ConnectionStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  ACTIVE: "success",
  PENDING: "neutral",
  PAUSED: "warning",
  END_OF_CONTRACT: "danger",
  END_OF_PROJECT: "danger",
};

// Terminal states never transition back to anything else — mirrors the
// legacy updateVAConnectionStatus() legal-transition guard.
export const TERMINAL_CONNECTION_STATUSES = new Set<ConnectionStatus>([
  ConnectionStatus.END_OF_CONTRACT,
  ConnectionStatus.END_OF_PROJECT,
]);
