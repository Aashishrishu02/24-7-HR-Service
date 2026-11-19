-- AlterTable
ALTER TABLE "HostHeavenPlanMapping" ADD COLUMN IF NOT EXISTS "externalConfigId" TEXT;
ALTER TABLE "HostHeavenPlanMapping" ADD COLUMN IF NOT EXISTS "isCostVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HostHeavenPlanMapping" ADD COLUMN IF NOT EXISTS "costStatus" TEXT NOT NULL DEFAULT 'ESTIMATED';
ALTER TABLE "HostHeavenPlanMapping" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "HostHeavenPlanMapping_externalConfigId_key" ON "HostHeavenPlanMapping"("externalConfigId");
CREATE INDEX IF NOT EXISTS "HostHeavenPlanMapping_externalConfigId_idx" ON "HostHeavenPlanMapping"("externalConfigId");
CREATE INDEX IF NOT EXISTS "HostHeavenPlanMapping_isCostVerified_idx" ON "HostHeavenPlanMapping"("isCostVerified");
