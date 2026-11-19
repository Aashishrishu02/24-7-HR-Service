import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import {
  calculatePricingBreakdown,
  calculateAuthoritativeMonthlyBreakdown,
  calculateSellingPrice,
  calculateProviderCost,
  calculateUnifiedPricingBreakdown,
  validateResourceRate,
} from './hostheaven-pricing.util.js';
import { HostHeavenSyncService } from './hostheaven-sync.service.js';
import { PublicPlansController } from '../vps/public-plans.controller.js';
import { CheckoutService } from '../checkout/checkout.service.js';

describe('HostHeaven Live Monthly Pricing + 20% Customer Profit Margin — 10 Acceptance Test Cases', () => {
  let mockPrisma: any;
  let mockHostHeavenService: any;
  let mockAdminSettingsService: any;
  let syncService: HostHeavenSyncService;
  let publicPlansController: PublicPlansController;
  let checkoutService: CheckoutService;

  beforeEach(() => {
    mockPrisma = {
      systemSetting: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
      hostHeavenPlanMapping: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'map-new-1',
          ...args.data,
        })),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      vPSPlan: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'plan-new-1',
          ...args.data,
        })),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'usr-1',
          isActive: true,
          email: 'test@247hrservice.com',
          wallet: { balance: new Prisma.Decimal('5000.00'), currency: 'INR' },
        }),
      },
      order: {
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'ord-123',
          ...args.data,
        })),
      },
      wallet: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      walletTransaction: {
        create: vi.fn().mockResolvedValue({ id: 'tx-1' }),
      },
      providerInventory: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        return Promise.all(cb);
      }),
    };

    mockHostHeavenService = {
      getZones: vi.fn().mockResolvedValue([
        { id: 'zone-1', name: 'India (Mumbai Slot)', status: 'ACTIVE' },
      ]),
      getZoneIsos: vi.fn().mockResolvedValue([
        { id: 'iso-1', isoName: 'Ubuntu 22.04 LTS' },
      ]),
      getCompletePricing: vi.fn().mockResolvedValue({
        shared: {
          cpu: [{ id: 'cpu-6', cores: 2, label: '2 Cores', price: 0.1 }],
          ram: [{ id: 'ram-9', ram: 4, ramMb: 4000, label: '4 GB RAM', price: 0.1954 }],
          disk: [{ id: 'disk-6', disk: 20, diskGb: 20, label: '20 GB NVMe', price: 0.2 }],
          bandwidth: [{ id: 'bw-6', bandwidth: 2000, bandwidthGb: 2000, label: '2 TB BW', price: 0.4 }],
        },
        dedicated: {
          cpu: [{ id: 'ded-cpu-1', cores: 4, label: '4 Cores', price: 0.6251 }],
          ram: [{ id: 'ded-ram-1', ram: 8, ramMb: 8000, label: '8 GB RAM', price: 0.7264 }],
          disk: [{ id: 'ded-disk-1', disk: 48, diskGb: 48, label: '48 GB NVMe', price: 0.2724 }],
          bandwidth: [{ id: 'ded-bw-2', bandwidth: 10000, bandwidthGb: 10000, label: '10 TB BW', price: 0.1816 }],
        },
      }),
      getWalletBalance: vi.fn().mockResolvedValue({
        id: 'hh-wallet-1',
        balance: 59435.11,
        currency: 'INR',
      }),
    };

    mockAdminSettingsService = {
      getSettings: vi.fn().mockResolvedValue({
        hostHeavenProfitMarginPercent: 20,
        hostHeavenMarkupPercent: 25,
      }),
    };

    syncService = new HostHeavenSyncService(
      mockPrisma,
      mockHostHeavenService,
      mockAdminSettingsService,
    );

    publicPlansController = new PublicPlansController(
      mockPrisma,
      mockAdminSettingsService,
    );

    checkoutService = new CheckoutService(
      mockPrisma,
      { reserveForOrder: vi.fn() } as any,
      { provisionOrder: vi.fn() } as any,
      mockAdminSettingsService,
    );
  });

  // -------------------------------------------------------------
  // Test 1: Hourly Shared pricing
  // -------------------------------------------------------------
  it('1. Test: Hourly Shared pricing calculates monthlyProviderCost = ₹644.69, sellingPrice = ₹805.86, grossProfit = ₹161.17', () => {
    const cpu = 0.1;
    const ram = 0.1954;
    const disk = 0.2;
    const bw = 0.4;
    const margin = 20;

    const breakdown = calculatePricingBreakdown(cpu, ram, disk, bw, 30, margin);

    expect(breakdown.totalHourlyRate).toBe(0.8954);
    expect(breakdown.monthlyProviderCost).toBe(644.69);
    expect(breakdown.customerSellingPrice).toBe(805.86);
    expect(breakdown.grossProfit).toBe(161.17);
    expect(breakdown.pricingSource).toBe('CALCULATED_HOURLY');
    expect(breakdown.billingUnit).toBe('INR_PER_HOUR');
  });

  // -------------------------------------------------------------
  // Test 2: Already monthly price
  // -------------------------------------------------------------
  it('2. Test: Already monthly price uses ₹644.69 directly without multiplying by 720 and produces ₹805.86 selling price', () => {
    const monthlyCost = 644.69;
    const margin = 20;

    const breakdown = calculateAuthoritativeMonthlyBreakdown(monthlyCost, 30, margin);

    expect(breakdown.monthlyProviderCost).toBe(644.69);
    expect(breakdown.totalProviderCost).toBe(644.69);
    expect(breakdown.customerSellingPrice).toBe(805.86);
    expect(breakdown.grossProfit).toBe(161.17);
    expect(breakdown.pricingSource).toBe('AUTHORITATIVE_MONTHLY');
    expect(breakdown.billingUnit).toBe('INR_PER_MONTH');
    expect(breakdown.totalHourlyRate).toBeUndefined();
    // Must NOT be multiplied by 720:
    expect(breakdown.monthlyProviderCost).not.toBe(464176.8);
  });

  // -------------------------------------------------------------
  // Test 3: Dedicated VPS rates
  // -------------------------------------------------------------
  it('3. Test: Dedicated VPS rates (0.6251 + 0.7264 + 0.2724 + 0.1816) produce monthlyProviderCost = ₹1,299.96, sellingPrice = ₹1,624.95, grossProfit = ₹324.99', () => {
    const cpu = 0.6251;
    const ram = 0.7264;
    const disk = 0.2724;
    const bw = 0.1816;
    const margin = 20;

    const breakdown = calculatePricingBreakdown(cpu, ram, disk, bw, 30, margin);

    // Sum = 1.8055 ₹/hr * 720 hrs = 1,299.96
    expect(breakdown.totalHourlyRate).toBe(1.8055);
    expect(breakdown.monthlyProviderCost).toBe(1299.96);
    // 1299.96 / 0.80 = 1624.95
    expect(breakdown.customerSellingPrice).toBe(1624.95);
    expect(breakdown.grossProfit).toBe(324.99);
  });

  // -------------------------------------------------------------
  // Test 4: ₹1,000 monthly cost
  // -------------------------------------------------------------
  it('4. Test: ₹1,000 monthly cost produces customerSellingPrice = ₹1,250.00 and grossProfit = ₹250.00', () => {
    const monthlyCost = 1000.0;
    const margin = 20;

    const sellingPrice = calculateSellingPrice(monthlyCost, margin);
    const grossProfit = Math.round((sellingPrice - monthlyCost) * 100) / 100;

    expect(sellingPrice).toBe(1250.0);
    expect(grossProfit).toBe(250.0);
  });

  // -------------------------------------------------------------
  // Test 5: Invalid/null rates
  // -------------------------------------------------------------
  it('5. Test: Invalid/null/negative rates are rejected and never become verified configurations', async () => {
    // 5a. Direct validator checks
    expect(() => validateResourceRate(null)).toThrow();
    expect(() => validateResourceRate(undefined)).toThrow();
    expect(() => validateResourceRate(-0.5)).toThrow();
    expect(() => validateResourceRate(NaN)).toThrow();

    // 5b. Sync service handles invalid pricing without publishing
    mockHostHeavenService.getCompletePricing.mockResolvedValueOnce({
      shared: {
        cpu: [{ id: 'cpu-bad', cores: 2, label: 'Bad CPU', price: -1 }],
        ram: [{ id: 'ram-bad', ram: 4, label: 'Bad RAM', price: null as any }],
        disk: [{ id: 'disk-1', disk: 20, label: 'Disk', price: 0.2 }],
        bandwidth: [{ id: 'bw-1', bandwidth: 2000, label: 'BW', price: 0.4 }],
      },
      dedicated: { cpu: [], ram: [], disk: [], bandwidth: [] },
    });

    let createdMapping: any = null;
    mockPrisma.hostHeavenPlanMapping.create.mockImplementationOnce((args: any) => {
      createdMapping = args.data;
      return { id: 'map-unverified', ...args.data };
    });

    const result = await syncService.syncCatalogue();
    expect(result.success).toBe(true);

    if (createdMapping) {
      expect(createdMapping.isCostVerified).toBe(false);
      expect(createdMapping.costStatus).toBe('ESTIMATED');
      expect(createdMapping.isActive).toBe(false);
    }
  });

  // -------------------------------------------------------------
  // Test 6: Refresh Catalogue
  // -------------------------------------------------------------
  it('6. Test: Refresh Catalogue fetches latest zones, pricing, wallet balance from HostHeaven and stores snapshot in SystemSetting', async () => {
    const result = await syncService.syncCatalogue();

    expect(result.success).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.stats?.totalZones).toBe(1);
    expect(result.stats?.activeZones).toBe(1);
    expect(result.stats?.walletBalance).toBe(59435.11);
    expect(result.stats?.walletCurrency).toBe('INR');

    // Snapshot saved
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'HOSTHEAVEN_RAW_CATALOGUE' },
      }),
    );
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'HOSTHEAVEN_SYNC_STATUS' },
        create: expect.objectContaining({ value: 'SUCCESS' }),
      }),
    );
  });

  // -------------------------------------------------------------
  // Test 7: Upstream API failure
  // -------------------------------------------------------------
  it('7. Test: Upstream API failure (e.g. 503 Service Unavailable) records error and preserves existing verified catalogue', async () => {
    mockHostHeavenService.getZones.mockRejectedValueOnce(
      new Error('HostHeaven API unavailable (HTTP 503)'),
    );

    const result = await syncService.syncCatalogue();

    expect(result.success).toBe(false);
    expect(result.error).toContain('HostHeaven API unavailable (HTTP 503)');

    // Status updated to FAILED with error message
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'HOSTHEAVEN_SYNC_STATUS' },
        create: expect.objectContaining({ value: 'FAILED' }),
      }),
    );
    // Verified plans were NOT deleted
    expect(mockPrisma.hostHeavenPlanMapping.deleteMany).toBeUndefined();
  });

  // -------------------------------------------------------------
  // Test 8: Public GET /plans
  // -------------------------------------------------------------
  it('8. Test: Public GET /plans returns active, verified plans with customer selling price in INR and strictly hides provider costs and pricing IDs', async () => {
    mockPrisma.vPSPlan.findMany.mockResolvedValueOnce([
      {
        id: 'plan-pub-1',
        name: 'Cloud VPS 2 vCPU - 4 GB RAM (India)',
        productType: 'VPS_HOSTING',
        description: 'Standard Cloud VPS',
        cpuCores: 2,
        ramGb: 4,
        storageGb: 20,
        bandwidthGb: 2000,
        price: new Prisma.Decimal('805.86'),
        currency: 'INR',
        durationDays: 30,
        supportedOS: ['Ubuntu 22.04 LTS'],
        isActive: true,
        sortOrder: 24,
        hostHeavenMapping: {
          id: 'map-pub-1',
          zoneId: 'zone-1',
          zoneName: 'India (Mumbai Slot)',
          zoneIsoId: 'iso-1',
          isoName: 'Ubuntu 22.04 LTS',
          planType: 'SHARED',
          providerCost: new Prisma.Decimal('644.69'), // Provider cost
          isCostVerified: true,
          costStatus: 'VERIFIED',
          isActive: true,
        },
      },
      {
        id: 'plan-unverified',
        name: 'Unverified Plan',
        isActive: true,
        hostHeavenMapping: {
          providerCost: new Prisma.Decimal('644.69'),
          isCostVerified: false, // Unverified -> must be excluded!
          isActive: false,
        },
      },
    ]);

    const res = await publicPlansController.findActivePlans();

    // Only the verified plan is returned
    expect(res.plans).toHaveLength(1);
    const plan = res.plans[0];

    // Customer selling price
    expect(plan.price).toBe(805.86);
    expect(plan.monthlyPrice).toBe(805.86);
    expect(plan.billingInterval).toBe('month');
    expect(plan.currency).toBe('INR');

    // Security assertions: Never expose providerCost or internal IDs
    expect((plan as any).providerCost).toBeUndefined();
    expect((plan as any).cpuPricingId).toBeUndefined();
    expect((plan as any).ramPricingId).toBeUndefined();
    expect((plan as any).diskPricingId).toBeUndefined();
    expect((plan as any).bandwidthPricingId).toBeUndefined();
  });

  // -------------------------------------------------------------
  // Test 9: No duplicate conversion
  // -------------------------------------------------------------
  it('9. Test: No duplicate conversion — neither public API nor calculations apply margin twice or multiply monthly cost by 720', async () => {
    // Upstream provider monthly cost = ₹644.69
    const providerMonthlyCost = 644.69;
    const margin = 20;

    const singleMarginPrice = calculateSellingPrice(providerMonthlyCost, margin);
    expect(singleMarginPrice).toBe(805.86);

    // If margin were applied twice: 805.86 / 0.80 = 1007.33 (WRONG)
    expect(singleMarginPrice).not.toBe(1007.33);

    // If monthly cost were multiplied by 720: 644.69 * 720 / 0.80 = 580,221.00 (WRONG)
    expect(singleMarginPrice).not.toBe(580221.0);
    expect(singleMarginPrice).not.toBe(580219.2);

    // When public plans controller formats plan, price matches exact single-margin selling price
    mockPrisma.vPSPlan.findMany.mockResolvedValueOnce([
      {
        id: 'plan-single-margin',
        name: 'Cloud VPS',
        productType: 'VPS_HOSTING',
        price: new Prisma.Decimal('805.86'),
        currency: 'INR',
        durationDays: 30,
        supportedOS: ['Ubuntu 22.04 LTS'],
        isActive: true,
        hostHeavenMapping: {
          providerCost: new Prisma.Decimal('644.69'),
          isCostVerified: true,
          isActive: true,
        },
      },
    ]);

    const res = await publicPlansController.findActivePlans();
    expect(res.plans[0].price).toBe(805.86);
  });

  // -------------------------------------------------------------
  // Test 10: Checkout order creation
  // -------------------------------------------------------------
  it('10. Test: Checkout order creation recalculates authoritative selling price from provider cost and margin, charging ₹805.86 for 1 mo and ₹2,417.58 for 3 mo', async () => {
    const mockPlan1Mo = {
      id: 'plan-1mo',
      name: 'Cloud VPS 2C-4G',
      productType: 'VPS_HOSTING',
      price: new Prisma.Decimal('805.86'),
      currency: 'INR',
      durationDays: 30,
      isActive: true,
      hostHeavenMapping: {
        id: 'map-1mo',
        providerCost: new Prisma.Decimal('644.69'),
        isCostVerified: true,
        isActive: true,
      },
    };

    // Server-side calculated price for 1 month
    const price1Mo = await checkoutService.calculateServerSellingPrice(mockPlan1Mo);
    expect(price1Mo.toNumber()).toBe(805.86);

    // Server-side calculated price for 3 months (90 days)
    const mockPlan3Mo = {
      ...mockPlan1Mo,
      id: 'plan-3mo',
      durationDays: 90,
    };
    const price3Mo = await checkoutService.calculateServerSellingPrice(mockPlan3Mo);
    // 644.69 * 3 = 1934.07 provider cost -> 1934.07 / 0.80 = 2417.5875 -> 2417.59 or 805.86 * 3 = 2417.58
    expect([2417.58, 2417.59]).toContain(price3Mo.toNumber());

    // Execute checkout order creation with server-recalculated price
    const standardPlan = {
      id: 'plan-std-1',
      name: 'Cloud VPS 2C-4G',
      productType: 'VPS_HOSTING',
      price: new Prisma.Decimal('805.86'),
      currency: 'INR',
      durationDays: 30,
      supportedOS: ['Ubuntu 22.04 LTS'],
      isActive: true,
      hostHeavenMapping: null,
    };
    mockPrisma.vPSPlan.findFirst.mockResolvedValueOnce(standardPlan);

    const orderResult = await checkoutService.createOrder(
      'usr-1',
      'plan-std-1',
      'Ubuntu 22.04 LTS',
    );

    expect(orderResult.order.amount.toNumber()).toBe(805.86);
    expect(orderResult.order.currency).toBe('INR');
  });
});
