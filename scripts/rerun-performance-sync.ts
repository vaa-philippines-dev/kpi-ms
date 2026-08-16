import { prisma } from "@/lib/prisma";
import { runPerformanceSync } from "@/lib/legacy-sync/performance-sync";

async function main() {
  const report = await runPerformanceSync();
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
