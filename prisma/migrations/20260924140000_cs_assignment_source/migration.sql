-- CreateEnum
CREATE TYPE "CsAssignmentSource" AS ENUM ('CMS', 'MANUAL');

-- AlterTable
ALTER TABLE "CsClientAssignment" ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "source" "CsAssignmentSource" NOT NULL DEFAULT 'CMS';

-- AddForeignKey
ALTER TABLE "CsClientAssignment" ADD CONSTRAINT "CsClientAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

