-- CreateTable
CREATE TABLE "ConnectionService" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectionService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectionService_serviceId_idx" ON "ConnectionService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionService_connectionId_serviceId_key" ON "ConnectionService"("connectionId", "serviceId");

-- AddForeignKey
ALTER TABLE "ConnectionService" ADD CONSTRAINT "ConnectionService_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionService" ADD CONSTRAINT "ConnectionService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

