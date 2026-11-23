import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckoutService } from './checkout.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { BadRequestException } from '@nestjs/common';

describe('CheckoutService — Direct HostHeaven Checkout & Provisioning', () => {
  let service: CheckoutService;
  let mockPrisma: any;
  let mockInventoryAllocator: any;
  let mockProvisioningService: any;
  let mockAdminSettingsService: any;
  let mockHostHeavenService: any;
  let mockDirectCatalogueService: any;
  let mockWalletBalance: Prisma.Decimal;

  const validValidatedConfig = {
    serviceId: 'hh:SHARED:zone-delhi:cpu-1:ram-1:disk-1:bw-1',
    serviceName: 'Cloud VPS 1 vCPU - 1 GB RAM',
    planType: 'SHARED',
    zoneId: 'zone-delhi',
    zoneName: 'Delhi NCR',
    zoneIsoId: 'iso-u22',
    isoName: 'Ubuntu 22.04 LTS',
    cpuPriceId: 'cpu-1',
    ramPriceId: 'ram-1',
    diskPriceId: 'disk-1',
    bandwidthPriceId: 'bw-1',
    cpuCores: 1,
    ramGb: 1,
    storageGb: 20,
    bandwidthGb: 1000,
    months: 1,
    monthlyProviderCost: 644.69,
    totalProviderCost: 644.69,
    marginPercent: 20,
    customerSellingPrice: 805.86,
    grossProfit: 161.17,
  };

  beforeEach(() => {
    mockWalletBalance = new Prisma.Decimal('1000.00');
    mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-123', isActive: true }),
      },
      wallet: {
        upsert: vi.fn().mockResolvedValue({
          id: 'wallet-123',
          userId: 'user-123',
          currency: 'INR',
          balance: mockWalletBalance,
        }),
      },
      order: {
        create: vi.fn(),
      },
      vPSPlan: {
        upsert: vi.fn(),
        findFirst: vi.fn(),
      },
      vPSInstance: {
        create: vi.fn(),
      },
      payment: {
        create: vi.fn(),
      },
      walletTransaction: {
        create: vi.fn(),
      },
      provisioningJob: {
        update: vi.fn().mockResolvedValue({ id: 'job-123' }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          wallet: {
            updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
              const amount = data.balance.decrement;
              if (mockWalletBalance.lessThan(amount)) {
                return { count: 0 };
              }
              mockWalletBalance = mockWalletBalance.minus(amount);
              return { count: 1 };
            }),
            update: vi.fn().mockImplementation(async ({ data }) => {
              mockWalletBalance = mockWalletBalance.plus(data.balance.increment);
              return { balance: mockWalletBalance, currency: 'INR' };
            }),
          },
          walletTransaction: {
            create: vi.fn().mockResolvedValue({ id: 'wt-123' }),
          },
          vPSPlan: {
            upsert: vi.fn().mockResolvedValue({
              id: validValidatedConfig.serviceId,
              name: validValidatedConfig.serviceName,
              price: new Prisma.Decimal('805.86'),
            }),
          },
          order: {
            create: vi.fn().mockResolvedValue({
              id: 'order-hh-123',
              orderNumber: 'HH-12345678-ABCD',
              status: 'PROVISIONING',
              amount: new Prisma.Decimal('805.86'),
            }),
            update: vi.fn().mockResolvedValue({
              id: 'order-hh-123',
              orderNumber: 'HH-12345678-ABCD',
              status: 'ACTIVE',
              amount: new Prisma.Decimal('805.86'),
            }),
          },
          payment: {
            create: vi.fn().mockResolvedValue({
              id: 'pay-123',
              status: 'CAPTURED',
              amount: new Prisma.Decimal('805.86'),
            }),
            update: vi.fn().mockResolvedValue({ id: 'pay-123', status: 'REFUNDED' }),
          },
          provisioningJob: {
            create: vi.fn().mockResolvedValue({
              id: 'job-123',
              status: 'PROVISIONING',
              providerRequestId: null,
            }),
            update: vi.fn().mockResolvedValue({ id: 'job-123' }),
          },
          vPSInstance: {
            create: vi.fn().mockResolvedValue({
              id: 'vps-inst-123',
              status: 'ACTIVE',
              ipAddress: '103.45.67.89',
              provider: 'HOSTHEAVEN',
            }),
          },
        };
        return callback(tx);
      }),
    };

    mockInventoryAllocator = {};
    mockProvisioningService = {};
    mockAdminSettingsService = {
      getSettings: vi.fn().mockResolvedValue({ hostHeavenProfitMarginPercent: 20 }),
    };

    mockHostHeavenService = {
      createVm: vi.fn().mockResolvedValue({
        status: 'COMPLETED',
        orderId: 'hh-ord-999',
        vms: [
          {
            vmId: 'vm-upstream-123',
            ipAddress: '103.45.67.89',
            hostname: 'vps-hh-123.247hrservice.com',
          },
        ],
      }),
    };

    mockDirectCatalogueService = {
      validateConfiguration: vi.fn().mockResolvedValue(validValidatedConfig),
    };

    service = new CheckoutService(
      mockPrisma,
      mockInventoryAllocator,
      mockProvisioningService,
      mockAdminSettingsService,
      mockHostHeavenService,
      mockDirectCatalogueService,
    );
  });

  describe('Direct HostHeaven Checkout & Provisioning', () => {
    it('successfully provisions HostHeaven VM with 20% margin price and debits customer wallet', async () => {
      const result = await service.checkoutDirectHostHeaven('user-123', {
        zoneId: 'zone-delhi',
        zoneIsoId: 'iso-u22',
        planType: 'SHARED',
        cpuPriceId: 'cpu-1',
        ramPriceId: 'ram-1',
        diskPriceId: 'disk-1',
        bandwidthPriceId: 'bw-1',
        months: 1,
        operatingSystem: 'Ubuntu 22.04 LTS',
        paymentMethod: 'WALLET',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('HostHeaven VPS provisioned successfully');
      expect(result.status).toBe('ACTIVE');
      expect(result.order.status).toBe('ACTIVE');
      expect(result.vps.provider).toBe('HOSTHEAVEN');

      // Verifies provider call uses HostHeaven wallet balance
      expect(mockHostHeavenService.createVm).toHaveBeenCalledWith({
        zoneId: 'zone-delhi',
        zoneIsoId: 'iso-u22',
        planType: 'SHARED',
        cpuPriceId: 'cpu-1',
        ramPriceId: 'ram-1',
        diskPriceId: 'disk-1',
        bandwidthPriceId: 'bw-1',
        months: 1,
        quantity: 1,
        useWalletBalance: true,
      });
    });

    it('rejects checkout if customer wallet balance is insufficient', async () => {
      // Wallet has only ₹500, but ₹805.86 is required
      mockWalletBalance = new Prisma.Decimal('500.00');
      mockPrisma.wallet.upsert.mockResolvedValueOnce({
        id: 'wallet-123',
        userId: 'user-123',
        currency: 'INR',
        balance: mockWalletBalance,
      });

      await expect(
        service.checkoutDirectHostHeaven('user-123', {
          zoneId: 'zone-delhi',
          zoneIsoId: 'iso-u22',
          planType: 'SHARED',
          cpuPriceId: 'cpu-1',
          ramPriceId: 'ram-1',
          diskPriceId: 'disk-1',
          bandwidthPriceId: 'bw-1',
          months: 1,
          operatingSystem: 'Ubuntu 22.04 LTS',
        }),
      ).rejects.toThrow(/Insufficient wallet balance/);

      // Provider API should NOT be invoked if balance is insufficient
      expect(mockHostHeavenService.createVm).not.toHaveBeenCalled();
    });

    it('keeps the order pending when provider outcome is uncertain', async () => {
      mockHostHeavenService.createVm.mockRejectedValueOnce(
        new Error('Provider request timed out'),
      );

      const result = await service.checkoutDirectHostHeaven('user-123', {
        zoneId: 'zone-delhi',
        zoneIsoId: 'iso-u22',
        planType: 'SHARED',
        cpuPriceId: 'cpu-1',
        ramPriceId: 'ram-1',
        diskPriceId: 'disk-1',
        bandwidthPriceId: 'bw-1',
        months: 1,
        operatingSystem: 'Ubuntu 22.04 LTS',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('PROVISIONING');
      expect(result.message).toContain('No refund has been issued');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('refunds the wallet only when HostHeaven explicitly returns FAILED', async () => {
      mockHostHeavenService.createVm.mockResolvedValueOnce({
        status: 'FAILED',
        orderId: 'hh-failed-123',
        message: 'Provider rejected the request',
      });

      const result = await service.checkoutDirectHostHeaven('user-123', {
        zoneId: 'zone-delhi',
        zoneIsoId: 'iso-u22',
        planType: 'SHARED',
        cpuPriceId: 'cpu-1',
        ramPriceId: 'ram-1',
        diskPriceId: 'disk-1',
        bandwidthPriceId: 'bw-1',
        months: 1,
        operatingSystem: 'Ubuntu 22.04 LTS',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.message).toContain('wallet has been refunded');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
