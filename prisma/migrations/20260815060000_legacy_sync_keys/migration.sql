-- AlterTable
ALTER TABLE "Service" ADD COLUMN "legacyId" TEXT;
ALTER TABLE "Team" ADD COLUMN "legacyId" TEXT;
ALTER TABLE "KpiDefinition" ADD COLUMN "legacyId" TEXT;
ALTER TABLE "Intervention" ADD COLUMN "legacyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Service_legacyId_key" ON "Service"("legacyId");
CREATE UNIQUE INDEX "Team_legacyId_key" ON "Team"("legacyId");
CREATE UNIQUE INDEX "Intervention_legacyId_key" ON "Intervention"("legacyId");
CREATE UNIQUE INDEX "KpiDefinition_legacyId_period_key" ON "KpiDefinition"("legacyId", "period");
