import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { KpiValueField } from "@/components/kpi-value-field";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { getEffectiveSession } from "@/lib/view-as";
import { currentPeriodStart, parseAnchorDate, toDateParam } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { isWithinSubmissionWindow, formatManilaWindow } from "@/lib/submission-window";
import { rollupStatus } from "@/lib/performance";
import { createSubmission } from "@/app/submit/actions";
import { PeriodForm } from "@/app/submit/period-form";

/**
 * The logged-in counterpart to /submit: reached from a "Submit KPI" button
 * on a specific connection card (Dashboard overview, My VA Connections), so
 * the connection is already known — no connection-code step. /submit itself
 * stays as-is for the public landing-page link, which has no connection
 * context to start from and still needs the code.
 */
export default async function SubmitKpiPage(props: PageProps<"/dashboard/submit-kpi">) {
  const searchParams = await props.searchParams;
  const session = await getEffectiveSession();
  if (!session) {
    redirect("/sign-in");
  }

  const connectionId =
    typeof searchParams.connectionId === "string" ? searchParams.connectionId : undefined;
  const period =
    typeof searchParams.period === "string" && Object.values(KpiPeriod).includes(searchParams.period as KpiPeriod)
      ? (searchParams.period as KpiPeriod)
      : undefined;
  const dateParam = typeof searchParams.date === "string" ? searchParams.date : undefined;
  const success = searchParams.success === "1";

  if (!connectionId) {
    return (
      <>
        <PageHeader title="Submit KPI" description="Log actuals for one of your connections." />
        <ComingSoon note="Open a connection from My VA Connections and click Submit KPI to get started." />
      </>
    );
  }

  const scope = connectionScopeWhere(session);
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
    include: { department: true, vaUser: true },
  });

  if (!connection) {
    return (
      <>
        <PageHeader title="Submit KPI" />
        <ComingSoon note="That connection wasn't found on your account." />
      </>
    );
  }

  if (success) {
    const periodStartRaw = typeof searchParams.periodStart === "string" ? searchParams.periodStart : undefined;
    const summaries = periodStartRaw
      ? await prisma.performanceSummary.findMany({
          where: { connectionId: connection.id, periodStart: new Date(periodStartRaw) },
          include: { kpiDefinition: true },
          orderBy: { kpiDefinition: { name: "asc" } },
        })
      : [];
    const overall = summaries.length > 0 ? rollupStatus(summaries.map((s) => s.status)) : null;

    return (
      <>
        <PageHeader title="Submit KPI" description={connection.clientName} />
        <Card className="mx-auto max-w-lg p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <h2 className="mt-4 text-xl font-semibold tracking-tight">Submission recorded</h2>
          <p className="mt-2 text-sm text-muted">Thanks — your KPI values have been saved.</p>
          {overall && (
            <div className="mt-3 flex justify-center">
              <StatusBadge status={overall} />
            </div>
          )}
          {summaries.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-left">
              {summaries.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-1.5 text-sm"
                >
                  <span>{s.kpiDefinition.name}</span>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/dashboard/connections"
            className="mt-6 inline-block text-sm text-accent hover:underline"
          >
            Back to My VA Connections
          </Link>
        </Card>
      </>
    );
  }

  if (!period) {
    return (
      <>
        <PageHeader title="Submit KPI" description={connection.clientName} />
        <Card className="mx-auto max-w-lg p-8">
          <h2 className="text-center text-lg font-semibold tracking-tight">
            Which period are you submitting for?
          </h2>
          <PeriodForm
            maxDate={toDateParam(new Date())}
            extraParams={{ connectionId: connection.id }}
          />
        </Card>
      </>
    );
  }

  const anchorDate = parseAnchorDate(dateParam);
  const dateIsInFuture = anchorDate ? anchorDate.getTime() > startOfTodayUtc() : false;

  const backToPeriodHref = `/dashboard/submit-kpi?connectionId=${connection.id}`;

  if (dateIsInFuture) {
    return (
      <>
        <PageHeader title="Submit KPI" description={connection.clientName} />
        <Card className="mx-auto max-w-lg p-8 text-center">
          <h2 className="text-lg font-semibold tracking-tight">That date is in the future</h2>
          <p className="mt-2 text-sm text-muted">Pick today or an earlier date to submit for.</p>
          <Link href={backToPeriodHref} className="mt-4 inline-block text-sm text-accent hover:underline">
            Start over
          </Link>
        </Card>
      </>
    );
  }

  const kpiDefinitions = await prisma.kpiDefinition.findMany({
    where: { departmentId: connection.departmentId, period },
    orderBy: { name: "asc" },
    include: { kpiConfigs: { where: { connectionId: connection.id } } },
  });
  const kpis = kpiDefinitions
    .map((kpi) => ({ kpi, config: kpi.kpiConfigs[0] }))
    .filter(({ config }) => config?.isApplicable ?? true);

  const weekStartDay = await getWeekStartDay();
  const periodStart = currentPeriodStart(period, anchorDate, weekStartDay);
  const alreadySubmitted =
    session.role === "VA" &&
    (await prisma.performanceSummary.findFirst({
      where: { connectionId: connection.id, periodStart },
    })) !== null;

  const outsideWindow =
    session.role === "VA" &&
    !isWithinSubmissionWindow(
      connection.department.submissionWindowStart,
      connection.department.submissionWindowEnd,
      new Date(),
    );

  return (
    <>
      <PageHeader
        title="Submit KPI"
        description={`${connection.clientName} · ${connection.department.name} · ${
          period === KpiPeriod.WEEKLY ? "Weekly" : "Monthly"
        }`}
      />
      <Card className="mx-auto max-w-lg p-8">
        {alreadySubmitted ? (
          <p className="text-center text-sm text-muted">
            This period has already been submitted. Contact your Team Leader or Manager if it
            needs to be corrected.
          </p>
        ) : outsideWindow ? (
          <p className="text-center text-sm text-muted">
            Submissions for {connection.department.name} are only accepted between{" "}
            {formatManilaWindow(
              connection.department.submissionWindowStart!,
              connection.department.submissionWindowEnd!,
            )}
            . Please come back during that window.
          </p>
        ) : kpis.length === 0 ? (
          <p className="text-center text-sm text-muted">
            No {period === KpiPeriod.WEEKLY ? "weekly" : "monthly"} KPIs are configured for{" "}
            {connection.department.name} yet.
          </p>
        ) : (
          <form action={createSubmission}>
            <input type="hidden" name="connectionId" value={connection.id} />
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="returnTo" value="/dashboard/submit-kpi" />
            {dateParam && <input type="hidden" name="date" value={dateParam} />}
            <div className="space-y-3">
              <div className="rounded-lg border border-surface-border bg-background/40 px-3 py-2 text-xs text-muted">
                Submitting as{" "}
                <span className="text-foreground">{session.name ?? session.email}</span> for
                period starting {periodStart.toLocaleDateString()}.
              </div>
              {kpis.map(({ kpi, config }, i) => (
                <KpiValueField
                  key={kpi.id}
                  name={`kpi_${kpi.id}`}
                  label={kpi.name}
                  hint={`target ${config?.targetValue ?? kpi.targetValue}, ${
                    kpi.direction === KpiDirection.HIGHER_IS_BETTER ? "higher is better" : "lower is better"
                  }`}
                  index={i}
                />
              ))}
              <Button type="submit" className="flex w-full items-center justify-center gap-2">
                Submit
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </form>
        )}
        <Link href={backToPeriodHref} className="mt-6 block text-center text-xs text-muted hover:underline">
          Start over
        </Link>
      </Card>
    </>
  );
}

function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
