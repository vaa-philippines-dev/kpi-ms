import { prisma } from "@/lib/prisma";

// One-off backfill for the CMS sync bug fixed in
// src/lib/cms-sync/connection-sync.ts: every Connection it created left
// serviceId null, so KPI-Configuration's per-service filter
// (serviceId === null || serviceId === connection.serviceId) collapsed to
// "show every dept-wide KPI, regardless of the VA's actual service" for all
// of them. This sets each null-serviceId Connection's serviceId from its
// VA's own User.serviceId.
//
// Connections whose VA also has no serviceId set are left null (there's
// nothing to backfill from) and are reported separately, not silently
// skipped.
//
// Defaults to a dry run: prints what would change without touching the
// database. Pass --confirm to actually update.

async function main() {
  const confirm = process.argv.includes("--confirm");

  const candidates = await prisma.connection.findMany({
    where: { serviceId: null },
    select: {
      id: true,
      shortCode: true,
      clientName: true,
      departmentId: true,
      vaUser: { select: { id: true, name: true, email: true, serviceId: true } },
    },
    orderBy: { shortCode: "asc" },
  });

  const toUpdate = candidates.filter((c) => c.vaUser.serviceId !== null);
  const noVaService = candidates.filter((c) => c.vaUser.serviceId === null);

  console.log(`Connections with serviceId null: ${candidates.length}`);

  console.log(`\n=== Will backfill from VA's serviceId: ${toUpdate.length} ===`);
  toUpdate.forEach((c) =>
    console.log(`  ${c.shortCode}  ${c.clientName}  va=${c.vaUser.name ?? c.vaUser.email}  serviceId=${c.vaUser.serviceId}`),
  );

  console.log(`\n=== Left null (VA has no serviceId either): ${noVaService.length} ===`);
  noVaService.forEach((c) => console.log(`  ${c.shortCode}  ${c.clientName}  va=${c.vaUser.name ?? c.vaUser.email}`));

  if (!confirm) {
    console.log(`\nDry run only — no changes made. Re-run with --confirm to update the ${toUpdate.length} row(s) above.`);
    return;
  }

  if (toUpdate.length === 0) {
    console.log("\nNothing to update.");
    return;
  }

  let updated = 0;
  for (const c of toUpdate) {
    await prisma.connection.update({
      where: { id: c.id },
      data: { serviceId: c.vaUser.serviceId },
    });
    updated++;
  }
  console.log(`\nUpdated ${updated} connection(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
