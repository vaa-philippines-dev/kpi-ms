-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "submissionWindowEnd" TEXT,
ADD COLUMN     "submissionWindowStart" TEXT;
