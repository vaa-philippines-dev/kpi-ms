import { prisma } from "@/lib/prisma";
import { generateConnectionShortCode } from "@/lib/connection-short-code";

async function main() {
  const connections = await prisma.connection.findMany({
    select: { id: true, externalWfmId: true },
  });

  let reused = 0;
  let generated = 0;
  for (const { id, externalWfmId } of connections) {
    // Legacy-synced connections already carry their real CON_XXXXXX code in
    // externalWfmId (see reference-sync.ts) — reuse it as shortCode rather
    // than minting a new one, so a code a VA may already know keeps
    // working. Only connections created directly in this app (no legacy
    // origin) get a freshly generated code.
    const shortCode =
      externalWfmId && externalWfmId.startsWith("CON_")
        ? externalWfmId
        : await generateConnectionShortCode();
    await prisma.connection.update({ where: { id }, data: { shortCode } });
    if (externalWfmId && externalWfmId.startsWith("CON_")) reused++;
    else generated++;
  }

  console.log(`Reused ${reused} legacy code(s); generated ${generated} new code(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
