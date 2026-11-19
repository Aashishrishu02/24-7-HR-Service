-- ====================================================================
-- FORWARD-ONLY MIGRATION: 20261119180000_add_hostheaven_plan_mapping
-- TARGET: 24/7 HR Service VPS Hosting Platform
-- ====================================================================

-- CreateTable: HostHeavenPlanMapping
CREATE TABLE IF NOT EXISTS "HostHeavenPlanMapping" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "zoneName" TEXT,
    "zoneIsoId" TEXT NOT NULL,
    "isoName" TEXT,
    "planType" TEXT NOT NULL,
    "cpuPricingId" TEXT NOT NULL,
    "cpuName" TEXT,
    "ramPricingId" TEXT NOT NULL,
    "ramName" TEXT,
    "diskPricingId" TEXT NOT NULL,
    "diskName" TEXT,
    "bandwidthPricingId" TEXT NOT NULL,
    "bandwidthName" TEXT,
    "providerCost" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostHeavenPlanMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: HostHeavenPlanMapping unique planId
CREATE UNIQUE INDEX IF NOT EXISTS "HostHeavenPlanMapping_planId_key" ON "HostHeavenPlanMapping"("planId");

-- CreateIndex: HostHeavenPlanMapping lookup indexes
CREATE INDEX IF NOT EXISTS "HostHeavenPlanMapping_planId_isActive_idx" ON "HostHeavenPlanMapping"("planId", "isActive");
CREATE INDEX IF NOT EXISTS "HostHeavenPlanMapping_zoneId_idx" ON "HostHeavenPlanMapping"("zoneId");

-- AddForeignKey: HostHeavenPlanMapping -> VPSPlan
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'HostHeavenPlanMapping_planId_fkey'
    ) THEN
        ALTER TABLE "HostHeavenPlanMapping" ADD CONSTRAINT "HostHeavenPlanMapping_planId_fkey" FOREIGN KEY ("planId") REFERENCES "VPSPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
