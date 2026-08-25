import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { InterventionsTable, type InterventionRow } from "@/components/interventions-table";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { getEffectiveSession } from "@/lib/view-as";
import { getInterventionTypes } from "@/lib/settings";

export default async function InterventionsPage() {
  const session = await getEffectiveSession();
  const role = session?.role;
  const isManager = role === "ADMIN" || role === "DM" || role === "OPS_MANAGER" || role === "OM";

  if (!session) {
    return (
      <>
        <PageHeader title="Interventions" />
        <ComingSoon note="Sign in to view interventions." />
      </>
    );
  }

  const scope = connectionScopeWhere({
    id: session.id,
    role: session.role,
    departmentId: session.departmentId,
    teamId: session.teamId,
  });

  const interventionTypes = await getInterventionTypes();

  const [interventions, connections] = await Promise.all([
    prisma.intervention.findMany({
      where: { connection: scope },
      orderBy: { createdAt: "desc" },
      include: { connection: { include: { vaUser: true } }, createdBy: true },
    }),
    isManager
      ? prisma.connection.findMany({
          where: scope,
          include: { vaUser: true },
          orderBy: { clientName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const rows: InterventionRow[] = interventions.map((iv) => ({
    id: iv.id,
    createdAtMs: iv.createdAt.getTime(),
    createdAtLabel: iv.createdAt.toLocaleDateString(),
    vaName: iv.connection.vaUser.name ?? iv.connection.vaUser.email,
    clientName: iv.connection.clientName,
    type: iv.type,
    description: iv.description,
    actionTaken: iv.actionTaken,
    outcome: iv.outcome,
  }));

  const connectionOptions = connections.map((c) => ({
    id: c.id,
    name: `${c.vaUser.name ?? c.vaUser.email} · ${c.clientName}`,
  }));

  return (
    <>
      <PageHeader
        title={role === "VA" ? "My Interventions" : "Interventions"}
        description={
          role === "VA"
            ? "Coaching, training, and escalation actions logged for you — read-only."
            : "Coaching, training, and escalation actions logged against a connection."
        }
      />

      <InterventionsTable
        interventions={rows}
        connections={connectionOptions}
        interventionTypes={interventionTypes}
        isManager={isManager}
      />
    </>
  );
}
