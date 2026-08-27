import { prisma } from "@/lib/prisma";

// One-off cleanup for the CMS sync's first, unfiltered run (see
// src/lib/cms-sync/connection-sync.ts, which now filters new imports to
// Aug 2026+ going forward). That run pulled in a bunch of CMS rows the CMS
// never marked Terminated even though the legacy KPI Portal — the source
// of truth — already shows them ended (EOC), plus a batch of no-date
// Pending rows that are effectively the same kind of stale, un-updated CMS
// backlog. Per the user (2026-08-27): delete every CMS-origin Connection
// (externalCmsId set, long CONN_xxxxxxxxxxxx shortCode) EXCEPT the ones
// that actually started in Aug 2026 or later — those are the genuine new
// connections. Includes rows with no startDate at all and rows that
// already carry dependent data (a handful of ConnectionStatusEvent rows
// from their own creation, not real submitted work) — both explicitly
// confirmed by the user as fine to delete along with the rest.
// Legacy-origin connections (externalWfmId set, short CON_xxxxxx
// shortCode) are never touched, regardless of date — that data is already
// correct.
//
// Defaults to a dry run: prints what would be deleted without touching the
// database. Pass --confirm to actually delete.
const CUTOFF = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01

async function main() {
  const confirm = process.argv.includes("--confirm");

  const candidates = await prisma.connection.findMany({
    where: { externalCmsId: { not: null } },
    select: {
      id: true,
      externalCmsId: true,
      shortCode: true,
      clientName: true,
      startDate: true,
      status: true,
      _count: {
        select: {
          submissions: true,
          submissionDrafts: true,
          interventions: true,
          kpiConfigs: true,
          performanceSummaries: true,
          statusEvents: true,
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  const kept: typeof candidates = [];
  const toDelete: typeof candidates = [];

  for (const c of candidates) {
    if (c.startDate && c.startDate >= CUTOFF) kept.push(c);
    else toDelete.push(c);
  }

  const describe = (c: (typeof candidates)[number]) => {
    const deps =
      c._count.submissions +
      c._count.submissionDrafts +
      c._count.interventions +
      c._count.kpiConfigs +
      c._count.performanceSummaries +
      c._count.statusEvents;
    return `  ${c.shortCode}  ${c.clientName}  status=${c.status}  startDate=${
      c.startDate ? c.startDate.toISOString().slice(0, 10) : "null"
    }${deps > 0 ? `  (has ${deps} dependent row(s))` : ""}`;
  };

  console.log(`CMS-origin connections found: ${candidates.length}`);
  console.log(`\n=== Kept (startDate >= 2026-08-01): ${kept.length} ===`);
  kept.forEach((c) => console.log(describe(c)));

  console.log(`\n=== To delete (everything else): ${toDelete.length} ===`);
  toDelete.forEach((c) => console.log(describe(c)));

  if (!confirm) {
    console.log(`\nDry run only — no changes made. Re-run with --confirm to delete the ${toDelete.length} row(s) above.`);
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  const ids = toDelete.map((c) => c.id);
  await prisma.$transaction([
    prisma.connectionStatusEvent.deleteMany({ where: { connectionId: { in: ids } } }),
    prisma.kpiConfig.deleteMany({ where: { connectionId: { in: ids } } }),
    prisma.submissionDraft.deleteMany({ where: { connectionId: { in: ids } } }),
    prisma.intervention.deleteMany({ where: { connectionId: { in: ids } } }),
    prisma.performanceSummary.deleteMany({ where: { connectionId: { in: ids } } }),
    prisma.submission.deleteMany({ where: { connectionId: { in: ids } } }),
    prisma.connection.deleteMany({ where: { id: { in: ids } } }),
  ]);
  console.log(`\nDeleted ${toDelete.length} connection(s) and their dependent rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
