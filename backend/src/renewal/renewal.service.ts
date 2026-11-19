import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSettingsService } from './admin-settings.service.js';
import { NotificationService } from './notification.service.js';
import { HostHeavenService } from '../hostheaven/hostheaven.service.js';
import { VpsService } from '../vps/vps.service.js';

@Injectable()
export class RenewalService {
  private readonly logger = new Logger(RenewalService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminSettings: AdminSettingsService,
    private readonly notificationService: NotificationService,
    @Optional() private readonly hostheavenService?: HostHeavenService,
    @Optional() private readonly vpsService?: VpsService,
  ) {}

  // ==========================================
  // CUSTOMER AUTO-RENEWAL CONSENT & CONTROLS
  // ==========================================

  async updateAutoRenewConsent(
    userId: string,
    vpsId: string,
    enabled: boolean,
    consent?: boolean,
  ) {
    const vps = await this.prisma.vPSInstance.findFirst({
      where: { id: vpsId, userId },
    });

    if (!vps) {
      throw new NotFoundException('VPS instance not found');
    }

    if (enabled) {
      if (!consent) {
        throw new BadRequestException(
          'Explicit customer consent is required to enable automatic renewals',
        );
      }

      const now = new Date();
      const updated = await this.prisma.$transaction(async (tx) => {
        const instance = await tx.vPSInstance.update({
          where: { id: vps.id },
          data: {
            autoRenew: true,
            autoRenewConsentAt: now,
            autoRenewDisabledAt: null,
          },
        });

        await tx.vPSConsentAudit.create({
          data: {
            vpsId: vps.id,
            userId,
            action: 'CONSENT_GRANTED',
            actionAt: now,
          },
        });

        return instance;
      });

      this.logger.log(
        `Customer ${userId} enabled auto-renew for VPS ${vps.ipAddress} at ${now.toISOString()}`,
      );

      return {
        message: 'Auto-renewal has been enabled successfully',
        autoRenew: updated.autoRenew,
        autoRenewConsentAt: updated.autoRenewConsentAt,
      };
    } else {
      const now = new Date();
      const updated = await this.prisma.$transaction(async (tx) => {
        const instance = await tx.vPSInstance.update({
          where: { id: vps.id },
          data: {
            autoRenew: false,
            autoRenewConsentAt: null,
            autoRenewDisabledAt: now,
          },
        });

        await tx.vPSConsentAudit.create({
          data: {
            vpsId: vps.id,
            userId,
            action: 'CONSENT_REVOKED',
            actionAt: now,
          },
        });

        return instance;
      });

      this.logger.log(
        `Customer ${userId} disabled auto-renew for VPS ${vps.ipAddress} at ${now.toISOString()}`,
      );

      return {
        message: 'Auto-renewal has been disabled',
        autoRenew: updated.autoRenew,
        autoRenewDisabledAt: updated.autoRenewDisabledAt,
      };
    }
  }

  async getVpsRenewalDetails(userId: string, vpsId: string) {
    const vps = await this.prisma.vPSInstance.findFirst({
      where: { id: vpsId, userId },
      include: {
        order: {
          include: {
            plan: true,
          },
        },
        renewalAttempts: {
          orderBy: { attemptedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!vps) {
      throw new NotFoundException('VPS instance not found');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    const balance = wallet?.balance ?? new Prisma.Decimal('0.00');

    // Use current plan selling price or fallback to order amount
    let renewalPrice = new Prisma.Decimal('999.00');
    let planName = 'VPS Plan';
    let durationDays = 30;

    if (vps.order?.plan) {
      renewalPrice = vps.order.plan.price;
      planName = vps.order.plan.name;
      durationDays = vps.order.plan.durationDays;
    } else if (vps.order?.amount) {
      renewalPrice = vps.order.amount;
      planName = vps.order.planName;
    }

    const isBalanceSufficient = balance.gte(renewalPrice);
    const shortfall = isBalanceSufficient
      ? new Prisma.Decimal('0.00')
      : renewalPrice.sub(balance);

    const settings = await this.adminSettings.getSettings();
    let nextRenewalAttempt: Date | null = null;
    if (vps.autoRenew && vps.expiresAt) {
      const windowMs = settings.renewalWindowDays * 24 * 60 * 60 * 1000;
      const attemptStart = new Date(vps.expiresAt.getTime() - windowMs);
      nextRenewalAttempt = attemptStart.getTime() > Date.now() ? attemptStart : new Date();
    }

    return {
      vpsId: vps.id,
      ipAddress: vps.ipAddress,
      hostname: vps.hostname,
      status: vps.status,
      expiresAt: vps.expiresAt,
      autoRenew: vps.autoRenew,
      autoRenewConsentAt: vps.autoRenewConsentAt,
      autoRenewDisabledAt: vps.autoRenewDisabledAt,
      gracePeriodDays: vps.gracePeriodDays,
      gracePeriodExpiresAt: vps.gracePeriodExpiresAt,
      suspendedAt: vps.suspendedAt,
      plan: {
        name: planName,
        renewalPrice,
        currency: 'INR',
        durationDays,
      },
      wallet: {
        balance,
        currency: wallet?.currency ?? 'INR',
      },
      isBalanceSufficient,
      shortfall,
      nextRenewalAttempt,
      recentAttempts: vps.renewalAttempts,
    };
  }

  // ==========================================
  // MANUAL RENEWAL VIA WALLET
  // ==========================================

  async renewVpsManual(userId: string, vpsId: string) {
    const vps = await this.prisma.vPSInstance.findFirst({
      where: { id: vpsId, userId },
      include: {
        order: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (!vps) {
      throw new NotFoundException('VPS instance not found');
    }

    if (vps.status === 'TERMINATED') {
      throw new BadRequestException('Terminated VPS instances cannot be renewed');
    }

    let renewalPrice = new Prisma.Decimal('999.00');
    let planName = 'VPS Plan';
    let durationDays = 30;

    if (vps.order?.plan) {
      renewalPrice = vps.order.plan.price;
      planName = vps.order.plan.name;
      durationDays = vps.order.plan.durationDays;
    } else if (vps.order?.amount) {
      renewalPrice = vps.order.amount;
      planName = vps.order.planName;
    }

    const timestamp = Date.now();
    const cycleId = `manual-${timestamp}`;
    const idempotencyKey = `vps-renewal-manual:${vps.id}:${timestamp}`;

    return this.executeRenewalTransaction({
      vps,
      userId,
      renewalPrice,
      planName,
      durationDays,
      cycleId,
      idempotencyKey,
      isAutomatic: false,
    });
  }

  // ==========================================
  // SCHEDULED AUTOMATIC RENEWAL ENGINE
  // ==========================================

  async processAutoRenewals() {
    if (this.isProcessing) {
      this.logger.warn('Previous auto-renewal process is still running. Skipping overlapping run.');
      return { skipped: true, reason: 'CONCURRENT_EXECUTION_PREVENTED' };
    }

    this.isProcessing = true;
    const summary = {
      totalEligible: 0,
      renewed: 0,
      insufficientBalance: 0,
      failed: 0,
    };

    try {
      const settings = await this.adminSettings.getSettings();
      const windowMs = settings.renewalWindowDays * 24 * 60 * 60 * 1000;
      const targetThreshold = new Date(Date.now() + windowMs);

      // Find eligible VPS instances:
      // 1. autoRenew = true
      // 2. autoRenewConsentAt is NOT null
      // 3. status is not TERMINATED
      // 4. expiresAt <= targetThreshold
      const eligibleVpsList = await this.prisma.vPSInstance.findMany({
        where: {
          autoRenew: true,
          autoRenewConsentAt: { not: null },
          status: { not: 'TERMINATED' },
          expiresAt: {
            lte: targetThreshold,
          },
        },
        include: {
          user: true,
          order: {
            include: {
              plan: true,
            },
          },
        },
        orderBy: { expiresAt: 'asc' },
      });

      summary.totalEligible = eligibleVpsList.length;
      this.logger.log(`Found ${eligibleVpsList.length} VPS instances eligible for auto-renewal`);

      for (const vps of eligibleVpsList) {
        try {
          const cycleId = vps.expiresAt
            ? vps.expiresAt.toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);
          const idempotencyKey = `vps-renewal:${vps.id}:${cycleId}`;

          // Check if this renewal cycle already succeeded
          const existingSuccess = await this.prisma.renewalAttempt.findUnique({
            where: { idempotencyKey },
          });

          if (existingSuccess && existingSuccess.status === 'SUCCESS') {
            this.logger.debug(`VPS ${vps.ipAddress} cycle ${cycleId} already renewed`);
            continue;
          }

          let renewalPrice = new Prisma.Decimal('999.00');
          let planName = 'VPS Plan';
          let durationDays = 30;

          if (vps.order?.plan) {
            renewalPrice = vps.order.plan.price;
            planName = vps.order.plan.name;
            durationDays = vps.order.plan.durationDays;
          } else if (vps.order?.amount) {
            renewalPrice = vps.order.amount;
            planName = vps.order.planName;
          }

          // Check wallet balance
          const wallet = await this.prisma.wallet.findUnique({
            where: { userId: vps.userId },
          });

          const currentBalance = wallet?.balance ?? new Prisma.Decimal('0.00');

          if (!wallet || currentBalance.lt(renewalPrice)) {
            // Insufficient balance
            summary.insufficientBalance++;
            const shortfall = renewalPrice.sub(currentBalance);

            // Record failed attempt
            await this.prisma.renewalAttempt.upsert({
              where: { idempotencyKey },
              create: {
                vpsId: vps.id,
                userId: vps.userId,
                status: 'INSUFFICIENT_FUNDS',
                renewalAmount: renewalPrice,
                walletBalance: currentBalance,
                previousExpiresAt: vps.expiresAt,
                newExpiresAt: vps.expiresAt,
                errorMessage: `Insufficient wallet balance. Required: ₹${renewalPrice}, Available: ₹${currentBalance}`,
                idempotencyKey,
              },
              update: {
                walletBalance: currentBalance,
                attemptedAt: new Date(),
              },
            });

            // Notify customer (idempotent notification)
            await this.notificationService.notifyInsufficientBalance(
              vps.user,
              vps,
              renewalPrice.toString(),
              currentBalance.toString(),
              shortfall.toString(),
            );

            this.logger.warn(
              `VPS ${vps.ipAddress} auto-renewal failed: Insufficient balance (Balance: ₹${currentBalance}, Needed: ₹${renewalPrice})`,
            );
            continue;
          }

          // Wallet balance is sufficient, execute atomic debit & extension
          await this.executeRenewalTransaction({
            vps,
            userId: vps.userId,
            renewalPrice,
            planName,
            durationDays,
            cycleId,
            idempotencyKey,
            isAutomatic: true,
          });

          summary.renewed++;
        } catch (error) {
          summary.failed++;
          this.logger.error(
            `Error processing auto-renewal for VPS ${vps.id} (${vps.ipAddress}):`,
            error,
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return summary;
  }

  // ==========================================
  // ATOMIC RENEWAL TRANSACTION
  // ==========================================

  private async executeRenewalTransaction(params: {
    vps: any;
    userId: string;
    renewalPrice: Prisma.Decimal;
    planName: string;
    durationDays: number;
    cycleId: string;
    idempotencyKey: string;
    isAutomatic: boolean;
  }) {
    const {
      vps,
      userId,
      renewalPrice,
      planName,
      durationDays,
      cycleId,
      idempotencyKey,
      isAutomatic,
    } = params;

    return await this.prisma.$transaction(
      async (tx) => {
        // 1. Lock and verify wallet balance atomically
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet || wallet.balance.lt(renewalPrice)) {
          throw new BadRequestException(
            `Insufficient wallet balance. Please add money to your wallet. Required: ₹${renewalPrice}`,
          );
        }

        // Atomic conditional decrement
        const debitResult = await tx.wallet.updateMany({
          where: {
            id: wallet.id,
            balance: {
              gte: renewalPrice,
            },
          },
          data: {
            balance: {
              decrement: renewalPrice,
            },
          },
        });

        if (debitResult.count !== 1) {
          throw new ConflictException(
            'Wallet balance changed concurrently. Please retry.',
          );
        }

        const updatedWallet = await tx.wallet.findUniqueOrThrow({
          where: { id: wallet.id },
        });

        // 2. Create Payment record for VPS_RENEWAL
        const payment = await tx.payment.create({
          data: {
            userId,
            orderId: vps.orderId,
            purpose: 'VPS_RENEWAL',
            provider: 'WALLET',
            amount: renewalPrice,
            currency: 'INR',
            status: 'CAPTURED',
          },
        });

        // 3. Create WalletTransaction with unique idempotencyKey
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'DEBIT',
            amount: renewalPrice,
            currency: 'INR',
            reference: vps.hostname || vps.ipAddress,
            idempotencyKey: `wallet-vps-renewal:${payment.id}`,
            description: `VPS renewal (${durationDays} days) - ${planName}`,
            paymentId: payment.id,
            metadata: {
              vpsId: vps.id,
              ipAddress: vps.ipAddress,
              isAutomatic,
              cycleId,
            },
          },
        });

        // 4. Calculate new expiry
        const baseDate =
          vps.expiresAt && vps.expiresAt.getTime() > Date.now()
            ? new Date(vps.expiresAt)
            : new Date();

        const newExpiresAt = new Date(
          baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000,
        );

        // 5. Confirm provider renewal before extending local VPS expiry
        if (vps.provider === 'HOSTHEAVEN' && this.hostheavenService) {
          const monthsToAdd = Math.max(1, Math.round(durationDays / 30));
          await this.hostheavenService.renewVm(
            vps.providerVpsId || vps.id,
            monthsToAdd,
          );
        } else if (vps.provider === 'SMARTVPS' && this.vpsService) {
          await this.vpsService.renew(vps.ipAddress);
        }

        // 6. Update VPSInstance
        const updatedVps = await tx.vPSInstance.update({
          where: { id: vps.id },
          data: {
            expiresAt: newExpiresAt,
            gracePeriodExpiresAt: null,
            suspendedAt: null,
            status: vps.status === 'SUSPENDED' ? 'ACTIVE' : vps.status,
          },
        });

        // 7. Record RenewalAttempt
        const attempt = await tx.renewalAttempt.upsert({
          where: { idempotencyKey },
          create: {
            vpsId: vps.id,
            userId,
            status: 'SUCCESS',
            renewalAmount: renewalPrice,
            walletBalance: updatedWallet.balance,
            previousExpiresAt: vps.expiresAt,
            newExpiresAt,
            paymentId: payment.id,
            idempotencyKey,
          },
          update: {
            status: 'SUCCESS',
            renewalAmount: renewalPrice,
            walletBalance: updatedWallet.balance,
            previousExpiresAt: vps.expiresAt,
            newExpiresAt,
            paymentId: payment.id,
            errorMessage: null,
            attemptedAt: new Date(),
          },
        });

        return {
          vps: updatedVps,
          payment,
          wallet: updatedWallet,
          attempt,
          newExpiresAt,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    ).then(async (result) => {
      // Send notification after transaction commits
      const user =
        vps.user ||
        (await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true },
        }));

      if (user) {
        await this.notificationService.notifyRenewalSuccess(
          user,
          vps,
          renewalPrice.toString(),
          result.newExpiresAt,
          cycleId,
        );
      }

      return {
        message: 'VPS renewal completed successfully',
        status: 'SUCCESS',
        expiresAt: result.newExpiresAt,
        amount: renewalPrice,
        balance: result.wallet.balance,
        paymentId: result.payment.id,
      };
    });
  }

  // ==========================================
  // ADMIN QUERIES & RETRY
  // ==========================================

  async getUpcomingRenewals() {
    const settings = await this.adminSettings.getSettings();
    const windowMs = settings.renewalWindowDays * 24 * 60 * 60 * 1000;
    const targetThreshold = new Date(Date.now() + windowMs);

    return this.prisma.vPSInstance.findMany({
      where: {
        expiresAt: { lte: targetThreshold },
        status: { not: 'TERMINATED' },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        order: {
          include: { plan: true },
        },
        renewalAttempts: {
          orderBy: { attemptedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async getRenewalHistory(status?: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));

    const where: Prisma.RenewalAttemptWhereInput = {};
    if (status?.trim()) {
      where.status = status.trim().toUpperCase();
    }

    const [attempts, total] = await Promise.all([
      this.prisma.renewalAttempt.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          vps: {
            select: { id: true, ipAddress: true, hostname: true, status: true },
          },
        },
        orderBy: { attemptedAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.renewalAttempt.count({ where }),
    ]);

    return {
      attempts,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getInsufficientBalanceCases() {
    return this.prisma.renewalAttempt.findMany({
      where: { status: 'INSUFFICIENT_FUNDS' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        vps: {
          select: { id: true, ipAddress: true, hostname: true, status: true, expiresAt: true },
        },
      },
      orderBy: { attemptedAt: 'desc' },
      take: 50,
    });
  }

  async retryRenewal(vpsId: string) {
    const vps = await this.prisma.vPSInstance.findUnique({
      where: { id: vpsId },
      include: {
        user: true,
        order: {
          include: { plan: true },
        },
      },
    });

    if (!vps) {
      throw new NotFoundException('VPS instance not found');
    }

    let renewalPrice = new Prisma.Decimal('999.00');
    let planName = 'VPS Plan';
    let durationDays = 30;

    if (vps.order?.plan) {
      renewalPrice = vps.order.plan.price;
      planName = vps.order.plan.name;
      durationDays = vps.order.plan.durationDays;
    }

    const timestamp = Date.now();
    const cycleId = `admin-retry-${timestamp}`;
    const idempotencyKey = `vps-renewal-retry:${vps.id}:${timestamp}`;

    return this.executeRenewalTransaction({
      vps,
      userId: vps.userId,
      renewalPrice,
      planName,
      durationDays,
      cycleId,
      idempotencyKey,
      isAutomatic: false,
    });
  }
}
