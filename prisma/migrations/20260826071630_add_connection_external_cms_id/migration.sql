-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "externalCmsId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Connection_externalCmsId_key" ON "Connection"("externalCmsId");
