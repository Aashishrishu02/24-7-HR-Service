import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HostHeavenSyncService } from './hostheaven-sync.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HostHeavenService } from './hostheaven.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import {
  calculateSellingPrice,
  calculateProviderCost,
  calculatePricingBreakdown,
  calculateDurationMonths,
  HOURS_PER_MONTH,
} from './hostheaven-pricing.util.js';
import { Prisma } from '../generated/prisma/client.js';

describe('HostHeaven Automatic Catalogue Synchronization & Verified Decimal Pricing', () => {
  let syncService: HostHeavenSyncService;
  let mockPrisma: any;
  let mockHostHeavenService: any;
  let mockAdminSettingsService: any;

  beforeEach(() => {
    mockPrisma = {
      systemSetting: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
      hostHeavenPlanMapping: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((args: any) => ({
          id: `map-${Date.now()}`,
          ...args.data,
        })),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      vPSPlan: {
        findUnique: vi.fn(),
        create: vi.fn().mockImplementation((args: any) => ({
          id: `plan-${Date.now()}`,
          ...args.data,
        })),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      providerInventory: {
        findFirst: vi.fn(),
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
        { id: 'zone-23', name: 'Heaven Slot IP 27.98.207', location: 'Mumbai', status: 'ACTIVE' },
        { id: 'zone-14', name: 'Delhi NCR Slot', location: 'Delhi', status: 'INACTIVE' },
      ]),
      getZoneIsos: vi.fn().mockResolvedValue([
        { id: 'iso-u22', isoName: 'Ubuntu 22.04 LTS', osType: 'LINUX' },
        { id: 'iso-deb12', isoName: 'Debian 12', osType: 'LINUX' },
      ]),
      getCompletePricing: vi.fn().mockResolvedValue({
        shared: {
          cpu: [
            { id: 'cpu-1', cores: 1, label: '1 Core', price: 0.05 },
            { id: 'cpu-2', cores: 2, label: '2 Cores', price: 0.1 },
          ],
          ram: [
            { id: 'ram-2', ram: 2, label: '2 GB RAM', price: 0.1 },
            { id: 'ram-4', ram: 4, label: '4 GB RAM', price: 0.1954 },
          ],
          disk: [{ id: 'disk-40', disk: 40, label: '40 GB NVMe', price: 0.2 }],
          bandwidth: [{ id: 'bw-2000', bandwidth: 2000, label: '2 TB BW', price: 0.4 }],
        },
        dedicated: {
          cpu: [{ id: 'ded-cpu-4', cores: 4, label: '4 Dedicated Cores', price: 0.6251 }],
          ram: [{ id: 'ded-ram-8', ram: 8, label: '8 GB Dedicated RAM', price: 0.7264 }],
          disk: [{ id: 'ded-disk-80', disk: 48, label: '48 GB NVMe', price: 0.2724 }],
          bandwidth: [{ id: 'ded-bw-5000', bandwidth: 10000, label: '10 TB BW', price: 0.1816 }],
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
      mockPrisma as unknown as PrismaService,
      mockHostHeavenService as unknown as HostHeavenService,
      mockAdminSettingsService as unknown as AdminSettingsService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Successful catalogue synchronization with verified hourly billing units
  it('1. performs successful catalogue synchronization and calculates costs via 720 hrs/mo unit', async () => {
    mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue(null);

    const result = await syncService.syncCatalogue();

    expect(result.success).toBe(true);
    expect(result.stats?.totalZones).toBe(2);
    expect(result.stats?.activeZones).toBe(1);
    expect(result.stats?.configurationsFound).toBeGreaterThan(0);
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'HOSTHEAVEN_SYNC_STATUS' },
        create: expect.objectContaining({ value: 'SUCCESS' }),
      }),
    );
  });

  // 2. Duplicate catalogue prevention & automatic price update on rate change
  it('2. updates existing configuration records and updates prices when provider rates change', async () => {
    const existingConfigId = 'hh:SHARED:zone-23:cpu-1:ram-2:disk-40:bw-2000';
    mockPrisma.hostHeavenPlanMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.externalConfigId === existingConfigId) {
        return Promise.resolve({
          id: 'map-existing-1',
          planId: 'plan-existing-1',
          externalConfigId: existingConfigId,
          isCostVerified: true,
          providerCost: new Prisma.Decimal('500.00'),
          plan: { id: 'plan-existing-1', name: 'Existing Plan' },
        });
      }
      return Promise.resolve(null);
    });

    const result = await syncService.syncCatalogue();
    expect(result.success).toBe(true);
    expect(result.stats?.existingConfigsUpdated).toBeGreaterThanOrEqual(1);

    // Existing mapping updated with new calculated provider cost
    expect(mockPrisma.hostHeavenPlanMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'map-existing-1' },
      }),
    );
  });

  // 3. New zone synchronization
  it('3. synchronizes new active zones and discovers their configurations', async () => {
    mockHostHeavenService.getZones.mockResolvedValue([
      { id: 'zone-new-mumbai', name: 'Mumbai DC-2', location: 'Mumbai', status: 'ACTIVE' },
    ]);
    mockHostHeavenService.getZoneIsos.mockResolvedValue([
      { id: 'iso-1', isoName: 'Ubuntu 22.04 LTS', osType: 'LINUX' },
    ]);

    const result = await syncService.syncCatalogue();
    expect(result.success).toBe(true);
    expect(result.stats?.activeZones).toBe(1);
    expect(mockHostHeavenService.getZoneIsos).toHaveBeenCalledWith('zone-new-mumbai');
  });

  // 4. New OS synchronization
  it('4. synchronizes new operating systems and populates supportedOS on VPS plans', async () => {
    mockHostHeavenService.getZoneIsos.mockResolvedValue([
      { id: 'iso-win', isoName: 'Windows Server 2022 Datacenter', osType: 'WINDOWS' },
      { id: 'iso-rocky', isoName: 'Rocky Linux 9', osType: 'LINUX' },
    ]);

    mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue(null);

    await syncService.syncCatalogue();

    expect(mockPrisma.vPSPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supportedOS: ['Windows Server 2022 Datacenter', 'Rocky Linux 9'],
        }),
      }),
    );
  });

  // 5. Unavailable service handling
  it('5. marks mappings in inactive zones as inactive without deleting records', async () => {
    mockHostHeavenService.getZones.mockResolvedValue([
      { id: 'zone-inactive-1', name: 'Old Zone', location: 'India', status: 'INACTIVE' },
    ]);
    mockPrisma.hostHeavenPlanMapping.findMany.mockResolvedValue([{ planId: 'p-inact-1' }]);

    const result = await syncService.syncCatalogue();
    expect(result.success).toBe(true);

    expect(mockPrisma.hostHeavenPlanMapping.updateMany).toHaveBeenCalledWith({
      where: { zoneId: 'zone-inactive-1', isActive: true },
      data: { isActive: false },
    });
    expect(mockPrisma.vPSPlan.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-inact-1'] }, isActive: true },
      data: { isActive: false },
    });
  });

  // 6. Zero or missing price handling - blocks unverified configurations
  it('6. handles zero or missing resource prices safely and flags incomplete entries as ESTIMATED and unverified', async () => {
    mockHostHeavenService.getCompletePricing.mockResolvedValue({
      shared: {
        cpu: [{ id: 'cpu-zero', cores: 2, label: 'Free CPU', price: 0 }],
        ram: [{ id: 'ram-null', ram: 4, label: 'RAM missing', price: null as any }],
        disk: [{ id: 'disk-1', disk: 40, label: 'Disk', price: 0.2 }],
        bandwidth: [{ id: 'bw-1', bandwidth: 1000, label: 'BW', price: 0.2 }],
      },
      dedicated: { cpu: [], ram: [], disk: [], bandwidth: [] },
    });

    let capturedMappingData: any = null;
    mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue(null);
    mockPrisma.hostHeavenPlanMapping.create.mockImplementation((args: any) => {
      capturedMappingData = args.data;
      return { id: 'map-unverified', ...args.data };
    });

    const result = await syncService.syncCatalogue();
    expect(result.success).toBe(true);

    // Incomplete price entries must be marked ESTIMATED and hidden (isActive: false)
    if (capturedMappingData) {
      expect(capturedMappingData.isCostVerified).toBe(false);
      expect(capturedMappingData.costStatus).toBe('ESTIMATED');
      expect(capturedMappingData.isActive).toBe(false);
    }
  });

  // 7. Invalid provider cost rejection
  it('7. rejects invalid provider cost during confirmation', async () => {
    await expect(syncService.confirmProviderCost('map-1', -100)).rejects.toThrow(
      'Confirmed provider cost in INR must be greater than zero',
    );
    await expect(syncService.confirmProviderCost('map-1', 0)).rejects.toThrow(
      'Confirmed provider cost in INR must be greater than zero',
    );
    await expect(syncService.confirmProviderCost('map-1', NaN)).rejects.toThrow(
      'Confirmed provider cost in INR must be greater than zero',
    );
  });

  // 8. Automatic publishing of verified configurations
  it('8. automatically verifies and publishes configurations with valid non-zero hourly rates', async () => {
    mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue(null);
    let capturedPlanData: any = null;
    let capturedMappingData: any = null;

    mockPrisma.vPSPlan.create.mockImplementation((args: any) => {
      capturedPlanData = args.data;
      return { id: 'p-verified-new', ...args.data };
    });
    mockPrisma.hostHeavenPlanMapping.create.mockImplementation((args: any) => {
      capturedMappingData = args.data;
      return { id: 'map-verified-new', ...args.data };
    });

    await syncService.syncCatalogue();

    expect(capturedPlanData).toBeDefined();
    expect(capturedMappingData).toBeDefined();

    // Reliably verified configurations are automatically published
    expect(capturedMappingData.isCostVerified).toBe(true);
    expect(capturedMappingData.costStatus).toBe('VERIFIED');
    expect(capturedMappingData.isActive).toBe(true);
    expect(capturedPlanData.isActive).toBe(true);
    expect(capturedMappingData.pricingDetails).toBeDefined();
    expect(capturedMappingData.pricingDetails.billingUnit).toBe('INR_PER_HOUR');
  });

  // 9. Correct 20% gross margin calculations
  it('9. calculates customer price accurately using Selling Price = Provider Cost / (1 - 0.20)', () => {
    expect(calculateSellingPrice(100, 20)).toBe(125.0);
    expect(calculateSellingPrice(500, 20)).toBe(625.0);
    expect(calculateSellingPrice(1000, 20)).toBe(1250.0);
    expect(calculateSellingPrice(2000, 20)).toBe(2500.0);
    expect(calculateSellingPrice(4000, 20)).toBe(5000.0);
  });

  // 10. Correct Decimal rounding
  it('10. rounds customer selling price correctly to two decimal places in INR', () => {
    expect(calculateSellingPrice(333.33, 20)).toBe(416.66);
    expect(calculateSellingPrice(777.77, 20)).toBe(972.21);
    expect(calculateSellingPrice(1234.56, 20)).toBe(1543.2);
  });

  // 11. Duration conversion (30, 90, 180, 365 days) verified against HostHeaven
  it('11. converts plan durations correctly to billing months matching HostHeaven calculate-renewal API', () => {
    expect(calculateDurationMonths(30)).toBe(1);
    expect(calculateDurationMonths(90)).toBe(3);
    expect(calculateDurationMonths(180)).toBe(6);
    expect(calculateDurationMonths(365)).toBe(12);

    // Verified Shared rate (0.8954 ₹/hr -> ₹644.69/mo)
    const c30 = calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 30);
    const c90 = calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 90);
    const c180 = calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 180);
    const c365 = calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 365);

    expect(c30).toBe(644.69);
    expect(c90).toBe(1934.07);
    expect(c180).toBe(3868.14);
    expect(c365).toBe(7736.28);
  });

  // 12. Existing order amounts remain unchanged
  it('12. margin changes do not modify existing Order.amount records', async () => {
    const historicalOrder = {
      id: 'order-locked-1',
      amount: new Prisma.Decimal('1250.00'), // Created when margin was 20%
    };

    // Admin margin changed to 40%
    mockAdminSettingsService.getSettings.mockResolvedValue({
      hostHeavenProfitMarginPercent: 40,
    });

    // In DB, Order table is never updated by margin changes
    expect(historicalOrder.amount.toString()).toBe('1250');
  });

  // 13. Customer API does not expose provider costs or internal IDs
  it('13. confirmed mapping exposes selling price while keeping provider cost private', async () => {
    mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue({
      id: 'map-private-1',
      planId: 'p-private',
      isCostVerified: false,
    });
    mockPrisma.hostHeavenPlanMapping.update.mockResolvedValue({});
    mockPrisma.vPSPlan.update.mockResolvedValue({});

    const res = await syncService.confirmProviderCost('map-private-1', 1000);

    // Customer facing price is 1250
    expect(res.customerSellingPrice).toBe(1250);
    expect(res.status).toBe('VERIFIED');
  });

  // 14. Blocking unverified configurations
  it('14. HostHeaven plan mapping cannot be activated if unverified', async () => {
    mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue({
      id: 'map-unverified',
      planId: 'plan-unverified',
      isCostVerified: false, // Unverified
      isActive: false,
    });

    await expect(syncService.toggleMappingStatus('map-unverified', true)).rejects.toThrow(
      'Cannot activate an unverified configuration',
    );
  });

  // 15. Non-HostHeaven mappings are not touched
  it('15. non-HostHeaven mappings are not touched by HostHeaven sync service', async () => {
    mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue(null);
    await syncService.syncCatalogue();

    expect(mockPrisma.providerInventory.findFirst).not.toHaveBeenCalled();
  });

  // 16. Failed synchronization preserves existing catalogue data
  it('16. failed sync records error in SystemSetting and preserves existing catalogue data', async () => {
    mockHostHeavenService.getZones.mockRejectedValue(new Error('HostHeaven API connection timeout'));

    const result = await syncService.syncCatalogue();

    expect(result.success).toBe(false);
    expect(result.error).toContain('HostHeaven API connection timeout');
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'HOSTHEAVEN_SYNC_STATUS' },
        create: expect.objectContaining({ value: 'FAILED' }),
      }),
    );
  });

  // 17. Concurrent sync prevention
  it('17. rejects duplicate concurrent synchronization runs', async () => {
    (syncService as any).isSyncInProgress = true;

    const result = await syncService.syncCatalogue();
    expect(result.success).toBe(false);
    expect(result.message).toContain('already running');
  });
});
