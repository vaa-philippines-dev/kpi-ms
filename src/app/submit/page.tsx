import Link from "next/link";
import { CheckCircle2, ArrowRight, X } from "lucide-react";
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
import { createSubmission } from "./actions";
import { PeriodForm } from "./period-form";
import { CodeForm } from "./code-form";
import { SubmitFade } from "./submit-fade";

const TOTAL_STEPS = 3;

// Presented as a modal over the landing hero — same chrome as AuthModal —
// but /submit stays its own real URL, since it's the link VAs actually
// bookmark/get sent directly rather than reach by clicking through "/".
function SubmitShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <HeroBackground />
      {/* overflow-y-auto here (not on the card) is load-bearing: with ~9+
          KPIs the card can grow taller than the viewport, and without this
          the fixed overlay just clips it — the title and Submit button
          become unreachable with no way to scroll to them. */}
      <div className="animate-overlay-in fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm">
        <Link
          href="/"
          aria-label="Close"
          className="fixed top-5 right-5 z-[60] text-muted transition hover:text-foreground"
        >
          <X className="size-4" />
        </Link>
        <div className="animate-modal-pop relative my-auto w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-8 shadow-2xl shadow-black/40">
          {children}
        </div>
      </div>
    </main>
  );
}

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
  const success = searchParams.success === "1";

  const session = await auth();

  if (success) {
    const successConnectionId =
      typeof searchParams.connectionId === "string" ? searchParams.connectionId : undefined;
    const successPeriodStartRaw =
      typeof searchParams.periodStart === "string" ? searchParams.periodStart : undefined;
    const summaries =
      successConnectionId && successPeriodStartRaw
        ? await prisma.performanceSummary.findMany({
            where: {
              connectionId: successConnectionId,
              periodStart: new Date(successPeriodStartRaw),
            },
            include: { kpiDefinition: true },
            orderBy: { kpiDefinition: { name: "asc" } },
          })
        : [];
    const overall = summaries.length > 0 ? rollupStatus(summaries.map((s) => s.status)) : null;

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
            href="/submit"
            className="mt-6 inline-block text-sm text-accent hover:underline"
          >
            Submit another
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

  // Rate-limit the code -> connection lookup, keyed by account (the only
  // surface that's guessable now that it's not behind a browsable list).
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

  const scope = connectionScopeWhere({
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
  });

  const shortCode = normalizeShortCode(codeParam);
  const connection = await prisma.connection.findFirst({
    where: { shortCode, ...scope },
    include: { department: true, vaUser: true },
  });

  const codeStepHref = `/submit?${new URLSearchParams({
    period,
    ...(dateParam ? { date: dateParam } : {}),
  }).toString()}`;

  if (!connection) {
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

  const kpiDefinitions = await prisma.kpiDefinition.findMany({
    where: { departmentId: connection.departmentId, period },
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

  // VAs can't resubmit once a period is finalized; managers (DM/OM/ADMIN)
  // can still go back and correct it — mirrors the legacy
  // isSummarySubmitted() check.
  const weekStartDay = await getWeekStartDay();
  const periodStart = currentPeriodStart(period, anchorDate, weekStartDay);
  const alreadySubmitted =
    session.user.role === "VA" &&
    (await prisma.performanceSummary.findFirst({
      where: { connectionId: connection.id, periodStart },
    })) !== null;

  // Daily submission window (VAs only) — spreads submission traffic across
  // the day instead of everyone hitting /submit at the same time.
  const outsideWindow =
    session.user.role === "VA" &&
    !isWithinSubmissionWindow(
      connection.department.submissionWindowStart,
      connection.department.submissionWindowEnd,
      new Date(),
    );

  return (
    <SubmitShell>
      <StepHeader
        step={3}
        title="Enter your KPI values"
        subtitle={`${connection.vaUser.name ?? connection.vaUser.email} · ${connection.clientName} · ${
          connection.department.name
        } · ${period === KpiPeriod.WEEKLY ? "Weekly" : "Monthly"}`}
      />

      {alreadySubmitted ? (
        <p className="mt-6 text-center text-sm text-muted">
          This period has already been submitted. Contact your Team Leader or
          Manager if it needs to be corrected.
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
          No {period === KpiPeriod.WEEKLY ? "weekly" : "monthly"} KPIs are
          configured for {connection.department.name} yet.
        </p>
      ) : (
        <form action={createSubmission} className="mt-8">
          <input type="hidden" name="connectionId" value={connection.id} />
          <input type="hidden" name="period" value={period} />
          {dateParam && <input type="hidden" name="date" value={dateParam} />}
          <SubmitFade>
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
                index={i}
              />
            ))}
            <Button type="submit" className="flex w-full items-center justify-center gap-2">
              Submit
              <ArrowRight className="size-4" />
            </Button>
          </SubmitFade>
        </form>
      )}

      <StartOverLink />
    </SubmitShell>
  );
}

function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
