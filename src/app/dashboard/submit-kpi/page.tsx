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
import { rollupStatus, excludeInapplicable } from "@/lib/performance";
import { getKpiClusters, getSubmittableKpis, groupByCluster } from "@/lib/kpi-cluster";
import { PeriodForm } from "@/app/submit/period-form";
import { ClusterForm } from "@/app/submit/cluster-form";
import { SubmitForm } from "@/app/submit/submit-form";
import { AllClustersForm } from "@/app/submit/all-clusters-form";

/**
 * The logged-in counterpart to /submit: reached from a "Submit KPI" button
 * on a specific connection card (Dashboard overview, My Connections), so
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
  const clusterParam = typeof searchParams.cluster === "string" ? searchParams.cluster : undefined;
  const viewAll = searchParams.view === "all";
  const success = searchParams.success === "1";

  if (!connectionId) {
    return (
      <>
        <PageHeader title="Submit KPI" description="Log actuals for one of your connections." />
        <ComingSoon note="Open a connection from My Connections and click Submit KPI to get started." />
      </>
    );
  }

  const scope = connectionScopeWhere(session);
  // Fetched alongside the connection lookup rather than after it (once
  // `period`/`date` are known further down) — unrelated queries, no reason
  // to pay for them as two serial round trips.
  const [connection, weekStartDay] = await Promise.all([
    prisma.connection.findFirst({
      where: { id: connectionId, ...scope },
      include: { department: true, vaUser: true },
    }),
    getWeekStartDay(),
  ]);

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
    const successPeriod =
      typeof searchParams.period === "string" && Object.values(KpiPeriod).includes(searchParams.period as KpiPeriod)
        ? searchParams.period
        : undefined;
    const successDate = typeof searchParams.date === "string" ? searchParams.date : undefined;
    // Straight back to the cluster picker for this same connection/period —
    // most VAs have more than one area to submit in a sitting.
    const submitAnotherAreaHref = successPeriod
      ? `/dashboard/submit-kpi?${new URLSearchParams({
          connectionId: connection.id,
          period: successPeriod,
          ...(successDate ? { date: successDate } : {}),
        }).toString()}`
      : undefined;
    const [rawSummaries, inapplicableConfigs] = periodStartRaw
      ? await Promise.all([
          prisma.performanceSummary.findMany({
            where: { connectionId: connection.id, periodStart: new Date(periodStartRaw) },
            include: { kpiDefinition: true },
            orderBy: [{ kpiDefinition: { cluster: "asc" } }, { kpiDefinition: { name: "asc" } }],
          }),
          // Not-applicable KPIs can still have a PerformanceSummary row left
          // over from before they were marked N/A — excluded below so a
          // stale status doesn't drag down this connection's rollup.
          prisma.kpiConfig.findMany({
            where: { connectionId: connection.id, isApplicable: false },
            select: { kpiDefinitionId: true },
          }),
        ])
      : [[], []];
    const inapplicableKpiIds = new Set(inapplicableConfigs.map((c) => c.kpiDefinitionId));
    const summaries = excludeInapplicable(rawSummaries, inapplicableKpiIds);
    const overall = summaries.length > 0 ? rollupStatus(summaries.map((s) => s.status)) : null;
    // Grouped by cluster/area — several areas share KPI names (e.g.
    // Facebook and Instagram both have an "Engagement Rate"), so a flat
    // list would read as duplicates.
    const groupedSummaries = groupByCluster(summaries);

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
          {groupedSummaries.length > 0 && (
            <div className="mt-4 space-y-4 text-left">
              {groupedSummaries.map((group) => (
                <div key={group.cluster}>
                  <p className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
                    {group.cluster}
                  </p>
                  <ul className="space-y-1.5">
                    {group.items.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-1.5 text-sm"
                      >
                        <span>{s.kpiDefinition.name}</span>
                        <StatusBadge status={s.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {submitAnotherAreaHref && (
            <Link
              href={submitAnotherAreaHref}
              className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Submit another area
              <ArrowRight className="size-4" />
            </Link>
          )}
          <Link
            href="/dashboard/connections"
            className="mt-3 block text-center text-sm text-accent hover:underline"
          >
            Back to My Connections
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

  const periodStart = currentPeriodStart(period, anchorDate, weekStartDay);

  const clusters = await getKpiClusters({
    departmentId: connection.departmentId,
    period,
    connectionId: connection.id,
    periodStart,
  });

  const outsideWindow =
    session.role === "VA" &&
    !isWithinSubmissionWindow(
      connection.department.submissionWindowStart,
      connection.department.submissionWindowEnd,
      new Date(),
    );

  const headerDescription = `${connection.clientName} · ${connection.department.name} · ${
    period === KpiPeriod.WEEKLY ? "Weekly" : "Monthly"
  }`;

  const clusterStepHref = `/dashboard/submit-kpi?${new URLSearchParams({
    connectionId: connection.id,
    period,
    ...(dateParam ? { date: dateParam } : {}),
  }).toString()}`;

  // "View all clusters" — every not-yet-submitted area on one scrollable
  // page with a single Submit at the bottom, for a VA who'd rather fill in
  // everything in one sitting than submit-and-redirect per area.
  if (viewAll) {
    const groups = await getSubmittableKpis(
      { departmentId: connection.departmentId, period, connectionId: connection.id, periodStart },
      { excludeSubmitted: session.role === "VA" },
    );
    const drafts = await prisma.submissionDraft.findMany({
      where: { connectionId: connection.id, period, periodStart },
      select: { kpiDefinitionId: true, value: true, noData: true },
    });
    const initialDrafts = Object.fromEntries(
      drafts.map((d) => [d.kpiDefinitionId, { value: d.value, noData: d.noData }]),
    );

    return (
      <>
        <PageHeader title="Submit KPI" description={`${headerDescription} · All areas`} />
        <Card className="mx-auto max-w-lg p-8">
          {outsideWindow ? (
            <p className="text-center text-sm text-muted">
              Submissions for {connection.department.name} are only accepted between{" "}
              {formatManilaWindow(
                connection.department.submissionWindowStart!,
                connection.department.submissionWindowEnd!,
              )}
              . Please come back during that window.
            </p>
          ) : groups.length === 0 ? (
            <p className="text-center text-sm text-muted">
              {clusters.length === 0
                ? `No ${period === KpiPeriod.WEEKLY ? "weekly" : "monthly"} KPIs are configured for ${connection.department.name} yet.`
                : "Everything has already been submitted for this period."}
            </p>
          ) : (
            <AllClustersForm
              groups={groups}
              connectionId={connection.id}
              period={period}
              dateParam={dateParam}
              returnTo="/dashboard/submit-kpi"
              submittingAsLabel={session.name ?? session.email ?? ""}
              periodStartLabel={periodStart.toLocaleDateString()}
              initialDrafts={initialDrafts}
            />
          )}
          <Link href={clusterStepHref} className="mt-6 block text-center text-xs text-muted hover:underline">
            Back to areas
          </Link>
          <Link href={backToPeriodHref} className="mt-1.5 block text-center text-xs text-muted hover:underline">
            Start over
          </Link>
        </Card>
      </>
    );
  }

  const viewAllHref = `${clusterStepHref}&view=all`;

  // Which cluster (e.g. Facebook, Instagram, Amazon Task-based) — lets a VA
  // submit one focused group of KPIs at a time instead of scrolling every
  // KPI the department has.
  const selectedCluster = clusterParam ? clusters.find((c) => c.cluster === clusterParam) : undefined;
  if (!clusterParam || !selectedCluster) {
    return (
      <>
        <PageHeader title="Submit KPI" description={headerDescription} />
        <Card className="mx-auto max-w-lg p-8">
          <h2 className="text-center text-lg font-semibold tracking-tight">
            Which area are you submitting for?
          </h2>
          {outsideWindow ? (
            <p className="mt-6 text-center text-sm text-muted">
              Submissions for {connection.department.name} are only accepted between{" "}
              {formatManilaWindow(
                connection.department.submissionWindowStart!,
                connection.department.submissionWindowEnd!,
              )}
              . Please come back during that window.
            </p>
          ) : clusters.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted">
              No {period === KpiPeriod.WEEKLY ? "weekly" : "monthly"} KPIs are configured for{" "}
              {connection.department.name} yet.
            </p>
          ) : (
            <>
              {clusterParam && (
                <p className="mt-4 text-center text-sm text-danger">
                  &ldquo;{clusterParam}&rdquo; isn&apos;t one of {connection.department.name}
                  &apos;s areas — pick one below.
                </p>
              )}
              <ClusterForm
                clusters={clusters}
                extraParams={{
                  connectionId: connection.id,
                  period,
                  ...(dateParam ? { date: dateParam } : {}),
                }}
              />
              {clusters.length > 1 && (
                <Link
                  href={viewAllHref}
                  className="mt-4 block text-center text-sm text-accent hover:underline"
                >
                  View all clusters instead →
                </Link>
              )}
            </>
          )}
          <Link href={backToPeriodHref} className="mt-6 block text-center text-xs text-muted hover:underline">
            Start over
          </Link>
        </Card>
      </>
    );
  }

  const kpiDefinitions = await prisma.kpiDefinition.findMany({
    where: { departmentId: connection.departmentId, period, cluster: selectedCluster.cluster },
    orderBy: { name: "asc" },
    include: { kpiConfigs: { where: { connectionId: connection.id } } },
  });
  const kpis = kpiDefinitions
    .map((kpi) => ({ kpi, config: kpi.kpiConfigs[0] }))
    .filter(({ config }) => config?.isApplicable ?? true);

  const alreadySubmitted =
    session.role === "VA" && selectedCluster.submittedCount >= selectedCluster.kpiCount;

  return (
    <>
      <PageHeader title="Submit KPI" description={`${headerDescription} · ${selectedCluster.cluster}`} />
      <Card className="mx-auto max-w-lg p-8">
        {alreadySubmitted ? (
          <p className="text-center text-sm text-muted">
            {selectedCluster.cluster} has already been submitted for this period. Contact your
            Team Leader or Manager if it needs to be corrected.
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
            No KPIs are configured for {selectedCluster.cluster} yet.
          </p>
        ) : (
          <SubmitForm
            hidden={{
              connectionId: connection.id,
              period,
              cluster: selectedCluster.cluster,
              returnTo: "/dashboard/submit-kpi",
              ...(dateParam ? { date: dateParam } : {}),
            }}
          >
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
                cluster={selectedCluster.cluster}
                index={i}
              />
            ))}
            <Button type="submit" className="flex w-full items-center justify-center gap-2">
              Submit
              <ArrowRight className="size-4" />
            </Button>
          </SubmitForm>
        )}
        <Link href={clusterStepHref} className="mt-6 block text-center text-xs text-muted hover:underline">
          Back to areas
        </Link>
        <Link href={backToPeriodHref} className="mt-1.5 block text-center text-xs text-muted hover:underline">
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
