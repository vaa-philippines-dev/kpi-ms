import { prisma } from "@/lib/prisma";
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
 */
export async function runPerformanceSync(): Promise<SyncReport> {
  const report: SyncReport = {};

  const [connections, kpiDefs] = await Promise.all([
    prisma.connection.findMany({
      where: { externalWfmId: { not: null } },
      select: { id: true, externalWfmId: true },
    }),
    prisma.kpiDefinition.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true, period: true },
    }),
  ]);
  const connMap = new Map(connections.map((c) => [c.externalWfmId!, c.id]));
  const kpiDefMap = new Map(kpiDefs.map((k) => [`${k.legacyId}:${k.period}`, k.id]));

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
    const jobs: Job[] = [];

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
        const targetValue = Number(entry.target);
        const safeTargetValue = Number.isFinite(targetValue) ? targetValue : 0;
        const pct =
          actualValue !== null && safeTargetValue !== 0
            ? (actualValue / safeTargetValue) * 100
            : null;
        const key = `${connectionId}:${kpiDefinitionId}:${periodStart.toISOString()}`;

        jobs.push({
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
      }
    }

    await mapWithConcurrency(jobs, 10, async (job) => {
      try {
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
        if (job.willUpdate) result.updated++;
        else result.created++;
      } catch (e) {
        result.errors.push(`${job.summaryId}/${job.kpiId}: ${(e as Error).message}`);
      }
    });

    report[sheetName] = result;
  }

  return report;
}
