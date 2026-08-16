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

// Terminal states never transition back to anything else — mirrors the
// legacy updateVAConnectionStatus() legal-transition guard.
export const TERMINAL_CONNECTION_STATUSES = new Set<ConnectionStatus>([
  ConnectionStatus.END_OF_CONTRACT,
  ConnectionStatus.END_OF_PROJECT,
]);
