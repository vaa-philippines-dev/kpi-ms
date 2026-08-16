import { prisma } from "@/lib/prisma";
import { daysSince } from "@/lib/period";
import { ConnectionStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type LongRunningConnection = {
  id: string;
  clientName: string;
  vaName: string;
  daysActive: number;
};

const TERMINAL_STATUSES: ConnectionStatus[] = [
  ConnectionStatus.END_OF_CONTRACT,
  ConnectionStatus.END_OF_PROJECT,
];

/**
 * Connections that have been running a long time without ending — mirrors
 * legacy's getLongRunningConnections(): tenure-based (not status-history
 * based, despite the name sounding like it), excludes only the two terminal
 * statuses. Legacy measured tenure off Connection.StartDate; our schema has
 * no separate start-date field, so createdAt is the equivalent already used
 * the same way in the Lifetime Value report.
 */
export async function getLongRunningConnections(
  scope: Prisma.ConnectionWhereInput,
  thresholdDays = 180,
): Promise<LongRunningConnection[]> {
  const connections = await prisma.connection.findMany({
    where: { ...scope, status: { notIn: TERMINAL_STATUSES } },
    include: { vaUser: true },
    orderBy: { createdAt: "asc" },
  });

  return connections
    .map((c) => ({
      id: c.id,
      clientName: c.clientName,
      vaName: c.vaUser.name ?? c.vaUser.email,
      daysActive: daysSince(c.createdAt),
    }))
    .filter((c) => c.daysActive >= thresholdDays)
    .sort((a, b) => b.daysActive - a.daysActive);
}
