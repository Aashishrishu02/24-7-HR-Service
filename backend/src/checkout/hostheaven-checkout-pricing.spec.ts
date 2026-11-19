import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckoutService } from './checkout.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryAllocatorService } from '../provisioning/inventory-allocator.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import { Prisma } from '../generated/prisma/client.js';

describe('HostHeaven Checkout & Price Security', () => {
  let service: CheckoutService;
  let mockPrisma: any;
  let mockInventoryAllocator: any;
  let mockProvisioning: any;
  let mockSettings: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
      vPSPlan: {
        findFirst: vi.fn(),
      },
      order: {
        create: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      wallet: {
        upsert: vi.fn(),
        updateMany: vi.fn(),
      },
      payment: {
        create: vi.fn(),
      },
      walletTransaction: {
        create: vi.fn(),
      },
      providerInventory: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockInventoryAllocator = {
      reserveForOrder: vi.fn(),
    };

    mockProvisioning = {
      provisionOrder: vi.fn(),
    };

    mockSettings = {
      getSettings: vi.fn().mockResolvedValue({
        hostHeavenProfitMarginPercent: 20,
        hostHeavenMarkupPercent: 25,
      }),
    };

    service = new CheckoutService(
      mockPrisma as unknown as PrismaService,
      mockInventoryAllocator as unknown as InventoryAllocatorService,
      mockProvisioning as unknown as ProvisioningService,
      mockSettings as unknown as AdminSettingsService,
    );
  });

  describe('calculateServerSellingPrice — Consistent Monthly Pricing & Margin Safety', () => {
    it('verifies monthly provider price ₹644.69 produces server selling price ₹805.86', async () => {
      const plan = {
        price: new Prisma.Decimal('805.86'),
        hostHeavenMapping: {
          isActive: true,
          isCostVerified: true,
          providerCost: new Prisma.Decimal('644.69'),
        },
      };

      const serverPrice = await service.calculateServerSellingPrice(plan);
      expect(serverPrice.toNumber()).toBe(805.86);
    });

    it('verifies monthly provider price ₹1,000 produces server selling price ₹1,250', async () => {
      const plan = {
        price: new Prisma.Decimal('1250.00'),
        hostHeavenMapping: {
          isActive: true,
          isCostVerified: true,
          providerCost: new Prisma.Decimal('1000.00'),
        },
      };

      const serverPrice = await service.calculateServerSellingPrice(plan);
      expect(serverPrice.toNumber()).toBe(1250);
    });

    it('verifies ₹100 produces ₹125 and ₹500 produces ₹625', async () => {
      const p100 = await service.calculateServerSellingPrice({
        price: new Prisma.Decimal('125.00'),
        hostHeavenMapping: {
          isActive: true,
          isCostVerified: true,
          providerCost: new Prisma.Decimal('100.00'),
        },
      });
      const p500 = await service.calculateServerSellingPrice({
        price: new Prisma.Decimal('625.00'),
        hostHeavenMapping: {
          isActive: true,
          isCostVerified: true,
          providerCost: new Prisma.Decimal('500.00'),
        },
      });

      expect(p100.toNumber()).toBe(125);
      expect(p500.toNumber()).toBe(625);
    });

    it('ensures 20% margin is applied exactly once and never trusts frontend prices', async () => {
      // Plan stored in DB with providerCost ₹644.69
      const plan = {
        price: new Prisma.Decimal('805.86'),
        hostHeavenMapping: {
          isActive: true,
          isCostVerified: true,
          providerCost: new Prisma.Decimal('644.69'),
        },
      };

      const serverPrice = await service.calculateServerSellingPrice(plan);
      // Double margin would yield ₹1,007.33 (WRONG). Exactly once yields ₹805.86!
      expect(serverPrice.toNumber()).toBe(805.86);
      expect(serverPrice.toNumber()).not.toBe(1007.33);
    });

    it('returns standard plan price when plan has no HostHeaven mapping', async () => {
      const plan = {
        price: new Prisma.Decimal('499.00'),
        hostHeavenMapping: null,
      };

      const serverPrice = await service.calculateServerSellingPrice(plan);
      expect(serverPrice.toNumber()).toBe(499);
    });
  });

  describe('createOrder', () => {
    it('rejects HostHeaven checkout order creation while live provisioning is disabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', isActive: true });

      mockPrisma.vPSPlan.findFirst.mockResolvedValue({
        id: 'plan-hh-1',
        name: 'HostHeaven Pro 4GB',
        price: new Prisma.Decimal('1250.00'),
        currency: 'INR',
        supportedOS: ['Ubuntu 22.04 LTS'],
        isActive: true,
        hostHeavenMapping: {
          id: 'map-1',
          planId: 'plan-hh-1',
          providerCost: new Prisma.Decimal('1000.00'),
          isActive: true,
        },
      });

      await expect(
        service.createOrder('u-1', 'plan-hh-1', 'Ubuntu 22.04 LTS'),
      ).rejects.toThrow(
        'Automated HostHeaven VPS checkout is currently disabled pending live provisioning verification',
      );
    });

    it('rejects order creation if HostHeaven mapping is inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', isActive: true });

      mockPrisma.vPSPlan.findFirst.mockResolvedValue({
        id: 'plan-hh-inactive',
        name: 'HostHeaven Offline Plan',
        price: new Prisma.Decimal('1250.00'),
        currency: 'INR',
        supportedOS: ['Ubuntu 22.04 LTS'],
        isActive: true,
        hostHeavenMapping: {
          id: 'map-inactive',
          planId: 'plan-hh-inactive',
          providerCost: new Prisma.Decimal('1000.00'),
          isActive: false, // Mapping deactivated
        },
      });

      await expect(
        service.createOrder('u-1', 'plan-hh-inactive', 'Ubuntu 22.04 LTS'),
      ).rejects.toThrow('HostHeaven mapping for this VPS plan is currently inactive');
    });
  });

  describe('payWithWallet — Provisioning Safety', () => {
    it('CRITICAL BUG FIX: rejects HostHeaven-mapped payment BEFORE generic inventory lookup, wallet debit, or status updates', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-hh-safe',
        userId: 'u-1',
        orderNumber: 'IC-TEST-001',
        amount: new Prisma.Decimal('1250.00'),
        currency: 'INR',
        status: 'PENDING',
        operatingSystem: 'Ubuntu 22.04 LTS',
        plan: {
          id: 'plan-hh-1',
          name: 'HostHeaven Pro',
          currency: 'INR',
          isActive: true,
          cpuCores: 2,
          ramGb: 4,
          storageGb: 50,
          supportedOS: ['Ubuntu 22.04 LTS'],
          hostHeavenMapping: {
            id: 'map-1',
            isActive: true,
          },
        },
      });

      // Generic inventory exists in DB, but must NEVER be touched for HostHeaven!
      mockPrisma.providerInventory.findFirst.mockResolvedValue({
        id: 'inv-generic-1',
        status: 'AVAILABLE',
      });

      await expect(service.payWithWallet('u-1', 'order-hh-safe')).rejects.toThrow(
        /HostHeaven plans cannot be provisioned from generic inventory/,
      );

      // Verify that generic inventory lookup was NOT performed
      expect(mockPrisma.providerInventory.findFirst).not.toHaveBeenCalled();
      // Verify that wallet balance was NOT debited
      expect(mockPrisma.wallet.updateMany).not.toHaveBeenCalled();
      // Verify that order was NOT marked as PAID
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
      // Verify that provisioning was NOT triggered
      expect(mockProvisioning.provisionOrder).not.toHaveBeenCalled();
    });

    it('changing admin profit margin affects new orders only and never alters existing Order.amount', async () => {
      // 1. Existing order created previously at locked historical amount (₹1,250)
      const existingOrderId = 'order-historical-1250';
      mockPrisma.order.findFirst.mockResolvedValue({
        id: existingOrderId,
        userId: 'u-1',
        orderNumber: 'IC-HISTORICAL-001',
        amount: new Prisma.Decimal('1250.00'), // Locked historical price
        currency: 'INR',
        status: 'PENDING',
        operatingSystem: 'Ubuntu 22.04 LTS',
        plan: {
          id: 'plan-std-1',
          name: 'Standard Cloud VPS',
          price: new Prisma.Decimal('1250.00'),
          currency: 'INR',
          isActive: true,
          cpuCores: 2,
          ramGb: 4,
          storageGb: 50,
          supportedOS: ['Ubuntu 22.04 LTS'],
          hostHeavenMapping: null,
        },
      });

      // Admin has changed the margin setting to 50%
      mockSettings.getSettings.mockResolvedValue({
        hostHeavenProfitMarginPercent: 50,
      });

      mockPrisma.providerInventory.findFirst.mockResolvedValue({
        id: 'inv-1',
        providerId: 'prov-1',
        status: 'AVAILABLE',
      });
      mockPrisma.wallet.upsert.mockResolvedValue({
        userId: 'u-1',
        balance: new Prisma.Decimal('5000.00'),
        currency: 'INR',
      });
      mockPrisma.wallet.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-1' });
      mockInventoryAllocator.reserveForOrder.mockResolvedValue({ id: 'inv-1' });
      mockProvisioning.provisionOrder.mockResolvedValue({ id: 'vps-1' });

      await service.payWithWallet('u-1', existingOrderId);

      // Verify payment was debited for exactly the historical locked amount (₹1,250), NOT recalculated
      expect(mockPrisma.wallet.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            balance: {
              decrement: new Prisma.Decimal('1250.00'),
            },
          },
        }),
      );

      // 2. Now create a new standard order
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', isActive: true });
      mockPrisma.vPSPlan.findFirst.mockResolvedValue({
        id: 'plan-std-2',
        name: 'Standard Linux VPS 2',
        price: new Prisma.Decimal('1999.00'),
        currency: 'INR',
        supportedOS: ['Ubuntu 22.04 LTS'],
        isActive: true,
        hostHeavenMapping: null,
      });
      mockPrisma.order.create.mockImplementation((args: any) => ({
        id: 'order-new-1999',
        ...args.data,
      }));

      const newOrderResult = await service.createOrder('u-1', 'plan-std-2', 'Ubuntu 22.04 LTS');
      expect(Number(newOrderResult.order.amount)).toBe(1999);
    });

    it('non-HostHeaven plans and existing inventory checkout remain completely unaffected', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', isActive: true });

      mockPrisma.vPSPlan.findFirst.mockResolvedValue({
        id: 'plan-standard-1',
        name: 'Standard Linux VPS',
        price: new Prisma.Decimal('499.00'),
        currency: 'INR',
        supportedOS: ['Debian 12'],
        isActive: true,
        hostHeavenMapping: null, // Non-HostHeaven plan
      });

      mockPrisma.order.create.mockImplementation((args: any) => ({
        id: 'order-std-1',
        ...args.data,
      }));

      const orderResult = await service.createOrder('u-1', 'plan-standard-1', 'Debian 12');
      // Price is untouched
      expect(Number(orderResult.order.amount)).toBe(499);

      // Now pay for standard plan
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-std-1',
        userId: 'u-1',
        orderNumber: 'IC-STD-001',
        amount: new Prisma.Decimal('499.00'),
        currency: 'INR',
        status: 'PENDING',
        operatingSystem: 'Debian 12',
        plan: {
          id: 'plan-standard-1',
          name: 'Standard Linux VPS',
          price: new Prisma.Decimal('499.00'),
          currency: 'INR',
          isActive: true,
          cpuCores: 1,
          ramGb: 1,
          storageGb: 20,
          supportedOS: ['Debian 12'],
          hostHeavenMapping: null,
        },
      });

      mockPrisma.providerInventory.findFirst.mockResolvedValue({
        id: 'inv-std-1',
        status: 'AVAILABLE',
      });
      mockPrisma.wallet.upsert.mockResolvedValue({
        userId: 'u-1',
        balance: new Prisma.Decimal('1000.00'),
        currency: 'INR',
      });
      mockPrisma.wallet.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-std-1' });
      mockInventoryAllocator.reserveForOrder.mockResolvedValue({ id: 'inv-std-1' });
      mockProvisioning.provisionOrder.mockResolvedValue({ id: 'vps-std-1' });

      const payResult = await service.payWithWallet('u-1', 'order-std-1');

      expect(payResult.message).toContain('Payment successful');
      expect(payResult.payment.status).toBe('CAPTURED');
      expect(mockPrisma.wallet.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            balance: {
              decrement: new Prisma.Decimal('499.00'),
            },
          },
        }),
      );
      expect(mockProvisioning.provisionOrder).toHaveBeenCalledWith('order-std-1');
    });
  });
});
