import Link from "next/link";
import { CheckCircle2, ArrowRight, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeroBackground } from "@/components/hero-background";
import { createSubmission } from "./actions";

// Presented as a modal over the landing hero — same chrome as AuthModal —
// but /submit stays its own real URL, since it's the link VAs actually
// bookmark/get sent directly rather than reach by clicking through "/".
function SubmitShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <HeroBackground />
      <div className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
        <div className="animate-modal-pop relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-8 shadow-2xl shadow-black/40">
          <Link
            href="/"
            aria-label="Close"
            className="absolute top-4 right-4 text-muted transition hover:text-foreground"
          >
            <X className="size-4" />
          </Link>
          {children}
        </div>
      </div>
    </main>
  );
}

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
      <SubmitShell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Submission recorded
          </h1>
          <p className="mt-2 text-sm text-muted">
            Thanks — your KPI values have been saved.
          </p>
          <Link
            href="/submit"
            className="mt-6 inline-block text-sm text-accent hover:underline"
          >
            Submit another
          </Link>
        </div>
      </SubmitShell>
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
      <SubmitShell>
        <div className="text-center">
          <p className="text-xs tracking-wide text-muted uppercase">
            Step 1 of 3
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            KPI submission
          </h1>
          <p className="mt-2 text-sm text-muted">
            Enter your Connection ID to get started.
          </p>
          {connectionId && !connection && (
            <p className="mt-4 text-sm text-danger">
              Connection ID not found — double-check it and try again.
            </p>
          )}
          <form method="GET" className="mt-6 flex gap-2">
            <Input
              name="connectionId"
              placeholder="Connection ID"
              required
              defaultValue={connectionId ?? ""}
              className="w-full"
            />
            <Button type="submit" className="shrink-0">
              Continue
            </Button>
          </form>
        </div>
      </SubmitShell>
    );
  }

  if (!period) {
    return (
      <SubmitShell>
        <div className="text-center">
          <p className="text-xs tracking-wide text-muted uppercase">
            Step 2 of 3
          </p>
          <p className="mt-2 text-sm text-muted">
            {connection.vaName} · {connection.clientName} ·{" "}
            {connection.department.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Which period are you submitting for?
          </h1>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/submit?connectionId=${connection.id}&period=${KpiPeriod.WEEKLY}`}
            >
              <Button>Weekly</Button>
            </Link>
            <Link
              href={`/submit?connectionId=${connection.id}&period=${KpiPeriod.MONTHLY}`}
            >
              <Button variant="outline">Monthly</Button>
            </Link>
          </div>
          <Link
            href="/submit"
            className="mt-8 inline-block text-xs text-muted hover:underline"
          >
            Wrong connection? Start over
          </Link>
        </div>
      </SubmitShell>
    );
  }

  const kpis = await prisma.kpiDefinition.findMany({
    where: { departmentId: connection.departmentId, period },
    orderBy: { name: "asc" },
  });

  return (
    <SubmitShell>
      <div className="text-center">
        <p className="text-xs tracking-wide text-muted uppercase">
          Step 3 of 3
        </p>
        <p className="mt-2 text-sm text-muted">
          {connection.vaName} · {connection.clientName} ·{" "}
          {connection.department.name} ·{" "}
          {period === KpiPeriod.WEEKLY ? "Weekly" : "Monthly"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Enter your KPI values
        </h1>
      </div>

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
              <Input
                name={`kpi_${kpi.id}`}
                type="number"
                step="any"
                required
                className="mt-1 w-full"
              />
            </div>
          ))}
          <Button type="submit" className="flex w-full items-center justify-center gap-2">
            Submit
            <ArrowRight className="size-4" />
          </Button>
        </form>
      )}

      <Link
        href="/submit"
        className="mt-6 block text-center text-xs text-muted hover:underline"
      >
        Wrong connection? Start over
      </Link>
    </SubmitShell>
  );
}
