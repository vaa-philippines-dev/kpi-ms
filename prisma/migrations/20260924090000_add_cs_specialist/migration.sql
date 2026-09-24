-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StatusChangeRequestState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CS_SPECIALIST';

-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "externalCmsId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cmsStatus" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'INACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsClientAssignment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "csUserId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CsClientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusChangeRequest" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "fromStatus" "ConnectionStatus" NOT NULL,
    "requestedStatus" "ConnectionStatus" NOT NULL,
    "effectiveDate" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "state" "StatusChangeRequestState" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StatusChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_externalCmsId_key" ON "Customer"("externalCmsId");

-- CreateIndex
CREATE UNIQUE INDEX "CsClientAssignment_code_key" ON "CsClientAssignment"("code");

-- CreateIndex
CREATE INDEX "CsClientAssignment_customerId_idx" ON "CsClientAssignment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CsClientAssignment_csUserId_customerId_key" ON "CsClientAssignment"("csUserId", "customerId");

-- CreateIndex
CREATE INDEX "StatusChangeRequest_connectionId_idx" ON "StatusChangeRequest"("connectionId");

-- CreateIndex
CREATE INDEX "StatusChangeRequest_state_createdAt_idx" ON "StatusChangeRequest"("state", "createdAt");

-- CreateIndex
CREATE INDEX "Connection_customerId_idx" ON "Connection"("customerId");

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsClientAssignment" ADD CONSTRAINT "CsClientAssignment_csUserId_fkey" FOREIGN KEY ("csUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsClientAssignment" ADD CONSTRAINT "CsClientAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusChangeRequest" ADD CONSTRAINT "StatusChangeRequest_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusChangeRequest" ADD CONSTRAINT "StatusChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusChangeRequest" ADD CONSTRAINT "StatusChangeRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

