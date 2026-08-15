import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Button, TextAction } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { getInterventionTypes } from "@/lib/settings";
import {
  createIntervention,
  updateInterventionOutcome,
  deleteIntervention,
} from "./actions";

export default async function InterventionsPage() {
  const session = await auth();
  const role = session?.user?.role;
  const isManager = role === "ADMIN" || role === "DM" || role === "OM";

  if (!session?.user) {
    return (
      <>
        <PageHeader title="Interventions" />
        <ComingSoon note="Sign in to view interventions." />
      </>
    );
  }

  const scope = connectionScopeWhere({
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
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

  return (
    <>
      <PageHeader
        title="Interventions"
        description="Coaching, training, and escalation actions logged against a connection."
      />

      <div className="max-w-4xl space-y-8">
        <Table>
          <TableHead>
            <tr>
              <Th>Date</Th>
              <Th>Connection</Th>
              <Th>Type</Th>
              <Th>Description</Th>
              <Th>Action Taken</Th>
              <Th>Outcome</Th>
              {isManager && <Th />}
            </tr>
          </TableHead>
          <tbody>
            {interventions.length === 0 && (
              <Tr>
                <Td colSpan={isManager ? 7 : 6} className="py-6 text-center text-muted">
                  No interventions logged yet.
                </Td>
              </Tr>
            )}
            {interventions.map((iv) => (
              <Tr key={iv.id} className="align-top">
                <Td className="whitespace-nowrap text-muted">
                  {iv.createdAt.toLocaleDateString()}
                </Td>
                <Td>
                  {iv.connection.vaUser.name ?? iv.connection.vaUser.email}
                  <div className="text-xs text-muted">{iv.connection.clientName}</div>
                </Td>
                <Td className="text-muted">{iv.type}</Td>
                <Td className="text-muted">{iv.description}</Td>
                <Td className="text-muted">{iv.actionTaken ?? "—"}</Td>
                {isManager ? (
                  <Td>
                    <form action={updateInterventionOutcome} className="flex gap-2">
                      <input type="hidden" name="id" value={iv.id} />
                      <Input
                        name="outcome"
                        defaultValue={iv.outcome ?? ""}
                        className="w-full py-1"
                      />
                      <TextAction type="submit" className="shrink-0">
                        Save
                      </TextAction>
                    </form>
                  </Td>
                ) : (
                  <Td className="text-muted">{iv.outcome ?? "—"}</Td>
                )}
                {isManager && (
                  <Td className="text-right">
                    <form action={deleteIntervention}>
                      <input type="hidden" name="id" value={iv.id} />
                      <TextAction type="submit" tone="danger">
                        Delete
                      </TextAction>
                    </form>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>

        {isManager && connections.length > 0 && (
          <form
            action={createIntervention}
            className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-surface-border p-4 sm:grid-cols-4"
          >
            <Select name="connectionId" required defaultValue="" className="sm:col-span-2">
              <option value="" disabled>
                Connection
              </option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.vaUser.name ?? c.vaUser.email)} · {c.clientName}
                </option>
              ))}
            </Select>
            <Select name="type" required defaultValue="">
              <option value="" disabled>
                Type
              </option>
              {interventionTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Input name="actionTaken" placeholder="Action taken (optional)" />
            <Input
              name="description"
              placeholder="Description"
              required
              className="col-span-2 sm:col-span-4"
            />
            <Button type="submit" className="col-span-2 sm:col-span-4">
              Log Intervention
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
