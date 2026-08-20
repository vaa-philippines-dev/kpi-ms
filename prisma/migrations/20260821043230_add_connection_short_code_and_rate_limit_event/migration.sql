-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "shortCode" TEXT;

-- CreateTable
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitEvent_key_createdAt_idx" ON "RateLimitEvent"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_shortCode_key" ON "Connection"("shortCode");

