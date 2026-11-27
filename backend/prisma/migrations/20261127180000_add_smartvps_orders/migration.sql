-- CreateEnum
CREATE TYPE "SmartVpsOrderStatus" AS ENUM ('PAYMENT_PENDING', 'PAID', 'PROVISIONING', 'ACTIVE', 'PROVISIONING_FAILED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'SMARTVPS_ORDER';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "smartVpsOrderId" TEXT;

-- CreateTable
CREATE TABLE "SmartVpsOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "planName" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "SmartVpsOrderStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "providerIp" TEXT,
    "providerUsername" TEXT,
    "passwordEncrypted" TEXT,
    "provisioningError" TEXT,
    "paidAt" TIMESTAMP(3),
    "provisionedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartVpsOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmartVpsOrder_idempotencyKey_key" ON "SmartVpsOrder"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SmartVpsOrder_providerIp_key" ON "SmartVpsOrder"("providerIp");

-- CreateIndex
CREATE INDEX "SmartVpsOrder_userId_createdAt_idx" ON "SmartVpsOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SmartVpsOrder_status_idx" ON "SmartVpsOrder"("status");

-- CreateIndex
CREATE INDEX "Payment_smartVpsOrderId_idx" ON "Payment"("smartVpsOrderId");

-- AddForeignKey
ALTER TABLE "SmartVpsOrder" ADD CONSTRAINT "SmartVpsOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_smartVpsOrderId_fkey" FOREIGN KEY ("smartVpsOrderId") REFERENCES "SmartVpsOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
