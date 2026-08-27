import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { HeroBackground } from "@/components/hero-background";
import { AuthModal } from "@/components/auth-modal";
import { StatusBadge } from "@/components/status-badge";
import { KpiValueField } from "@/components/kpi-value-field";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { currentPeriodStart, parseAnchorDate, toDateParam } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { isWithinSubmissionWindow, formatManilaWindow } from "@/lib/submission-window";
import { rollupStatus } from "@/lib/performance";
import { normalizeShortCode } from "@/lib/connection-short-code";
import { checkRateLimit, formatRetryAfter } from "@/lib/rate-limit";
import { getKpiClusters, getSubmittableKpis, groupByCluster } from "@/lib/kpi-cluster";
import { PeriodForm } from "./period-form";
import { CodeForm } from "./code-form";
import { ClusterForm } from "./cluster-form";
import { SubmitForm } from "./submit-form";
import { SubmitShell } from "./submit-shell";
import { AllClustersForm } from "./all-clusters-form";

const TOTAL_STEPS = 4;

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <div className="text-center">
      <div className="flex justify-center gap-1.5">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`h-1 w-9 rounded-full transition ${
              i < step ? "bg-accent" : "bg-surface-border"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs tracking-wide text-muted uppercase">
        Step {step} of {TOTAL_STEPS}
      </p>
      {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
    </div>
  );
}

function StartOverLink() {
  return (
    <Link
      href="/submit"
      className="mt-6 block text-center text-xs text-muted hover:underline"
    >
      Start over
    </Link>
  );
}

export default async function SubmitPage(props: PageProps<"/submit">) {
  const searchParams = await props.searchParams;
  const period =
    typeof searchParams.period === "string" && Object.values(KpiPeriod).includes(searchParams.period as KpiPeriod)
      ? (searchParams.period as KpiPeriod)
      : undefined;
  const dateParam = typeof searchParams.date === "string" ? searchParams.date : undefined;
  const codeParam = typeof searchParams.code === "string" ? searchParams.code.trim() : undefined;
  const clusterParam = typeof searchParams.cluster === "string" ? searchParams.cluster : undefined;
  const viewAll = searchParams.view === "all";
  const success = searchParams.success === "1";

  const session = await auth();

  if (success) {
    const successConnectionId =
      typeof searchParams.connectionId === "string" ? searchParams.connectionId : undefined;
    const successPeriodStartRaw =
      typeof searchParams.periodStart === "string" ? searchParams.periodStart : undefined;
    const successPeriod =
      typeof searchParams.period === "string" && Object.values(KpiPeriod).includes(searchParams.period as KpiPeriod)
        ? searchParams.period
        : undefined;
    const successCode = typeof searchParams.code === "string" ? searchParams.code : undefined;
    const successDate = typeof searchParams.date === "string" ? searchParams.date : undefined;
    // Straight back to the cluster picker for this same connection/period —
    // most VAs have more than one area to submit in a sitting, and
    // shouldn't have to re-enter the period and connection code each time.
    const submitAnotherAreaHref =
      successPeriod && successCode
        ? `/submit?${new URLSearchParams({
            period: successPeriod,
            code: successCode,
            ...(successDate ? { date: successDate } : {}),
          }).toString()}`
        : undefined;
    const summaries =
      successConnectionId && successPeriodStartRaw
        ? await prisma.performanceSummary.findMany({
            where: {
              connectionId: successConnectionId,
              periodStart: new Date(successPeriodStartRaw),
            },
            include: { kpiDefinition: true },
            orderBy: [{ kpiDefinition: { cluster: "asc" } }, { kpiDefinition: { name: "asc" } }],
          })
        : [];
    const overall = summaries.length > 0 ? rollupStatus(summaries.map((s) => s.status)) : null;
    // Grouped by cluster/area — a period can accumulate submissions from
    // more than one area, and several areas share KPI names (e.g. Facebook
    // and Instagram both have an "Engagement Rate"), so a flat list would
    // read as duplicates.
    const groupedSummaries = groupByCluster(summaries);

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
            href="/submit"
            className="mt-3 block text-center text-sm text-accent hover:underline"
          >
            Submit for a different connection
          </Link>
        </div>
      </SubmitShell>
    );
  }

  // Step 1: which period, and which instance of it (defaults to "current").
  if (!period) {
    return (
      <SubmitShell>
        <StepHeader step={1} title="Which period are you submitting for?" />
        <PeriodForm maxDate={toDateParam(new Date())} />
      </SubmitShell>
    );
  }

  const anchorDate = parseAnchorDate(dateParam);
  const dateIsInFuture = anchorDate ? anchorDate.getTime() > startOfTodayUtc() : false;

  // Step 2: paste the connection code — replaces the old dropdown that
  // listed every connection in a manager's scope (a privacy leak: OM/DM
  // roles could see every other VA's client names). No connection lookup
  // happens yet, so nothing about which connections exist is exposed here.
  if (!codeParam) {
    return (
      <SubmitShell>
        <StepHeader
          step={2}
          title="Enter your connection code"
          subtitle="You can find this on your connection card, or your manager can share it with you."
        />
        {dateIsInFuture && (
          <p className="mt-4 text-center text-sm text-danger">
            That date is in the future — pick today or an earlier date.
          </p>
        )}
        <CodeForm period={period} dateParam={dateParam} />
        <StartOverLink />
      </SubmitShell>
    );
  }

  // Step 3 (gate): must be signed in before we resolve the code or show
  // anything about the connection it points to.
  if (!session?.user) {
    const redirectTo = `/submit?${new URLSearchParams({
      period,
      ...(dateParam ? { date: dateParam } : {}),
      code: codeParam,
    }).toString()}`;
    return (
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
        <HeroBackground />
        <AuthModal open redirectTo={redirectTo} />
      </main>
    );
  }

  if (dateIsInFuture) {
    return (
      <SubmitShell>
        <StepHeader step={1} title="That date is in the future" />
        <p className="mt-4 text-center text-sm text-muted">
          Pick today or an earlier date to submit for.
        </p>
        <StartOverLink />
      </SubmitShell>
    );
  }

  const scope = connectionScopeWhere({
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
  });

  const shortCode = normalizeShortCode(codeParam);
  // Fetched alongside the connection lookup rather than after it — unrelated
  // queries, and running them serially just adds a second round trip to a
  // page that's already a fresh navigation per wizard step.
  const [connection, weekStartDay] = await Promise.all([
    prisma.connection.findFirst({
      where: { shortCode, ...scope },
      include: { department: true, vaUser: true },
    }),
    getWeekStartDay(),
  ]);

  const codeStepHref = `/submit?${new URLSearchParams({
    period,
    ...(dateParam ? { date: dateParam } : {}),
  }).toString()}`;

  if (!connection) {
    // Rate-limit failed lookups only, keyed by account — a code that
    // resolves never touches this, so normal multi-area submitting (which
    // revisits this page many times with the same code in the URL) can't
    // burn through the budget. Only repeated code-guessing (misses) does.
    const lookupLimit = await checkRateLimit(`submit-lookup:${session.user.id}`, {
      max: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!lookupLimit.allowed) {
      return (
        <SubmitShell>
          <StepHeader step={2} title="Too many attempts" />
          <p className="mt-4 text-center text-sm text-muted">
            Please wait {formatRetryAfter(lookupLimit.retryAfterMs)} before trying another code.
          </p>
          <StartOverLink />
        </SubmitShell>
      );
    }

    return (
      <SubmitShell>
        <StepHeader step={2} title="Code not recognized" />
        <p className="mt-4 text-center text-sm text-muted">
          That code doesn&apos;t match a connection on your account. Double-check it
          and try again, or contact your manager.
        </p>
        <Link
          href={codeStepHref}
          className="mt-6 block text-center text-sm text-accent hover:underline"
        >
          Try another code
        </Link>
        <StartOverLink />
      </SubmitShell>
    );
  }

  // VAs can't resubmit once a period is finalized; managers (DM/OM/ADMIN)
  // can still go back and correct it — mirrors the legacy
  // isSummarySubmitted() check. Computed once up front since both the
  // cluster picker (Step 3) and the value-entry step (Step 4) need it.
  const periodStart = currentPeriodStart(period, anchorDate, weekStartDay);

  const clusterStepHref = `/submit?${new URLSearchParams({
    period,
    ...(dateParam ? { date: dateParam } : {}),
    code: codeParam,
  }).toString()}`;

  const clusters = await getKpiClusters({
    departmentId: connection.departmentId,
    period,
    connectionId: connection.id,
    periodStart,
  });

  // Daily submission window (VAs only) — spreads submission traffic across
  // the day instead of everyone hitting /submit at the same time. Checked
  // before the cluster picker too, so a VA outside the window sees why
  // there's nothing to pick rather than an empty-looking list.
  const outsideWindow =
    session.user.role === "VA" &&
    !isWithinSubmissionWindow(
      connection.department.submissionWindowStart,
      connection.department.submissionWindowEnd,
      new Date(),
    );

  const subtitle = `${connection.vaUser.name ?? connection.vaUser.email} · ${connection.clientName} · ${
    connection.department.name
  } · ${period === KpiPeriod.WEEKLY ? "Weekly" : "Monthly"}`;

  // "View all clusters" — every not-yet-submitted area on one scrollable
  // page with a single Submit at the bottom, for a VA who'd rather fill in
  // everything in one sitting than submit-and-redirect per area.
  if (viewAll) {
    const groups = await getSubmittableKpis(
      { departmentId: connection.departmentId, period, connectionId: connection.id, periodStart },
      { excludeSubmitted: session.user.role === "VA" },
    );
    const drafts = await prisma.submissionDraft.findMany({
      where: { connectionId: connection.id, period, periodStart },
      select: { kpiDefinitionId: true, value: true, noData: true },
    });
    const initialDrafts = Object.fromEntries(
      drafts.map((d) => [d.kpiDefinitionId, { value: d.value, noData: d.noData }]),
    );

    return (
      <SubmitShell>
        <StepHeader step={4} title="All areas" subtitle={subtitle} />
        {outsideWindow ? (
          <p className="mt-6 text-center text-sm text-muted">
            Submissions for {connection.department.name} are only accepted
            between{" "}
            {formatManilaWindow(
              connection.department.submissionWindowStart!,
              connection.department.submissionWindowEnd!,
            )}
            . Please come back during that window.
          </p>
        ) : groups.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">
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
            submittingAsLabel={session.user.name ?? session.user.email ?? ""}
            periodStartLabel={periodStart.toLocaleDateString()}
            initialDrafts={initialDrafts}
          />
        )}
        <Link
          href={clusterStepHref}
          className="mt-6 block text-center text-xs text-muted hover:underline"
        >
          Back to areas
        </Link>
        <StartOverLink />
      </SubmitShell>
    );
  }

  const viewAllHref = `${clusterStepHref}&view=all`;

  // Step 3: which cluster (e.g. Facebook, Instagram, Amazon Task-based) —
  // lets a VA submit one focused group of KPIs at a time instead of
  // scrolling every KPI the department has.
  const selectedCluster = clusterParam ? clusters.find((c) => c.cluster === clusterParam) : undefined;
  if (!clusterParam || !selectedCluster) {
    return (
      <SubmitShell>
        <StepHeader step={3} title="Which area are you submitting for?" subtitle={subtitle} />
        {outsideWindow ? (
          <p className="mt-6 text-center text-sm text-muted">
            Submissions for {connection.department.name} are only accepted
            between{" "}
            {formatManilaWindow(
              connection.department.submissionWindowStart!,
              connection.department.submissionWindowEnd!,
            )}
            . Please come back during that window.
          </p>
        ) : clusters.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">
            No {period === KpiPeriod.WEEKLY ? "weekly" : "monthly"} KPIs are
            configured for {connection.department.name} yet.
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
              extraParams={{ period, ...(dateParam ? { date: dateParam } : {}), code: codeParam }}
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
        <StartOverLink />
      </SubmitShell>
    );
  }

  const kpiDefinitions = await prisma.kpiDefinition.findMany({
    where: { departmentId: connection.departmentId, period, cluster: selectedCluster.cluster },
    orderBy: { name: "asc" },
    include: { kpiConfigs: { where: { connectionId: connection.id } } },
  });
  // Mirrors createSubmission()'s own kpisWithConfig filter (and legacy's
  // IsApplicable filter in loadReportKPIs()) — a KPI marked not-applicable
  // for this specific connection shouldn't show a blank field the VA fills
  // in only to have the value silently dropped on submit. Also resolves the
  // per-connection target override (KPI Config page) so the "target X" hint
  // shown here always matches what createSubmission actually grades against.
  const kpis = kpiDefinitions
    .map((kpi) => ({ kpi, config: kpi.kpiConfigs[0] }))
    .filter(({ config }) => config?.isApplicable ?? true);

  const alreadySubmitted =
    session.user.role === "VA" && selectedCluster.submittedCount >= selectedCluster.kpiCount;

  return (
    <SubmitShell>
      <StepHeader step={4} title={selectedCluster.cluster} subtitle={subtitle} />

      {alreadySubmitted ? (
        <p className="mt-6 text-center text-sm text-muted">
          {selectedCluster.cluster} has already been submitted for this
          period. Contact your Team Leader or Manager if it needs to be
          corrected.
        </p>
      ) : outsideWindow ? (
        <p className="mt-6 text-center text-sm text-muted">
          Submissions for {connection.department.name} are only accepted
          between{" "}
          {formatManilaWindow(
            connection.department.submissionWindowStart!,
            connection.department.submissionWindowEnd!,
          )}
          . Please come back during that window.
        </p>
      ) : kpis.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">
          No KPIs are configured for {selectedCluster.cluster} yet.
        </p>
      ) : (
        <SubmitForm
          className="mt-8"
          hidden={{
            connectionId: connection.id,
            period,
            cluster: selectedCluster.cluster,
            ...(dateParam ? { date: dateParam } : {}),
          }}
        >
          {/* A preview of what's about to be recorded — the VA sees this
              before it's saved, since it's the first point in the flow
              where any connection detail is shown at all. */}
          <div className="rounded-lg border border-surface-border bg-background/40 px-3 py-2 text-xs text-muted">
            Submitting as{" "}
            <span className="text-foreground">
              {session.user.name ?? session.user.email}
            </span>{" "}
            for period starting {periodStart.toLocaleDateString()}.
          </div>
          {kpis.map(({ kpi, config }, i) => (
            <KpiValueField
              key={kpi.id}
              name={`kpi_${kpi.id}`}
              label={kpi.name}
              hint={`target ${config?.targetValue ?? kpi.targetValue}, ${
                kpi.direction === KpiDirection.HIGHER_IS_BETTER
                  ? "higher is better"
                  : "lower is better"
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

      <Link
        href={clusterStepHref}
        className="mt-6 block text-center text-xs text-muted hover:underline"
      >
        Back to areas
      </Link>
      <StartOverLink />
    </SubmitShell>
  );
}

function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
