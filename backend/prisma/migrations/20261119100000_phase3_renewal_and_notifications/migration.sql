-- ====================================================================
-- FORWARD-ONLY MIGRATION: 20261119100000_phase3_renewal_and_notifications
-- TARGET: 24/7 HR Service VPS Hosting Platform
-- ====================================================================

-- CreateTable: RenewalAttempt
CREATE TABLE IF NOT EXISTS "RenewalAttempt" (
    "id" TEXT NOT NULL,
    "vpsId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "renewalAmount" DECIMAL(10,2) NOT NULL,
    "walletBalance" DECIMAL(10,2),
    "previousExpiresAt" TIMESTAMP(3),
    "newExpiresAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenewalAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NotificationLog
CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vpsId" TEXT,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: RenewalAttempt
CREATE UNIQUE INDEX IF NOT EXISTS "RenewalAttempt_idempotencyKey_key" ON "RenewalAttempt"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "RenewalAttempt_vpsId_attemptedAt_idx" ON "RenewalAttempt"("vpsId", "attemptedAt");
CREATE INDEX IF NOT EXISTS "RenewalAttempt_userId_attemptedAt_idx" ON "RenewalAttempt"("userId", "attemptedAt");
CREATE INDEX IF NOT EXISTS "RenewalAttempt_status_idx" ON "RenewalAttempt"("status");

-- CreateIndex: NotificationLog
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_idempotencyKey_key" ON "NotificationLog"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "NotificationLog_userId_type_sentAt_idx" ON "NotificationLog"("userId", "type", "sentAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_vpsId_type_idx" ON "NotificationLog"("vpsId", "type");

-- AddForeignKey: RenewalAttempt
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RenewalAttempt_vpsId_fkey'
    ) THEN
        ALTER TABLE "RenewalAttempt" ADD CONSTRAINT "RenewalAttempt_vpsId_fkey" FOREIGN KEY ("vpsId") REFERENCES "VPSInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RenewalAttempt_userId_fkey'
    ) THEN
        ALTER TABLE "RenewalAttempt" ADD CONSTRAINT "RenewalAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: NotificationLog
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NotificationLog_userId_fkey'
    ) THEN
        ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NotificationLog_vpsId_fkey'
    ) THEN
        ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_vpsId_fkey" FOREIGN KEY ("vpsId") REFERENCES "VPSInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
