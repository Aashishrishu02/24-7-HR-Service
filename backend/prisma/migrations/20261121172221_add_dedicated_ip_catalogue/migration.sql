-- Dedicated IP catalogue tables.
-- This migration does not modify existing VPS tables.

CREATE TABLE IF NOT EXISTS "DedicatedIpPlan" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalPlanId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "tier" TEXT,
    "tierLabel" TEXT,
    "controlMode" TEXT,
    "protocol" TEXT,
    "supportedProtocols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "countryCode" TEXT,
    "countryName" TEXT,
    "location" TEXT,
    "duration" TEXT,
    "speed" TEXT,
    "minQuantity" INTEGER,
    "regularPrice" DECIMAL(10,2),
    "apiPrice" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER,
    "defaultSubnet" TEXT,
    "poolsCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DedicatedIpPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DedicatedIpPlan_providerId_fkey"
        FOREIGN KEY ("providerId") REFERENCES "Provider"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DedicatedIpPool" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "externalPoolId" TEXT NOT NULL,
    "poolName" TEXT,
    "subnet" TEXT,
    "location" TEXT,
    "regularPrice" DECIMAL(10,2),
    "apiPrice" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DedicatedIpPool_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DedicatedIpPool_planId_fkey"
        FOREIGN KEY ("planId") REFERENCES "DedicatedIpPlan"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DedicatedIpSyncState" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEVER_SYNCED',
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "syncedPlanCount" INTEGER NOT NULL DEFAULT 0,
    "syncedPoolCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DedicatedIpSyncState_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DedicatedIpSyncState_providerId_fkey"
        FOREIGN KEY ("providerId") REFERENCES "Provider"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DedicatedIpPlan_providerId_externalPlanId_key"
    ON "DedicatedIpPlan"("providerId", "externalPlanId");

CREATE INDEX IF NOT EXISTS "DedicatedIpPlan_providerId_isActive_inStock_idx"
    ON "DedicatedIpPlan"("providerId", "isActive", "inStock");

CREATE UNIQUE INDEX IF NOT EXISTS "DedicatedIpPool_planId_externalPoolId_key"
    ON "DedicatedIpPool"("planId", "externalPoolId");

CREATE INDEX IF NOT EXISTS "DedicatedIpPool_planId_inStock_idx"
    ON "DedicatedIpPool"("planId", "inStock");

CREATE UNIQUE INDEX IF NOT EXISTS "DedicatedIpSyncState_providerId_key"
    ON "DedicatedIpSyncState"("providerId");
