"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { currentPeriodStart, parseAnchorDate } from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { recomputePerformanceSummary } from "@/lib/performance";
import { connectionScopeWhere } from "@/lib/connection-scope";
import { isWithinSubmissionWindow, formatManilaWindow } from "@/lib/submission-window";
import { checkRateLimit, getClientIp, formatRetryAfter } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";
import { KpiPeriod } from "@/generated/prisma/enums";

/**
 * Expected, user-actionable failures (missing value, already submitted,
 * outside the submission window, rate-limited) are modeled as a return
 * value rather than a thrown Error — per Next.js's Server Function
 * guidance, since a throw here would surface as a generic crash screen
 * with the VA's already-entered values gone, instead of an inline message
 * they can act on. See SubmitForm, which drives this via useActionState.
 */
export async function createSubmission(
  prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Sign in required." };
  }

  const connectionId = String(formData.get("connectionId") ?? "");
  const period = String(formData.get("period") ?? "") as KpiPeriod;
  const anchorDate = parseAnchorDate(
    typeof formData.get("date") === "string" ? String(formData.get("date")) : undefined,
  );
  const clusterRaw = formData.get("cluster");
  const cluster = typeof clusterRaw === "string" && clusterRaw.length > 0 ? clusterRaw : undefined;
  // Plural `clusters` (comma-separated) — set by the "view all clusters"
  // form, which submits several areas in one call. Falls back to the
  // singular `cluster` for the existing one-area-at-a-time forms.
  const clustersRaw = formData.get("clusters");
  const targetClusters =
    typeof clustersRaw === "string" && clustersRaw.length > 0
      ? clustersRaw.split(",").filter(Boolean)
      : cluster
        ? [cluster]
        : undefined;

  if (!connectionId || !Object.values(KpiPeriod).includes(period)) {
    return { error: "Missing connection or period." };
  }

  // Two independent limits: per-connection (catches repeated spam against
  // one target) and per-IP (catches one caller hammering many connections).
  // Limits are generous rather than tight — every caller here is already
  // authenticated, and one connection's worth of legitimate submitting
  // (several KPI clusters, each its own call, plus the occasional
  // correction) or one manager backfilling many connections in a sitting
  // was tripping the old 10/30 caps.
  const ip = await getClientIp();
  const [connectionLimit, ipLimit] = await Promise.all([
    checkRateLimit(`submit:${connectionId}`, { max: 40, windowMs: 60 * 60 * 1000 }),
    checkRateLimit(`submit-ip:${ip}`, { max: 120, windowMs: 60 * 60 * 1000 }),
  ]);
  const limit = !connectionLimit.allowed ? connectionLimit : ipLimit;
  if (!limit.allowed) {
    return {
      error: `Too many submissions — please wait ${formatRetryAfter(limit.retryAfterMs)} and try again.`,
    };
  }

  const scope = connectionScopeWhere({
    id: session.user.id,
    role: session.user.role,
    departmentId: session.user.departmentId,
    teamId: session.user.teamId,
  });

  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, ...scope },
    include: {
      department: {
        include: {
          kpiDefinitions: {
            where: { period },
            include: {
              kpiConfigs: { where: { connectionId } },
            },
          },
        },
      },
      vaUser: { select: { teamId: true } },
    },
  });
  if (!connection) {
    return { error: "Connection not found." };
  }

  // VAs are subject to their department's submission window (spreads
  // traffic across the day); managers submitting on a VA's behalf are not.
  if (
    session.user.role === "VA" &&
    !isWithinSubmissionWindow(
      connection.department.submissionWindowStart,
      connection.department.submissionWindowEnd,
      new Date(),
    )
  ) {
    return {
      error: `Submissions for ${connection.department.name} are only accepted between ${formatManilaWindow(
        connection.department.submissionWindowStart!,
        connection.department.submissionWindowEnd!,
      )}. Please come back during that window.`,
    };
  }

  const kpisWithConfig = connection.department.kpiDefinitions
    .map((kpi) => ({ kpi, config: kpi.kpiConfigs[0] }))
    .filter(({ config }) => config?.isApplicable ?? true)
    .filter(({ kpi }) => !targetClusters || targetClusters.includes(kpi.cluster));

  const values: { kpiDefinitionId: string; value: number | null; noData: boolean }[] = [];
  const rawPayload: Record<string, number | string> = {};
  for (const { kpi } of kpisWithConfig) {
    const noData = formData.get(`kpi_${kpi.id}_nodata`) === "1";
    if (noData) {
      values.push({ kpiDefinitionId: kpi.id, value: null, noData: true });
      rawPayload[kpi.name] = "No data available";
      continue;
    }
    const raw = formData.get(`kpi_${kpi.id}`);
    const value = Number(raw);
    if (raw === null || raw === "" || Number.isNaN(value)) {
      return { error: `Missing value for ${kpi.name}.` };
    }
    values.push({ kpiDefinitionId: kpi.id, value, noData: false });
    rawPayload[kpi.name] = value;
  }

  if (values.length === 0) {
    return { error: "No KPIs to submit for this period." };
  }

  const weekStartDay = await getWeekStartDay();

  const periodStart = currentPeriodStart(period, anchorDate, weekStartDay);

  // Human-readable label for activity log / notification / error messages —
  // a single area name when submitting one cluster (as most calls still
  // do), or a count when the "view all clusters" form submits several at
  // once in a single call.
  const clusterLabel =
    targetClusters && targetClusters.length === 1
      ? targetClusters[0]
      : targetClusters && targetClusters.length > 1
        ? `${targetClusters.length} areas`
        : undefined;

  if (session.user.role === "VA") {
    // Scoped to just the targeted cluster(s)' KPIs (not the whole
    // department/period) — clusters can be submitted one at a time or
    // batched via "view all clusters", so an earlier submission's summary
    // rows must not block a later, still-unsubmitted cluster for the same
    // period.
    const alreadySubmitted = await prisma.performanceSummary.findFirst({
      where: {
        connectionId,
        periodStart,
        kpiDefinitionId: { in: kpisWithConfig.map(({ kpi }) => kpi.id) },
      },
    });
    if (alreadySubmitted) {
      const subject =
        targetClusters && targetClusters.length > 1
          ? "One or more of these areas have"
          : clusterLabel
            ? `${clusterLabel} has`
            : undefined;
      return {
        error: subject
          ? `${subject} already been submitted for this period. Contact your Team Leader or Manager if it needs to be corrected.`
          : "This period has already been submitted. Contact your Team Leader or Manager to correct it.",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.submission.create({
      data: {
        connectionId,
        period,
        periodStart,
        rawPayload,
        records: {
          create: values.map((v) => ({
            kpiDefinitionId: v.kpiDefinitionId,
            value: v.value,
            noData: v.noData,
          })),
        },
      },
    });

    // Actual = sum of every submitted value for this KPI/connection/period —
    // mirrors the legacy "normalize then summarize into one row" workflow,
    // since a period can receive more than one submission. Records marked
    // "no data available" are excluded; if every record for a KPI is
    // no-data, the aggregate comes back null and computeStatus reports
    // NO_DATA, same as if nothing were submitted at all.
    await recomputePerformanceSummary(tx, {
      connectionId,
      period,
      periodStart,
      kpiDefinitionIds: kpisWithConfig.map(({ kpi }) => kpi.id),
    });

    await logActivity(tx, {
      actor: {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      },
      action: "CREATE",
      entityType: "Submission",
      entityId: created.id,
      entityLabel: connection.clientName,
      summary: `Submitted ${period.toLowerCase()}${clusterLabel ? ` (${clusterLabel})` : ""} data for "${connection.clientName}"`,
      departmentId: connection.departmentId,
    });

    // Clears any autosaved drafts for the KPIs just submitted — e.g. from
    // the "view all clusters" form. Scoped to this call's own KPI ids, not
    // every draft for the period, so a still-unsubmitted cluster's draft
    // (outside the submission window, say) survives.
    await tx.submissionDraft.deleteMany({
      where: {
        connectionId,
        period,
        periodStart,
        kpiDefinitionId: { in: kpisWithConfig.map(({ kpi }) => kpi.id) },
      },
    });
  });

  // Whitelisted, not user-controlled input, despite coming from form data —
  // guards against an open redirect if the hidden field were ever tampered
  // with (formData is plain HTML, not signed).
  const requestedReturnTo = formData.get("returnTo");
  const returnTo = requestedReturnTo === "/dashboard/submit-kpi" ? requestedReturnTo : "/submit";

  // Carried through so the success screen can offer a direct "submit
  // another area" link straight back to the cluster picker for this same
  // connection/period, instead of making the VA re-enter the period (and,
  // on the public /submit flow, their connection code) from scratch.
  const successParams = new URLSearchParams({
    success: "1",
    connectionId,
    periodStart: periodStart.toISOString(),
    period,
  });
  const dateRaw = formData.get("date");
  if (typeof dateRaw === "string" && dateRaw) {
    successParams.set("date", dateRaw);
  }
  if (returnTo === "/submit") {
    successParams.set("code", connection.shortCode);
  }

  redirect(`${returnTo}?${successParams.toString()}`);
}
