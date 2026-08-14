/*
  Warnings:

  - You are about to drop the column `atRiskThresholdPct` on the `KpiDefinition` table. All the data in the column will be lost.
  - You are about to drop the column `criticalThresholdPct` on the `KpiDefinition` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "KpiDefinition" DROP COLUMN "atRiskThresholdPct",
DROP COLUMN "criticalThresholdPct",
ADD COLUMN     "deviationThresholdPct" DOUBLE PRECISION NOT NULL DEFAULT 99;
