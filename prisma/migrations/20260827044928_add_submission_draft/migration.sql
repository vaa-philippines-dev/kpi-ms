-- CreateTable
CREATE TABLE "SubmissionDraft" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kpiDefinitionId" TEXT NOT NULL,
    "period" "KpiPeriod" NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "value" DOUBLE PRECISION,
    "noData" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SubmissionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionDraft_connectionId_period_periodStart_idx" ON "SubmissionDraft"("connectionId", "period", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionDraft_connectionId_kpiDefinitionId_period_periodS_key" ON "SubmissionDraft"("connectionId", "kpiDefinitionId", "period", "periodStart");

-- AddForeignKey
ALTER TABLE "SubmissionDraft" ADD CONSTRAINT "SubmissionDraft_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionDraft" ADD CONSTRAINT "SubmissionDraft_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "KpiDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionDraft" ADD CONSTRAINT "SubmissionDraft_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
