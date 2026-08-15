import { prisma } from "@/lib/prisma";
import { runReferenceSync } from "@/lib/legacy-sync/reference-sync";
import { runPerformanceSync } from "@/lib/legacy-sync/performance-sync";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No admin user found to attribute the sync to.");

  console.log("=== Reference sync ===");
  const refReport = await runReferenceSync(admin.id);
  console.log(JSON.stringify(refReport, null, 2));

  console.log("\n=== Performance sync ===");
  const perfReport = await runPerformanceSync();
  console.log(JSON.stringify(perfReport, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
