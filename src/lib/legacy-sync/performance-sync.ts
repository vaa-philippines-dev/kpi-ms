import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { readLegacySheet } from "./sheets-client";
import { mapWithConcurrency } from "./concurrency";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";
import type { PhaseResult, SyncReport } from "./reference-sync";

function emptyResult(): PhaseResult {
  return { created: 0, updated: 0, skipped: 0, errors: [] };
}

const LEGACY_STATUS_MAP: Record<string, PerformanceStatus> = {
  "On Target": PerformanceStatus.ON_TARGET,
  "At Risk": PerformanceStatus.AT_RISK,
  Critical: PerformanceStatus.CRITICAL,
  "No Data": PerformanceStatus.NO_DATA,
};

type LegacyKpiEntry = {
  kpiId: string;
  target: number;
  actual: number | null;
  noData: boolean;
  status: string;
};

/** Legacy's SubmittedAt is a plain date/time string ("2026-05-11 14:32:00"
 *  or similar) — falls back to periodStart (still better than "now", which
 *  would make decades-old legacy data look like it just came in) when
 *  missing or unparseable. */
function parseSubmittedAt(raw: string | undefined, periodStart: Date): Date {
  if (!raw) return periodStart;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? periodStart : d;
}

/** "2026-05-11" (weekly) or "May 2026" (monthly) -> UTC period start. */
function parsePeriodStart(raw: string, period: KpiPeriod): Date | null {
  if (!raw) return null;
  if (period === KpiPeriod.WEEKLY) {
    const d = new Date(raw + "T00:00:00.000Z");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // "May 2026" style
  const parsed = new Date(`1 ${raw} UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
}

/**
 * Imports historical PerformanceSummary rows from the legacy
 * KPI_Weekly_Summary / KPI_Monthly_Summary sheets' `KPIs` JSON blob
 * (already-computed per-KPI actual/target/status — legacy's own
 * two-tier calcStatus() output, the same formula this app ported).
 * Upserted by the existing (connectionId, kpiDefinitionId, periodStart)
 * unique key, so this is safe to re-run.
 *
 * The existence check is one batch query per period (not one per row) —
 * with ~10.7k summary rows across both sheets, a per-row findUnique would
 * mean tens of thousands of extra round-trips to a remote Postgres. The
 * upserts themselves run with bounded concurrency (see mapWithConcurrency
 * below) rather than one at a time — serial awaits over that many rows
 * blew past Vercel's function timeout before this ran to completion.
 *
 * Also backfills one Submission (+ SubmissionRecord per KPI) per legacy
 * summary row, for any (connection, period, periodStart) that doesn't
 * already have a real one — this import used to only touch PerformanceSummary,
 * which left every legacy-only period looking "not submitted" everywhere
 * that (correctly) checks Submission existence instead of PerformanceSummary
 * presence, e.g. the History page and getConnectionWeekDetail. Re-run-safe:
 * a period already covered by a real or previously-backfilled Submission is
 * skipped, never duplicated.
 */
export async function runPerformanceSync(
  onProgress?: (phase: string, done: number, total: number) => void,
  options?: { dryRun?: boolean },
): Promise<SyncReport> {
  const dryRun = options?.dryRun ?? false;
  const report: SyncReport = {};

  const [connections, kpiDefs, kpiConfigs] = await Promise.all([
    prisma.connection.findMany({
      where: { externalWfmId: { not: null } },
      select: { id: true, externalWfmId: true },
    }),
    prisma.kpiDefinition.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true, name: true, period: true, targetValue: true },
    }),
    prisma.kpiConfig.findMany({
      select: { connectionId: true, kpiDefinitionId: true, targetValue: true },
    }),
  ]);
  const connMap = new Map(connections.map((c) => [c.externalWfmId!, c.id]));
  const kpiDefMap = new Map(kpiDefs.map((k) => [`${k.legacyId}:${k.period}`, k.id]));
  // Legacy's own summary popup falls back to the connection's configured
  // target, then the KPI's department default, whenever the submitted
  // entry's own target is blank — see AppSettings.html's displayTgt chain.
  // Mirrored here so the fallback is baked into the stored row instead of
  // silently landing on 0 (a blank string is finite once Number()'d).
  const defaultTargetByKpiId = new Map(kpiDefs.map((k) => [k.id, k.targetValue]));
  const kpiNameById = new Map(kpiDefs.map((k) => [k.id, k.name]));
  const configTargetByKey = new Map(
    kpiConfigs
      .filter((c) => c.targetValue !== null)
      .map((c) => [`${c.connectionId}:${c.kpiDefinitionId}`, c.targetValue!]),
  );

  for (const [sheetName, period] of [
    ["KPI_Weekly_Summary", KpiPeriod.WEEKLY],
    ["KPI_Monthly_Summary", KpiPeriod.MONTHLY],
  ] as const) {
    const result = emptyResult();
    const rows = await readLegacySheet(sheetName);
    const dateKey = period === KpiPeriod.WEEKLY ? "WeekStartDate" : "MonthStartDate";

    const existingKeys = new Set(
      (
        await prisma.performanceSummary.findMany({
          where: { period },
          select: { connectionId: true, kpiDefinitionId: true, periodStart: true },
        })
      ).map((s) => `${s.connectionId}:${s.kpiDefinitionId}:${s.periodStart.toISOString()}`),
    );

    // Which (connection, periodStart) pairs already have a real Submission —
    // either a genuine in-app submission, or one this backfill already
    // created on a prior run. Skipped so a re-run never double-creates, and
    // so a period a VA has actually submitted through the new app keeps its
    // real Submission as the only one (this legacy import wouldn't add
    // anything ConnectionTrend doesn't already have from it).
    const existingSubmissionKeys = new Set(
      (
        await prisma.submission.findMany({
          where: { period },
          select: { connectionId: true, periodStart: true },
        })
      ).map((s) => `${s.connectionId}:${s.periodStart.toISOString()}`),
    );

    type Job = {
      summaryId: string;
      kpiId: string;
      connectionId: string;
      kpiDefinitionId: string;
      periodStart: Date;
      actualValue: number | null;
      targetValue: number;
      pct: number | null;
      status: PerformanceStatus;
      willUpdate: boolean;
    };
    // Keyed by (connectionId, kpiDefinitionId, periodStart) — the bulk
    // upsert's ON CONFLICT target — so a duplicate summary row for the same
    // KPI/period collapses to one job instead of erroring the whole batch
    // with "ON CONFLICT DO UPDATE command cannot affect row a second time".
    const jobsByKey = new Map<string, Job>();

    type SubmissionJob = {
      summaryId: string;
      connectionId: string;
      periodStart: Date;
      submittedAt: Date;
      records: { kpiDefinitionId: string; value: number | null; noData: boolean }[];
      rawPayload: Record<string, number | string>;
    };
    const submissionJobs: SubmissionJob[] = [];

    for (const row of rows) {
      const connectionId = connMap.get(row.ConnectionID ?? "");
      const periodStart = parsePeriodStart(row[dateKey] ?? "", period);
      if (!connectionId || !periodStart || !row.KPIs) {
        result.skipped++;
        continue;
      }

      let entries: LegacyKpiEntry[];
      try {
        entries = JSON.parse(row.KPIs);
      } catch {
        result.errors.push(`${row.SummaryID}: unparseable KPIs JSON`);
        continue;
      }

      // One Submission per legacy summary row (mirrors one real submit
      // call), built alongside the per-KPI PerformanceSummary jobs below —
      // skipped entirely once a real (or previously-backfilled) Submission
      // already covers this connection/period.
      const submissionKey = `${connectionId}:${periodStart.toISOString()}`;
      const buildSubmission = !existingSubmissionKeys.has(submissionKey);
      const submissionRecords: SubmissionJob["records"] = [];
      const rawPayload: Record<string, number | string> = {};

      for (const entry of entries) {
        const kpiDefinitionId = kpiDefMap.get(`${entry.kpiId}:${period}`);
        if (!kpiDefinitionId) {
          result.skipped++;
          continue;
        }
        const status = LEGACY_STATUS_MAP[entry.status] ?? PerformanceStatus.NO_DATA;
        // Legacy's KPIs JSON blob sometimes has target/actual as "" rather
        // than a number or null — `?? 0` doesn't catch empty strings, which
        // broke every row where this happened (Prisma rejects "" for a
        // Float column outright).
        const rawActual = entry.noData ? null : entry.actual;
        const parsedActual = rawActual === null ? null : Number(rawActual);
        const actualValue =
          parsedActual === null || !Number.isFinite(parsedActual) ? null : parsedActual;
        // entry.target === "" means the legacy summary blob just never
        // carried a target for this entry (seen on real rows) — fall back
        // to this connection's configured target, then the KPI's default,
        // rather than treating it as a real 0.
        const rawTarget = (entry.target as unknown) === "" ? null : Number(entry.target);
        const safeTargetValue =
          rawTarget !== null && Number.isFinite(rawTarget)
            ? rawTarget
            : configTargetByKey.get(`${connectionId}:${kpiDefinitionId}`) ??
              defaultTargetByKpiId.get(kpiDefinitionId) ??
              0;
        const pct =
          actualValue !== null && safeTargetValue !== 0
            ? (actualValue / safeTargetValue) * 100
            : null;
        const key = `${connectionId}:${kpiDefinitionId}:${periodStart.toISOString()}`;

        jobsByKey.set(key, {
          summaryId: row.SummaryID ?? "",
          kpiId: entry.kpiId,
          connectionId,
          kpiDefinitionId,
          periodStart,
          actualValue,
          targetValue: safeTargetValue,
          pct,
          status,
          willUpdate: existingKeys.has(key),
        });

        if (buildSubmission) {
          submissionRecords.push({ kpiDefinitionId, value: actualValue, noData: entry.noData });
          const kpiName = kpiNameById.get(kpiDefinitionId) ?? entry.kpiId;
          rawPayload[kpiName] = entry.noData ? "No data available" : (actualValue ?? "No data available");
        }
      }

      if (buildSubmission && submissionRecords.length > 0) {
        // Marked as seen immediately (not just after the batch create below)
        // so two legacy rows that somehow share a connection/periodStart
        // within this same run don't both queue a Submission.
        existingSubmissionKeys.add(submissionKey);
        submissionJobs.push({
          summaryId: row.SummaryID ?? "",
          connectionId,
          periodStart,
          submittedAt: parseSubmittedAt(row.SubmittedAt, periodStart),
          records: submissionRecords,
          rawPayload,
        });
      }
    }

    // Bulk multi-row upsert instead of one upsert() per row — with ~10.7k
    // summary rows across both sheets, one round trip per row was this
    // app's single largest source of Supabase query volume (280k+ calls to
    // this exact upsert, per Query Performance — the sheets get re-synced
    // occasionally, so that's several runs' worth). Chunked to stay well
    // under Postgres's per-statement bind-parameter limit; each chunk falls
    // back to the original one-row-at-a-time upsert on failure, so one bad
    // row doesn't lose the rest of that chunk's writes or its error detail.
    const jobList = Array.from(jobsByKey.values());
    const PERF_CHUNK_SIZE = 500;
    for (let i = 0; i < jobList.length; i += PERF_CHUNK_SIZE) {
      const chunk = jobList.slice(i, i + PERF_CHUNK_SIZE);
      try {
        if (!dryRun) {
          const values = chunk.map(
            (job) => Prisma.sql`(${randomUUID()}, ${job.connectionId}, ${job.kpiDefinitionId}, ${period}::"KpiPeriod", ${job.periodStart}, ${job.actualValue}, ${job.targetValue}, ${job.pct}, ${job.status}::"PerformanceStatus", now())`,
          );
          await prisma.$executeRaw`
            INSERT INTO "PerformanceSummary"
              (id, "connectionId", "kpiDefinitionId", period, "periodStart", "actualValue", "targetValue", pct, status, "updatedAt")
            VALUES ${Prisma.join(values)}
            ON CONFLICT ("connectionId", "kpiDefinitionId", "periodStart") DO UPDATE SET
              "actualValue" = EXCLUDED."actualValue",
              "targetValue" = EXCLUDED."targetValue",
              pct = EXCLUDED.pct,
              status = EXCLUDED.status,
              "updatedAt" = EXCLUDED."updatedAt"
          `;
        }
        for (const job of chunk) {
          if (job.willUpdate) result.updated++;
          else result.created++;
        }
      } catch {
        for (const job of chunk) {
          try {
            if (!dryRun) {
              await prisma.performanceSummary.upsert({
                where: {
                  connectionId_kpiDefinitionId_periodStart: {
                    connectionId: job.connectionId,
                    kpiDefinitionId: job.kpiDefinitionId,
                    periodStart: job.periodStart,
                  },
                },
                create: {
                  connectionId: job.connectionId,
                  kpiDefinitionId: job.kpiDefinitionId,
                  period,
                  periodStart: job.periodStart,
                  actualValue: job.actualValue,
                  targetValue: job.targetValue,
                  pct: job.pct,
                  status: job.status,
                },
                update: {
                  actualValue: job.actualValue,
                  targetValue: job.targetValue,
                  pct: job.pct,
                  status: job.status,
                },
              });
            }
            if (job.willUpdate) result.updated++;
            else result.created++;
          } catch (e) {
            result.errors.push(`${job.summaryId}/${job.kpiId}: ${(e as Error).message}`);
          }
        }
      }
      onProgress?.(sheetName, Math.min(i + PERF_CHUNK_SIZE, jobList.length), jobList.length);
    }

    report[sheetName] = result;

    // Backfills the Submission (+ SubmissionRecord) rows this import never
    // used to create — without them, getConnectionTrend/getConnectionWeekDetail
    // (which check Submission existence, not PerformanceSummary, since
    // PerformanceSummary rows are never deleted) treat every legacy-only
    // period as "not submitted" even though it has real historical KPI data.
    const submissionResult = emptyResult();
    await mapWithConcurrency(submissionJobs, 10, async (job) => {
      try {
        if (!dryRun) {
          await prisma.submission.create({
            data: {
              connectionId: job.connectionId,
              period,
              periodStart: job.periodStart,
              submittedAt: job.submittedAt,
              rawPayload: job.rawPayload,
              records: { create: job.records },
            },
          });
        }
        submissionResult.created++;
      } catch (e) {
        submissionResult.errors.push(`${job.summaryId}: ${(e as Error).message}`);
      }
    }, (done, total) => onProgress?.(`${sheetName} (backfilling submissions)`, done, total));

    report[`${sheetName}_submissions`] = submissionResult;
  }

  return report;
}
