-- ====================================================================
-- FORWARD-ONLY MIGRATION: 20261118180000_phase1_database_realignment
-- TARGET: 24/7 HR Service VPS Hosting Platform
-- ====================================================================

-- --------------------------------------------------------------------
-- STEP 1: SAFETY GUARDS & DATA INTEGRITY VERIFICATION
-- --------------------------------------------------------------------
DO $$
BEGIN
  -- 1.1 Verify no unsupported VPSInstance status values exist
  IF EXISTS (
    SELECT 1 FROM "VPSInstance"
    WHERE "status" NOT IN ('PENDING', 'RUNNING', 'STOPPED', 'ACTIVE', 'SUSPENDED', 'TERMINATED')
  ) THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Unsupported VPSInstance status value detected.';
  END IF;

  -- 1.2 Verify no duplicate (paymentId, type) records exist in WalletTransaction
  IF EXISTS (
    SELECT 1 FROM "WalletTransaction"
    WHERE "paymentId" IS NOT NULL
    GROUP BY "paymentId", "type"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Duplicate (paymentId, type) records detected in WalletTransaction.';
  END IF;

  -- 1.3 Verify no unsupported Payment provider values exist
  IF EXISTS (
    SELECT 1 FROM "Payment"
    WHERE "provider" NOT IN ('RAZORPAY', 'WALLET')
  ) THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Unsupported Payment provider value detected.';
  END IF;
END $$;

-- --------------------------------------------------------------------
-- STEP 2: CREATE ENUMS & EXPAND EXISTING ENUMS
-- --------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentProvider') THEN
    CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'WALLET');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VPSStatus') THEN
    CREATE TYPE "VPSStatus" AS ENUM ('PENDING', 'RUNNING', 'STOPPED', 'ACTIVE', 'SUSPENDED', 'TERMINATED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConsentAction') THEN
    CREATE TYPE "ConsentAction" AS ENUM ('CONSENT_GRANTED', 'CONSENT_REVOKED');
  END IF;
END $$;

-- Expand PaymentPurpose enum
ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'VPS_RENEWAL';

-- --------------------------------------------------------------------
-- STEP 3: CONVERT Payment.provider TO ENUM IN-PLACE (NO DATA LOSS)
-- --------------------------------------------------------------------
ALTER TABLE "Payment" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "provider" TYPE "PaymentProvider" USING ("provider"::text::"PaymentProvider");
ALTER TABLE "Payment" ALTER COLUMN "provider" SET DEFAULT 'RAZORPAY'::"PaymentProvider";
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

-- --------------------------------------------------------------------
-- STEP 4: CONVERT VPSInstance.status TO ENUM & ADD LIFECYCLE COLUMNS
-- --------------------------------------------------------------------
-- Drop status index to allow changing column type from text to enum
DROP INDEX IF EXISTS "VPSInstance_status_idx";

ALTER TABLE "VPSInstance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "VPSInstance" ALTER COLUMN "status" TYPE "VPSStatus" USING ("status"::text::"VPSStatus");
ALTER TABLE "VPSInstance" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"VPSStatus";

-- Recreate index on enum column
CREATE INDEX "VPSInstance_status_idx" ON "VPSInstance"("status");

-- Add lifecycle & auto-renewal columns
ALTER TABLE "VPSInstance"
  ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoRenewConsentAt" TIMESTAMP(3),
  ADD COLUMN "autoRenewDisabledAt" TIMESTAMP(3),
  ADD COLUMN "gracePeriodDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "gracePeriodExpiresAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "providerSuspended" BOOLEAN NOT NULL DEFAULT false;

-- Add new VPSInstance indexes
CREATE INDEX "VPSInstance_expiresAt_idx" ON "VPSInstance"("expiresAt");
CREATE INDEX "VPSInstance_autoRenew_status_expiresAt_idx" ON "VPSInstance"("autoRenew", "status", "expiresAt");

-- --------------------------------------------------------------------
-- STEP 5: ALTER VPSInstance.userId FOREIGN KEY FROM CASCADE TO RESTRICT
-- --------------------------------------------------------------------
ALTER TABLE "VPSInstance" DROP CONSTRAINT IF EXISTS "VPSInstance_userId_fkey";
ALTER TABLE "VPSInstance" ADD CONSTRAINT "VPSInstance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- --------------------------------------------------------------------
-- STEP 6: WALLET TRANSACTION INDEXES (DROP SINGLE-COLUMN, ADD COMPOSITE)
-- --------------------------------------------------------------------
-- Drop single-column unique index that prevented refunds on same paymentId
DROP INDEX IF EXISTS "WalletTransaction_paymentId_key";

-- Create composite unique index
CREATE UNIQUE INDEX "WalletTransaction_paymentId_type_key" ON "WalletTransaction"("paymentId", "type");

-- Create type index
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

-- Create paymentId index for foreign key lookup performance
CREATE INDEX "WalletTransaction_paymentId_idx" ON "WalletTransaction"("paymentId");

-- --------------------------------------------------------------------
-- STEP 7: CREATE NEW TABLES (VPSConsentAudit & SystemSetting)
-- --------------------------------------------------------------------
CREATE TABLE "VPSConsentAudit" (
  "id" TEXT NOT NULL,
  "vpsId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" "ConsentAction" NOT NULL,
  "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VPSConsentAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VPSConsentAudit_vpsId_fkey" FOREIGN KEY ("vpsId") REFERENCES "VPSInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VPSConsentAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "VPSConsentAudit_vpsId_actionAt_idx" ON "VPSConsentAudit"("vpsId", "actionAt");
CREATE INDEX "VPSConsentAudit_userId_actionAt_idx" ON "VPSConsentAudit"("userId", "actionAt");

CREATE TABLE "SystemSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "description" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- Seed default global grace period setting
INSERT INTO "SystemSetting" ("id", "key", "value", "description", "updatedAt")
VALUES (
  'sys_default_grace_period',
  'vps.grace_period_days',
  '3',
  'Default grace period in days before an expired VPS is suspended',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- --------------------------------------------------------------------
-- STEP 8: ARRAY COLUMN INTEGRITY (supportedOS)
-- --------------------------------------------------------------------
ALTER TABLE "VPSPlan" ALTER COLUMN "supportedOS" SET DEFAULT '{}';
ALTER TABLE "VPSPlan" ALTER COLUMN "supportedOS" SET NOT NULL;

ALTER TABLE "ProviderProduct" ALTER COLUMN "supportedOS" SET DEFAULT '{}';
ALTER TABLE "ProviderProduct" ALTER COLUMN "supportedOS" SET NOT NULL;

-- --------------------------------------------------------------------
-- STEP 9: ENGINE-LEVEL FINANCIAL & LIFECYCLE CHECK CONSTRAINTS
-- --------------------------------------------------------------------
-- Wallet constraints
ALTER TABLE "Wallet"
  ADD CONSTRAINT "wallet_balance_positive_check" CHECK ("balance" >= 0),
  ADD CONSTRAINT "wallet_currency_inr_check" CHECK ("currency" = 'INR');

-- WalletTransaction constraints
ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "wallet_tx_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "wallet_tx_currency_inr_check" CHECK ("currency" = 'INR');

-- Payment constraints
ALTER TABLE "Payment"
  ADD CONSTRAINT "payment_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "payment_currency_inr_check" CHECK ("currency" = 'INR');

-- VPSInstance lifecycle & consent constraints
ALTER TABLE "VPSInstance"
  ADD CONSTRAINT "vps_autorenew_consent_check"
    CHECK (("autoRenew" = true AND "autoRenewConsentAt" IS NOT NULL) OR ("autoRenew" = false AND "autoRenewConsentAt" IS NULL)),
  ADD CONSTRAINT "vps_grace_period_days_check"
    CHECK ("gracePeriodDays" >= 0);
