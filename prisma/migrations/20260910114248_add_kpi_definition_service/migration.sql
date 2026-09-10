-- CreateTable
CREATE TABLE "KpiDefinitionService" (
    "id" TEXT NOT NULL,
    "kpiDefinitionId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiDefinitionService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KpiDefinitionService_serviceId_idx" ON "KpiDefinitionService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiDefinitionService_kpiDefinitionId_serviceId_key" ON "KpiDefinitionService"("kpiDefinitionId", "serviceId");

-- AddForeignKey
ALTER TABLE "KpiDefinitionService" ADD CONSTRAINT "KpiDefinitionService_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "KpiDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDefinitionService" ADD CONSTRAINT "KpiDefinitionService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

