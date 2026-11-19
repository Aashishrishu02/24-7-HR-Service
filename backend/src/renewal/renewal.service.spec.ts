import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenewalService } from './renewal.service.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

describe('RenewalService', () => {
  let service: RenewalService;
  let mockPrisma: any;
  let mockAdminSettings: any;
  let mockNotificationService: any;

  beforeEach(() => {
    mockPrisma = {
      vPSInstance: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      vPSConsentAudit: {
        create: vi.fn(),
      },
      wallet: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      payment: {
        create: vi.fn(),
      },
      walletTransaction: {
        create: vi.fn(),
      },
      renewalAttempt: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockAdminSettings = {
      getSettings: vi.fn().mockResolvedValue({
        renewalWindowDays: 7,
        gracePeriodDays: 3,
        preExpiryNotificationDays: [7, 3, 1],
        lowBalanceNotificationHours: 24,
        suspensionPolicy: 'AUTO_SUSPEND_ON_EXPIRY',
        terminationPolicy: 'AUTO_TERMINATE_AFTER_GRACE',
        renewalPricingModel: 'PLAN_SELLING_PRICE',
      }),
    };

    mockNotificationService = {
      notifyUpcomingExpiry: vi.fn(),
      notifyRenewalSuccess: vi.fn(),
      notifyRenewalFailed: vi.fn(),
      notifyInsufficientBalance: vi.fn(),
      notifyVpsSuspended: vi.fn(),
      notifyGracePeriodEnding: vi.fn(),
      notifyVpsTerminated: vi.fn(),
    };

    service = new RenewalService(
      mockPrisma,
      mockAdminSettings,
      mockNotificationService,
    );
  });

  describe('updateAutoRenewConsent', () => {
    it('requires explicit customer consent when enabling auto-renewal', async () => {
      mockPrisma.vPSInstance.findFirst.mockResolvedValue({
        id: 'vps-1',
        userId: 'u-1',
        autoRenew: false,
      });

      await expect(
        service.updateAutoRenewConsent('u-1', 'vps-1', true, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('enables auto-renewal with consent and writes audit record', async () => {
      mockPrisma.vPSInstance.findFirst.mockResolvedValue({
        id: 'vps-1',
        userId: 'u-1',
        ipAddress: '103.1.1.1',
        autoRenew: false,
      });
      mockPrisma.vPSInstance.update.mockResolvedValue({
        id: 'vps-1',
        autoRenew: true,
        autoRenewConsentAt: new Date(),
      });

      const result = await service.updateAutoRenewConsent('u-1', 'vps-1', true, true);
      expect(result.autoRenew).toBe(true);
      expect(mockPrisma.vPSInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vps-1' },
          data: expect.objectContaining({
            autoRenew: true,
            autoRenewConsentAt: expect.any(Date),
            autoRenewDisabledAt: null,
          }),
        }),
      );
      expect(mockPrisma.vPSConsentAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vpsId: 'vps-1',
            userId: 'u-1',
            action: 'CONSENT_GRANTED',
          }),
        }),
      );
    });

    it('disables auto-renewal, sets autoRenewDisabledAt, and writes audit record', async () => {
      mockPrisma.vPSInstance.findFirst.mockResolvedValue({
        id: 'vps-1',
        userId: 'u-1',
        ipAddress: '103.1.1.1',
        autoRenew: true,
      });
      mockPrisma.vPSInstance.update.mockResolvedValue({
        id: 'vps-1',
        autoRenew: false,
        autoRenewDisabledAt: new Date(),
      });

      const result = await service.updateAutoRenewConsent('u-1', 'vps-1', false);
      expect(result.autoRenew).toBe(false);
      expect(mockPrisma.vPSInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vps-1' },
          data: expect.objectContaining({
            autoRenew: false,
            autoRenewConsentAt: null,
            autoRenewDisabledAt: expect.any(Date),
          }),
        }),
      );
      expect(mockPrisma.vPSConsentAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vpsId: 'vps-1',
            userId: 'u-1',
            action: 'CONSENT_REVOKED',
          }),
        }),
      );
    });

    it('throws NotFoundException if VPS does not belong to user', async () => {
      mockPrisma.vPSInstance.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAutoRenewConsent('u-attacker', 'vps-1', true, true),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('processAutoRenewals', () => {
    it('skips VPS instances where auto-renewal consent is not granted', async () => {
      // eligibleVpsList query filters autoRenew = true and autoRenewConsentAt != null
      mockPrisma.vPSInstance.findMany.mockResolvedValue([]);

      const summary = await service.processAutoRenewals();
      expect(summary.totalEligible).toBe(0);
      expect(mockPrisma.wallet.findUnique).not.toHaveBeenCalled();
    });

    it('handles insufficient wallet balance: does not debit wallet, does not extend expiry, records INSUFFICIENT_FUNDS, notifies user', async () => {
      const expiringVps = {
        id: 'vps-expiring-1',
        userId: 'u-1',
        ipAddress: '103.5.5.5',
        autoRenew: true,
        autoRenewConsentAt: new Date('2026-11-01'),
        expiresAt: new Date('2026-11-20'),
        user: { id: 'u-1', email: 'cust@test.com', name: 'Cust' },
        order: {
          plan: {
            price: new Prisma.Decimal('999.00'),
            name: 'VPS Pro',
            durationDays: 30,
          },
        },
      };

      mockPrisma.vPSInstance.findMany.mockResolvedValue([expiringVps]);
      mockPrisma.renewalAttempt.findUnique.mockResolvedValue(null);
      // Wallet has only ₹200 (less than ₹999)
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 'w-1',
        userId: 'u-1',
        balance: new Prisma.Decimal('200.00'),
      });

      const summary = await service.processAutoRenewals();

      expect(summary.insufficientBalance).toBe(1);
      expect(summary.renewed).toBe(0);

      // Verify wallet was NOT debited
      expect(mockPrisma.wallet.updateMany).not.toHaveBeenCalled();
      // Verify VPS expiry was NOT updated
      expect(mockPrisma.vPSInstance.update).not.toHaveBeenCalled();
      // Verify INSUFFICIENT_FUNDS was recorded in RenewalAttempt
      expect(mockPrisma.renewalAttempt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            vpsId: 'vps-expiring-1',
            status: 'INSUFFICIENT_FUNDS',
            renewalAmount: new Prisma.Decimal('999.00'),
            walletBalance: new Prisma.Decimal('200.00'),
          }),
        }),
      );
      // Verify customer notification was triggered
      expect(mockNotificationService.notifyInsufficientBalance).toHaveBeenCalledWith(
        expiringVps.user,
        expiringVps,
        '999',
        '200',
        '799',
      );
    });

    it('successfully renews VPS: debits wallet atomically, creates Payment & WalletTransaction, extends expiry correctly', async () => {
      const initialExpiresAt = new Date('2026-11-25T10:00:00Z');
      const expiringVps = {
        id: 'vps-success-1',
        userId: 'u-1',
        ipAddress: '103.5.5.6',
        autoRenew: true,
        autoRenewConsentAt: new Date('2026-11-01'),
        expiresAt: initialExpiresAt,
        status: 'ACTIVE',
        user: { id: 'u-1', email: 'cust@test.com', name: 'Cust' },
        order: {
          orderNumber: 'IC-ORD-1',
          plan: {
            price: new Prisma.Decimal('999.00'),
            name: 'VPS Pro',
            durationDays: 30,
          },
        },
      };

      mockPrisma.vPSInstance.findMany.mockResolvedValue([expiringVps]);
      mockPrisma.renewalAttempt.findUnique.mockResolvedValue(null);

      // Wallet has ₹2,000 (sufficient)
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 'w-1',
        userId: 'u-1',
        balance: new Prisma.Decimal('2000.00'),
      });
      mockPrisma.wallet.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'w-1',
        userId: 'u-1',
        balance: new Prisma.Decimal('1001.00'),
      });

      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-renew-1',
        amount: new Prisma.Decimal('999.00'),
        status: 'CAPTURED',
      });

      mockPrisma.vPSInstance.update.mockImplementation(async ({ data }: any) => ({
        ...expiringVps,
        ...data,
      }));

      const summary = await service.processAutoRenewals();

      expect(summary.renewed).toBe(1);
      expect(mockPrisma.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'w-1', balance: { gte: new Prisma.Decimal('999.00') } },
        data: { balance: { decrement: new Prisma.Decimal('999.00') } },
      });

      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u-1',
          purpose: 'VPS_RENEWAL',
          provider: 'WALLET',
          amount: new Prisma.Decimal('999.00'),
          status: 'CAPTURED',
        }),
      });

      expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'DEBIT',
          amount: new Prisma.Decimal('999.00'),
          paymentId: 'pay-renew-1',
        }),
      });

      // Expiry extension: 30 days added to initialExpiresAt (2026-11-25 + 30 days = 2026-12-25)
      expect(mockPrisma.vPSInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vps-success-1' },
          data: expect.objectContaining({
            expiresAt: new Date(initialExpiresAt.getTime() + 30 * 86400000),
          }),
        }),
      );

      expect(mockNotificationService.notifyRenewalSuccess).toHaveBeenCalled();
    });

    it('skips duplicate auto-renewal attempts for the same cycle idempotently', async () => {
      const expiringVps = {
        id: 'vps-already-renewed',
        userId: 'u-1',
        ipAddress: '103.5.5.7',
        autoRenew: true,
        autoRenewConsentAt: new Date(),
        expiresAt: new Date('2026-11-25'),
        order: { plan: { price: new Prisma.Decimal('999.00') } },
      };

      mockPrisma.vPSInstance.findMany.mockResolvedValue([expiringVps]);
      // Successful renewal attempt already recorded
      mockPrisma.renewalAttempt.findUnique.mockResolvedValue({
        id: 'att-1',
        status: 'SUCCESS',
      });

      const summary = await service.processAutoRenewals();

      expect(summary.renewed).toBe(0);
      expect(mockPrisma.wallet.findUnique).not.toHaveBeenCalled();
    });

    it('prevents concurrent overlapping execution of processAutoRenewals', async () => {
      (service as any).isProcessing = true;

      const result: any = await service.processAutoRenewals();
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('CONCURRENT_EXECUTION_PREVENTED');
      expect(mockPrisma.vPSInstance.findMany).not.toHaveBeenCalled();

      (service as any).isProcessing = false;
    });

    it('aborts renewal and rolls back when HostHeaven provider renewal fails', async () => {
      const expiringVps = {
        id: 'vps-hh-fail',
        userId: 'u-1',
        provider: 'HOSTHEAVEN',
        providerVpsId: 'hh-vm-fail',
        ipAddress: '103.174.1.1',
        autoRenew: true,
        autoRenewConsentAt: new Date(),
        expiresAt: new Date('2026-11-20'),
        order: { plan: { price: new Prisma.Decimal('999.00'), durationDays: 30 } },
      };

      mockPrisma.vPSInstance.findMany.mockResolvedValue([expiringVps]);
      mockPrisma.renewalAttempt.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 'w-1',
        balance: new Prisma.Decimal('5000.00'),
      });
      mockPrisma.wallet.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'w-1',
        balance: new Prisma.Decimal('4001.00'),
      });
      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-renew-hh-fail',
        amount: new Prisma.Decimal('999.00'),
        status: 'CAPTURED',
      });

      const mockHostHeaven = {
        renewVm: vi.fn().mockRejectedValue(new Error('HostHeaven upstream provider failure')),
      };

      const customService = new RenewalService(
        mockPrisma,
        mockAdminSettings,
        mockNotificationService,
        mockHostHeaven as any,
      );

      const summary = await customService.processAutoRenewals();
      expect(summary.failed).toBe(1);
      expect(summary.renewed).toBe(0);
      expect(mockHostHeaven.renewVm).toHaveBeenCalledWith('hh-vm-fail', 1);
      // Ensure vpsInstance expiry was not updated
      expect(mockPrisma.vPSInstance.update).not.toHaveBeenCalled();
    });
  });
});
