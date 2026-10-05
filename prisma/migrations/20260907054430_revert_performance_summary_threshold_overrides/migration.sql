/*
  Warnings:

  - You are about to drop the column `criticalThresholdPct` on the `PerformanceSummary` table. All the data in the column will be lost.
  - You are about to drop the column `deviationThresholdPct` on the `PerformanceSummary` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PerformanceSummary" DROP COLUMN "criticalThresholdPct",
DROP COLUMN "deviationThresholdPct";
