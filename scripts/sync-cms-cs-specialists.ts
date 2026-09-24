// One-off / re-runnable CLI entry for runCmsCsSync (lib/cms-sync/cs-sync.ts):
// imports CS Specialists from the CMS, links KPI connections to their CMS
// client, and generates the CS <-> client assignments. Idempotent.
//   npx tsx scripts/sync-cms-cs-specialists.ts
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runCmsCsSync } from "../src/lib/cms-sync/cs-sync";

async function main() {
  const { report, notes } = await runCmsCsSync();
  for (const [phase, r] of Object.entries(report)) {
    console.log(`${phase}: created ${r.created}, updated ${r.updated}, skipped ${r.skipped}, errors ${r.errors.length}`);
    r.errors.slice(0, 10).forEach((e) => console.log(`  ! ${e}`));
  }
  notes.forEach((n) => console.log(`- ${n}`));
}

main().finally(() => prisma.$disconnect());
