import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CsClientTable } from "@/components/cs-client-table";
import { requireSession } from "@/lib/connection-scope";
import { currentPeriodStart } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { loadCsBook } from "@/lib/cs-book";
import { KpiPeriod, UserRole } from "@/generated/prisma/enums";

/**
 * CS Manager's client reassignment — every client with an active CS, with a
 * click-to-reassign modal. Split out of the CS Manager dashboard so the
 * dashboard stays a read-only overview.
 */
export default async function ReassignPage() {
  const [session, real] = await Promise.all([requireSession(), auth()]);
  if (session.role !== "CS_MANAGER" && session.role !== "ADMIN") redirect("/dashboard");

  const weeklyStart = currentPeriodStart(KpiPeriod.WEEKLY, new Date(), await getWeekStartDay());
  const [{ clientRows }, specialists] = await Promise.all([
    loadCsBook({ isActive: true }, weeklyStart),
    prisma.user.findMany({
      where: { role: UserRole.CS_SPECIALIST, isActive: true },
      select: { id: true, name: true, email: true },
    }),
  ]);
  // Real role (not view-as): reassigning is a mutation, and
  // reassignClientCs re-checks it.
  const canReassign = ["CS_MANAGER", "ADMIN"].includes(real?.user?.role ?? "");

  return (
    <>
      <PageHeader
        title="Reassign"
        description={
          canReassign
            ? "Click a client to move it, its VA connections, and its open status requests to another CS."
            : "Every client and its assigned CS."
        }
      />
      <CsClientTable
        rows={clientRows}
        showCs
        specialists={
          canReassign
            ? specialists
                .map((u) => ({ id: u.id, name: u.name ?? u.email }))
                .sort((a, b) => a.name.localeCompare(b.name))
            : undefined
        }
      />
    </>
  );
}
