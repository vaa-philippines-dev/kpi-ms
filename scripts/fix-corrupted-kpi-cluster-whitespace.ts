import { prisma } from "@/lib/prisma";

// One-off data fix: two Amazon KpiDefinition rows ("Catalog Speed-to-Market"
// and "Listing Accuracy (Zero-Error Standard)", both MONTHLY period) had
// `cluster` stored as "Listing Optimization\t\t\t" — trailing tab
// characters, presumably surviving from the original spreadsheet import,
// predating the `.trim()` guard both createKpiDefinition and
// updateKpiDefinition (and moveKpiCluster) apply today (see
// src/app/dashboard/kpi-library/actions.ts).
//
// getKpiConfigDetail groups a KPI's Weekly and Monthly KpiDefinition rows
// into one editable row by an exact `${name}::${cluster}` key (see
// src/app/dashboard/connections/kpi-config/actions.ts). Because these two
// MONTHLY rows' cluster didn't byte-for-byte match their WEEKLY siblings'
// clean "Listing Optimization", they never merged: each KPI split into two
// incomplete rows, one Weekly-only and one Monthly-only, and on any given
// row whichever period didn't merge in rendered as "—" and a disabled,
// uneditable input.
//
// This trims those two rows back in line with their Weekly counterparts.
// Confirmed via a full-table scan that these are the ONLY two
// `cluster !== cluster.trim()` rows in the KpiDefinition table (401 total).
async function main() {
  const corrupted = await prisma.kpiDefinition.findMany({
    where: { cluster: { contains: "Listing Optimization\t" } },
  });
  if (corrupted.length === 0) {
    console.log("No corrupted rows found — already fixed, or the fingerprint changed.");
    return;
  }
  for (const def of corrupted) {
    const trimmed = def.cluster.trim();
    if (trimmed === def.cluster) continue;
    await prisma.kpiDefinition.update({
      where: { id: def.id },
      data: { cluster: trimmed },
    });
    console.log(`Fixed ${def.id} (${def.name}, ${def.period}): ${JSON.stringify(def.cluster)} -> ${JSON.stringify(trimmed)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
