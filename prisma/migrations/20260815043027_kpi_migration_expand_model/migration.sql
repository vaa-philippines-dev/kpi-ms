/*
  Warnings:

  - You are about to drop the column `vaEmail` on the `Connection` table. All the data in the column will be lost.
  - You are about to drop the column `vaName` on the `Connection` table. All the data in the column will be lost.
  - Added the required column `vaUserId` to the `Connection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cluster` to the `KpiDefinition` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'END_OF_CONTRACT', 'END_OF_PROJECT', 'PENDING');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('REGULAR', 'PROJECT_BASED');

-- AlterEnum
ALTER TYPE "PerformanceStatus" ADD VALUE 'NO_DATA';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'VA';

-- AlterTable
ALTER TABLE "Connection" DROP COLUMN "vaEmail",
DROP COLUMN "vaName",
ADD COLUMN     "connectionType" "ConnectionType" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "vaUserId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "KpiDefinition" ADD COLUMN     "cluster" TEXT NOT NULL,
ADD COLUMN     "criticalThresholdPct" DOUBLE PRECISION NOT NULL DEFAULT 25,
ADD COLUMN     "serviceId" TEXT,
ALTER COLUMN "deviationThresholdPct" SET DEFAULT 10;

-- AlterTable
ALTER TABLE "PerformanceSummary" ALTER COLUMN "actualValue" DROP NOT NULL,
ALTER COLUMN "pct" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SubmissionRecord" ADD COLUMN     "noData" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "value" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "teamLeaderId" TEXT,
    "tempLeader1Id" TEXT,
    "tempLeader2Id" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionStatusEvent" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectionStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiConfig" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kpiDefinitionId" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION,
    "deviationThresholdPct" DOUBLE PRECISION,
    "criticalThresholdPct" DOUBLE PRECISION,
    "isApplicable" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiConfigHistory" (
    "id" TEXT NOT NULL,
    "kpiConfigId" TEXT NOT NULL,
    "fieldChanged" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiConfigHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT,
    "outcome" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_departmentId_idx" ON "Service"("departmentId");

-- CreateIndex
CREATE INDEX "Team_departmentId_idx" ON "Team"("departmentId");

-- CreateIndex
CREATE INDEX "ConnectionStatusEvent_connectionId_idx" ON "ConnectionStatusEvent"("connectionId");

-- CreateIndex
CREATE INDEX "KpiConfig_kpiDefinitionId_idx" ON "KpiConfig"("kpiDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiConfig_connectionId_kpiDefinitionId_key" ON "KpiConfig"("connectionId", "kpiDefinitionId");

-- CreateIndex
CREATE INDEX "KpiConfigHistory_kpiConfigId_idx" ON "KpiConfigHistory"("kpiConfigId");

-- CreateIndex
CREATE INDEX "Intervention_connectionId_idx" ON "Intervention"("connectionId");

-- CreateIndex
CREATE INDEX "Connection_vaUserId_idx" ON "Connection"("vaUserId");

-- CreateIndex
CREATE INDEX "Connection_teamId_idx" ON "Connection"("teamId");

-- CreateIndex
CREATE INDEX "KpiDefinition_serviceId_idx" ON "KpiDefinition"("serviceId");

-- CreateIndex
CREATE INDEX "User_serviceId_idx" ON "User"("serviceId");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_teamLeaderId_fkey" FOREIGN KEY ("teamLeaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tempLeader1Id_fkey" FOREIGN KEY ("tempLeader1Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tempLeader2Id_fkey" FOREIGN KEY ("tempLeader2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDefinition" ADD CONSTRAINT "KpiDefinition_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_vaUserId_fkey" FOREIGN KEY ("vaUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionStatusEvent" ADD CONSTRAINT "ConnectionStatusEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionStatusEvent" ADD CONSTRAINT "ConnectionStatusEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiConfig" ADD CONSTRAINT "KpiConfig_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiConfig" ADD CONSTRAINT "KpiConfig_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "KpiDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiConfig" ADD CONSTRAINT "KpiConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiConfigHistory" ADD CONSTRAINT "KpiConfigHistory_kpiConfigId_fkey" FOREIGN KEY ("kpiConfigId") REFERENCES "KpiConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiConfigHistory" ADD CONSTRAINT "KpiConfigHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
