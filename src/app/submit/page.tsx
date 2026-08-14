import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";
import { createSubmission } from "./actions";

export default async function SubmitPage(props: PageProps<"/submit">) {
  const searchParams = await props.searchParams;
  const connectionId =
    typeof searchParams.connectionId === "string"
      ? searchParams.connectionId
      : undefined;
  const period =
    typeof searchParams.period === "string"
      ? (searchParams.period as KpiPeriod)
      : undefined;
  const success = searchParams.success === "1";

  if (success) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Submission recorded
        </h1>
        <p className="mt-2 text-sm text-muted">
          Thanks — your KPI values have been saved.
        </p>
        <Link href="/submit" className="mt-6 text-sm text-accent hover:underline">
          Submit another
        </Link>
      </main>
    );
  }

  const connection = connectionId
    ? await prisma.connection.findUnique({
        where: { id: connectionId },
        include: { department: true },
      })
    : null;

  if (!connectionId || !connection) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            KPI submission
          </h1>
          <p className="mt-2 text-sm text-muted">
            Enter your Connection ID to get started.
          </p>
          {connectionId && !connection && (
            <p className="mt-4 text-sm text-red-400">
              Connection ID not found — double-check it and try again.
            </p>
          )}
          <form method="GET" className="mt-6 flex gap-2">
            <input
              name="connectionId"
              placeholder="Connection ID"
              required
              defaultValue={connectionId ?? ""}
              className="w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Continue
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (!period) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-sm text-muted">
          {connection.vaName} · {connection.clientName} ·{" "}
          {connection.department.name}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Which period are you submitting for?
        </h1>
        <div className="mt-6 flex gap-3">
          <Link
            href={`/submit?connectionId=${connection.id}&period=${KpiPeriod.WEEKLY}`}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Weekly
          </Link>
          <Link
            href={`/submit?connectionId=${connection.id}&period=${KpiPeriod.MONTHLY}`}
            className="rounded-lg border border-surface-border px-5 py-2.5 text-sm font-medium hover:bg-surface"
          >
            Monthly
          </Link>
        </div>
        <Link href="/submit" className="mt-8 text-xs text-muted hover:underline">
          Wrong connection? Start over
        </Link>
      </main>
    );
  }

  const kpis = await prisma.kpiDefinition.findMany({
    where: { departmentId: connection.departmentId, period },
    orderBy: { name: "asc" },
  });

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-lg">
        <p className="text-center text-sm text-muted">
          {connection.vaName} · {connection.clientName} ·{" "}
          {connection.department.name} · {period === KpiPeriod.WEEKLY ? "Weekly" : "Monthly"}
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight">
          Enter your KPI values
        </h1>

        {kpis.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">
            No {period === KpiPeriod.WEEKLY ? "weekly" : "monthly"} KPIs are
            configured for {connection.department.name} yet.
          </p>
        ) : (
          <form action={createSubmission} className="mt-8 space-y-4">
            <input type="hidden" name="connectionId" value={connection.id} />
            <input type="hidden" name="period" value={period} />
            {kpis.map((kpi) => (
              <div key={kpi.id}>
                <label className="block text-sm">
                  {kpi.name}
                  <span className="ml-2 text-xs text-muted">
                    (target {kpi.targetValue},{" "}
                    {kpi.direction === KpiDirection.HIGHER_IS_BETTER
                      ? "higher is better"
                      : "lower is better"}
                    )
                  </span>
                </label>
                <input
                  name={`kpi_${kpi.id}`}
                  type="number"
                  step="any"
                  required
                  className="mt-1 w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm"
                />
              </div>
            ))}
            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Submit
            </button>
          </form>
        )}

        <Link
          href="/submit"
          className="mt-6 block text-center text-xs text-muted hover:underline"
        >
          Wrong connection? Start over
        </Link>
      </div>
    </main>
  );
}
