-- CreateEnum
CREATE TYPE "ThresholdUnit" AS ENUM ('PERCENT', 'VALUE');

-- AlterTable
ALTER TABLE "KpiDefinition" ADD COLUMN     "thresholdUnit" "ThresholdUnit" NOT NULL DEFAULT 'PERCENT';
