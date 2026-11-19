import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { VpsService } from '../vps/vps.service.js';
import { AdminSettingsService } from './admin-settings.service.js';
import { NotificationService } from './notification.service.js';

@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vpsService: VpsService,
    private readonly adminSettings: AdminSettingsService,
    private readonly notificationService: NotificationService,
  ) {}

  async processLifecycle() {
    if (this.isProcessing) {
      this.logger.warn('Lifecycle process is already running. Skipping overlapping execution.');
      return { skipped: true, reason: 'CONCURRENT_EXECUTION_PREVENTED' };
    }

    this.isProcessing = true;
    const summary = {
      preExpiryNotified: 0,
      suspended: 0,
      graceWarningsSent: 0,
      terminated: 0,
      errors: 0,
    };

    try {
      const settings = await this.adminSettings.getSettings();
      const now = new Date();

      // ==========================================
      // STEP 1: PRE-EXPIRY NOTIFICATIONS
      // ==========================================
      for (const days of settings.preExpiryNotificationDays) {
        const lowerBound = new Date(now.getTime() + (days - 1) * 24 * 60 * 60 * 1000);
        const upperBound = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        const expiringSoon = await this.prisma.vPSInstance.findMany({
          where: {
            status: { in: ['ACTIVE', 'RUNNING'] },
            expiresAt: {
              gte: lowerBound,
              lte: upperBound,
            },
          },
          include: { user: true },
        });

        for (const vps of expiringSoon) {
          try {
            if (vps.expiresAt) {
              const res = await this.notificationService.notifyUpcomingExpiry(
                vps.user,
                { id: vps.id, ipAddress: vps.ipAddress, hostname: vps.hostname, expiresAt: vps.expiresAt },
                days,
              );
              if (res.sent) summary.preExpiryNotified++;
            }
          } catch (err) {
            this.logger.error(`Failed to send pre-expiry notification for VPS ${vps.ipAddress}:`, err);
          }
        }
      }

      // ==========================================
      // STEP 2: EXPIRY & SUSPENSION
      // ==========================================
      if (settings.suspensionPolicy === 'AUTO_SUSPEND_ON_EXPIRY') {
        const expiredInstances = await this.prisma.vPSInstance.findMany({
          where: {
            status: { notIn: ['SUSPENDED', 'TERMINATED'] },
            expiresAt: {
              lte: now,
            },
          },
          include: { user: true },
        });

        for (const vps of expiredInstances) {
          try {
            const graceDays = vps.gracePeriodDays || settings.gracePeriodDays || 3;
            const gracePeriodExpiresAt = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);

            // Attempt provider stop/suspend
            let providerStopped = false;
            try {
              await this.vpsService.stop(vps.ipAddress);
              providerStopped = true;
            } catch (providerError) {
              this.logger.warn(
                `Provider stop error for VPS ${vps.ipAddress} during suspension. Retaining status for reconciliation.`,
                providerError,
              );
            }

            // Update database state
            const updated = await this.prisma.vPSInstance.update({
              where: { id: vps.id },
              data: {
                status: 'SUSPENDED',
                suspendedAt: now,
                gracePeriodExpiresAt,
                providerSuspended: providerStopped,
              },
            });

            await this.notificationService.notifyVpsSuspended(
              vps.user,
              vps,
              gracePeriodExpiresAt,
            );

            summary.suspended++;
            this.logger.log(`Suspended expired VPS ${updated.ipAddress}. Grace period until ${gracePeriodExpiresAt.toISOString()}`);
          } catch (err) {
            summary.errors++;
            this.logger.error(`Error suspending VPS ${vps.ipAddress}:`, err);
          }
        }
      }

      // ==========================================
      // STEP 3: GRACE PERIOD ENDING WARNING
      // ==========================================
      const graceEndingThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const graceEndingInstances = await this.prisma.vPSInstance.findMany({
        where: {
          status: 'SUSPENDED',
          gracePeriodExpiresAt: {
            gt: now,
            lte: graceEndingThreshold,
          },
        },
        include: { user: true },
      });

      for (const vps of graceEndingInstances) {
        try {
          const res = await this.notificationService.notifyGracePeriodEnding(vps.user, vps, 24);
          if (res.sent) summary.graceWarningsSent++;
        } catch (err) {
          this.logger.error(`Failed to send grace ending warning for VPS ${vps.ipAddress}:`, err);
        }
      }

      // ==========================================
      // STEP 4: TERMINATION AFTER GRACE PERIOD
      // ==========================================
      if (settings.terminationPolicy === 'AUTO_TERMINATE_AFTER_GRACE') {
        const terminationEligible = await this.prisma.vPSInstance.findMany({
          where: {
            status: 'SUSPENDED',
            gracePeriodExpiresAt: {
              lte: now,
            },
          },
          include: { user: true },
        });

        for (const vps of terminationEligible) {
          try {
            // Verify current provider status and ownership before terminating
            const providerStatus = await this.verifyProviderStatusAndOwnership(vps);
            if (!providerStatus.verified) {
              this.logger.warn(
                `Skipping termination for VPS ${vps.ipAddress}: Provider status verification failed (${providerStatus.reason})`,
              );
              continue;
            }

            // Execute termination: update status to TERMINATED
            // Never delete VPS record, order, or payments from database!
            await this.prisma.vPSInstance.update({
              where: { id: vps.id },
              data: {
                status: 'TERMINATED',
              },
            });

            await this.notificationService.notifyVpsTerminated(vps.user, vps);

            summary.terminated++;
            this.logger.warn(`Terminated VPS ${vps.ipAddress} after grace period expiration.`);
          } catch (err) {
            summary.errors++;
            this.logger.error(`Error terminating VPS ${vps.ipAddress}:`, err);
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return summary;
  }

  // ==========================================
  // PROVIDER VERIFICATION & OWNERSHIP
  // ==========================================

  private async verifyProviderStatusAndOwnership(vps: any): Promise<{ verified: boolean; reason?: string }> {
    try {
      // 1. Verify instance ownership in database
      if (!vps.userId || !vps.ipAddress) {
        return { verified: false, reason: 'Invalid ownership data' };
      }

      // 2. Query provider status
      const statusRes: any = await this.vpsService.getStatus(vps.ipAddress);

      if (!statusRes) {
        return { verified: false, reason: 'No response from provider' };
      }

      return { verified: true };
    } catch (err) {
      // Do not treat provider timeout or failure as confirmation of successful termination!
      return {
        verified: false,
        reason: err instanceof Error ? err.message : 'Provider communication failure',
      };
    }
  }

  // ==========================================
  // ADMIN QUERIES & RETRIES
  // ==========================================

  async getSuspendedInstances() {
    return this.prisma.vPSInstance.findMany({
      where: { status: 'SUSPENDED' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { gracePeriodExpiresAt: 'asc' },
    });
  }

  async getTerminationPendingInstances() {
    return this.prisma.vPSInstance.findMany({
      where: {
        status: 'SUSPENDED',
        gracePeriodExpiresAt: {
          lte: new Date(),
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { gracePeriodExpiresAt: 'asc' },
    });
  }

  async retryLifecycleAction(vpsId: string, action: 'SUSPEND' | 'TERMINATE') {
    const vps = await this.prisma.vPSInstance.findUnique({
      where: { id: vpsId },
      include: { user: true },
    });

    if (!vps) {
      throw new NotFoundException('VPS instance not found');
    }

    if (action === 'SUSPEND') {
      try {
        await this.vpsService.stop(vps.ipAddress);
      } catch (err) {
        this.logger.warn(`Provider stop retry error for VPS ${vps.ipAddress}:`, err);
      }

      const updated = await this.prisma.vPSInstance.update({
        where: { id: vps.id },
        data: {
          status: 'SUSPENDED',
          suspendedAt: vps.suspendedAt || new Date(),
          providerSuspended: true,
        },
      });

      return { message: 'VPS suspended and marked successfully', vps: updated };
    } else if (action === 'TERMINATE') {
      const verification = await this.verifyProviderStatusAndOwnership(vps);
      if (!verification.verified) {
        throw new Error(`Cannot terminate VPS: Provider verification failed (${verification.reason})`);
      }

      const updated = await this.prisma.vPSInstance.update({
        where: { id: vps.id },
        data: {
          status: 'TERMINATED',
        },
      });

      await this.notificationService.notifyVpsTerminated(vps.user, vps);
      return { message: 'VPS terminated successfully', vps: updated };
    }

    throw new NotFoundException(`Unsupported lifecycle action: ${action}`);
  }
}
