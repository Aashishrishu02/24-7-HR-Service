/*
  Warnings:

  - A unique constraint covering the columns `[inventoryId]` on the table `VPSInstance` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ASSIGNED', 'MAINTENANCE', 'EXPIRED', 'SUSPENDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProvisioningStatus" AS ENUM ('PENDING', 'CHECKING_INVENTORY', 'RESERVED', 'PURCHASING', 'PROVISIONING', 'COMPLETED', 'RETRYING', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProvisioningSource" AS ENUM ('INVENTORY', 'PROVIDER_API');

-- AlterTable
ALTER TABLE "VPSInstance" ADD COLUMN     "inventoryId" TEXT;

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "baseUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "apiPurchaseEnabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "maxPurchaseAmount" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "usernameEncrypted" TEXT,
    "passwordEncrypted" TEXT,
    "apiKeyEncrypted" TEXT,
    "apiSecretEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProduct" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "cpuCores" INTEGER NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "bandwidthGb" INTEGER,
    "region" TEXT,
    "supportedOS" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderInventory" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerVpsId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "hostname" TEXT,
    "cpuCores" INTEGER NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "bandwidthGb" INTEGER,
    "region" TEXT,
    "operatingSystem" TEXT,
    "providerCost" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3),
    "encryptedAccessDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VPSPlanProviderMapping" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerProductId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoPurchaseEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxAllowedCost" DECIMAL(10,2),
    "regionMapping" JSONB,
    "osMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VPSPlanProviderMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisioningJob" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerId" TEXT,
    "inventoryId" TEXT,
    "source" "ProvisioningSource" NOT NULL DEFAULT 'INVENTORY',
    "status" "ProvisioningStatus" NOT NULL DEFAULT 'PENDING',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "changedByAdminId" TEXT,
    "oldPrice" DECIMAL(10,2) NOT NULL,
    "newPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_code_key" ON "Provider"("code");

-- CreateIndex
CREATE INDEX "Provider_isActive_priority_idx" ON "Provider"("isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_providerId_key" ON "ProviderCredential"("providerId");

-- CreateIndex
CREATE INDEX "ProviderProduct_providerId_isActive_idx" ON "ProviderProduct"("providerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProduct_providerId_externalProductId_key" ON "ProviderProduct"("providerId", "externalProductId");

-- CreateIndex
CREATE INDEX "ProviderInventory_status_region_idx" ON "ProviderInventory"("status", "region");

-- CreateIndex
CREATE INDEX "ProviderInventory_providerId_status_idx" ON "ProviderInventory"("providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderInventory_providerId_providerVpsId_key" ON "ProviderInventory"("providerId", "providerVpsId");

-- CreateIndex
CREATE INDEX "VPSPlanProviderMapping_planId_isEnabled_priority_idx" ON "VPSPlanProviderMapping"("planId", "isEnabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "VPSPlanProviderMapping_planId_providerId_providerProductId_key" ON "VPSPlanProviderMapping"("planId", "providerId", "providerProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningJob_idempotencyKey_key" ON "ProvisioningJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProvisioningJob_orderId_status_idx" ON "ProvisioningJob"("orderId", "status");

-- CreateIndex
CREATE INDEX "ProvisioningJob_status_createdAt_idx" ON "ProvisioningJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProvisioningJob_providerId_status_idx" ON "ProvisioningJob"("providerId", "status");

-- CreateIndex
CREATE INDEX "PriceHistory_planId_createdAt_idx" ON "PriceHistory"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceHistory_changedByAdminId_idx" ON "PriceHistory"("changedByAdminId");

-- CreateIndex
CREATE INDEX "Admin_isActive_idx" ON "Admin"("isActive");

-- CreateIndex
CREATE INDEX "EmailVerificationOtp_expiresAt_idx" ON "EmailVerificationOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_expiresAt_idx" ON "PasswordResetOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VPSInstance_inventoryId_key" ON "VPSInstance"("inventoryId");

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderProduct" ADD CONSTRAINT "ProviderProduct_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderInventory" ADD CONSTRAINT "ProviderInventory_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VPSPlanProviderMapping" ADD CONSTRAINT "VPSPlanProviderMapping_planId_fkey" FOREIGN KEY ("planId") REFERENCES "VPSPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VPSPlanProviderMapping" ADD CONSTRAINT "VPSPlanProviderMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VPSPlanProviderMapping" ADD CONSTRAINT "VPSPlanProviderMapping_providerProductId_fkey" FOREIGN KEY ("providerProductId") REFERENCES "ProviderProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VPSInstance" ADD CONSTRAINT "VPSInstance_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "ProviderInventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningJob" ADD CONSTRAINT "ProvisioningJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningJob" ADD CONSTRAINT "ProvisioningJob_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningJob" ADD CONSTRAINT "ProvisioningJob_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "ProviderInventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "VPSPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_changedByAdminId_fkey" FOREIGN KEY ("changedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
