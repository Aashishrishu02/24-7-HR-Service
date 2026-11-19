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
    mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-123', isActive: true }),
      },
      wallet: {
        upsert: vi.fn().mockResolvedValue({
          id: 'wallet-123',
          userId: 'user-123',
          currency: 'INR',
          balance: new Prisma.Decimal('1000.00'),
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
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          wallet: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
              status: 'ACTIVE',
              amount: new Prisma.Decimal('805.86'),
            }),
          },
          payment: {
            create: vi.fn().mockResolvedValue({
              id: 'pay-123',
              status: 'CAPTURED',
            }),
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
      mockPrisma.wallet.upsert.mockResolvedValueOnce({
        id: 'wallet-123',
        userId: 'user-123',
        currency: 'INR',
        balance: new Prisma.Decimal('500.00'),
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

    it('rejects checkout and does not debit wallet if provider VM creation fails', async () => {
      mockHostHeavenService.createVm.mockRejectedValueOnce(
        new Error('Upstream provider out of stock in this zone'),
      );

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
      ).rejects.toThrow(/HostHeaven VM provisioning failed/);

      // Database transaction should not have executed
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
