import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Undo for the 2026-09-28 one-off cleanup of 1,103 orphan PerformanceSummary
// rows: every one was status NO_DATA with a null actualValue and no Submission
// at all for its connection+periodStart — leftovers from deleted or
// period-moved submissions (each matched a logged "Deleted a ... submission" /
// "moved from" ActivityLog entry for that exact period) that made vacated
// weeks list those connections as "No Data" on the Performance page.
// recomputePerformanceSummary now deletes such rows itself, so this should
// only be needed if one of those rows turns out to matter after all.
//
// Run from the repo root. Re-inserts the rows from the backup with their original ids. skipDuplicates
// leaves alone any connection/KPI/period that has since been resubmitted and
// already has a live row again.
type BackupRow = {
  id: string;
  connectionId: string;
  kpiDefinitionId: string;
  period: KpiPeriod;
  periodStart: string;
  actualValue: number | null;
  targetValue: number;
  pct: number | null;
  status: PerformanceStatus;
  updatedAt: string;
};

async function main() {
  const rows: BackupRow[] = JSON.parse(
    readFileSync(join(process.cwd(), "scripts", "data-backups", "2026-09-28-orphan-performance-summaries.json"), "utf8"),
  );
  const { count } = await prisma.performanceSummary.createMany({
    data: rows.map((r) => ({
      ...r,
      periodStart: new Date(r.periodStart),
      updatedAt: new Date(r.updatedAt),
    })),
    skipDuplicates: true,
  });
  console.log(`Restored ${count} of ${rows.length} rows (the rest already exist again).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
