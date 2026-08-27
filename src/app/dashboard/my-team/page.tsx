import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveSession } from "@/lib/view-as";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Card } from "@/components/ui/card";

/**
 * "My Team" — new nav entry for VAs (not in legacy), reachable at
 * /dashboard/my-team. Shows a VA who their team leader and teammates are.
 * Deliberately bare: just names, no status/active/client info — per user
 * request, this is an org-chart lookup, not another performance view.
 */
export default async function MyTeamPage() {
  const session = await getEffectiveSession();
  if (!session) redirect("/sign-in");
  if (session.role !== "VA") redirect("/dashboard");

  if (!session.teamId) {
    return (
      <>
        <PageHeader title="My Team" description="Your team leader and teammates." />
        <ComingSoon note="You're not assigned to a team yet." />
      </>
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: session.teamId },
    include: { teamLeader: true, members: true },
  });

  if (!team) {
    return (
      <>
        <PageHeader title="My Team" description="Your team leader and teammates." />
        <ComingSoon note="Your team couldn't be found." />
      </>
    );
  }

  const members = team.members
    .filter((m) => m.id !== team.teamLeaderId)
    .map((m) => ({ id: m.id, name: m.name ?? m.email }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader title="My Team" description={team.name} />
      <Card className="max-w-md p-5">
        <p className="text-xs font-semibold text-muted uppercase">Team Leader</p>
        <p className="mt-1.5 text-sm font-medium">
          {team.teamLeader?.name ?? team.teamLeader?.email ?? "—"}
        </p>

        <p className="mt-5 text-xs font-semibold text-muted uppercase">Members</p>
        {members.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted">No other members yet.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {members.map((m) => (
              <li key={m.id} className="text-sm">
                {m.name}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
