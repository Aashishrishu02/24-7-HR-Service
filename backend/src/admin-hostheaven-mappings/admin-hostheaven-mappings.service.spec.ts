import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminHostHeavenMappingsService } from './admin-hostheaven-mappings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import { HostHeavenService } from '../hostheaven/hostheaven.service.js';
import { Prisma } from '../generated/prisma/client.js';

describe('AdminHostHeavenMappingsService', () => {
  let service: AdminHostHeavenMappingsService;
  let mockPrisma: any;
  let mockSettings: any;
  let mockHostHeaven: any;

  beforeEach(() => {
    mockPrisma = {
      hostHeavenPlanMapping: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      vPSPlan: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockSettings = {
      getSettings: vi.fn().mockResolvedValue({
        hostHeavenProfitMarginPercent: 20,
        hostHeavenMarkupPercent: 25,
      }),
    };

    mockHostHeaven = {
      getCompletePricing: vi.fn(),
    };

    const mockSyncService = {
      syncCatalogue: vi.fn(),
      getSyncStatus: vi.fn(),
      confirmProviderCost: vi.fn(),
      toggleMappingStatus: vi.fn(),
    };

    service = new AdminHostHeavenMappingsService(
      mockPrisma as unknown as PrismaService,
      mockSettings as unknown as AdminSettingsService,
      mockHostHeaven as unknown as HostHeavenService,
      mockSyncService as any,
    );
  });

  describe('findAll', () => {
    it('returns enriched mappings with provider cost, 20% margin and calculated customer selling price', async () => {
      mockPrisma.hostHeavenPlanMapping.findMany.mockResolvedValue([
        {
          id: 'map-1',
          planId: 'plan-1',
          zoneId: 'zone-delhi',
          planType: 'SHARED',
          providerCost: new Prisma.Decimal('1000.00'),
          isActive: true,
          plan: {
            id: 'plan-1',
            name: 'Standard Cloud 1',
            price: new Prisma.Decimal('1250.00'),
          },
        },
      ]);

      const result = await service.findAll();
      expect(result.mappings).toHaveLength(1);
      expect(result.mappings[0].profitMarginPercent).toBe(20);
      expect(result.mappings[0].calculatedSellingPrice).toBe(1250);
      expect(result.mappings[0].grossProfit).toBe(250);
      expect(result.currentProfitMarginPercent).toBe(20);
    });
  });

  describe('create', () => {
    it('creates HostHeaven mapping, validates plan, and updates VPSPlan.price with 20% profit margin', async () => {
      mockPrisma.vPSPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Starter Cloud VPS',
        durationDays: 30,
      });

      mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue(null);

      mockPrisma.hostHeavenPlanMapping.create.mockImplementation((args: any) => ({
        id: 'map-new',
        ...args.data,
      }));

      mockPrisma.vPSPlan.update.mockResolvedValue({});

      const result = await service.create({
        planId: 'plan-1',
        zoneId: 'zone-delhi',
        zoneName: 'Delhi NCR',
        zoneIsoId: 'iso-u22',
        isoName: 'Ubuntu 22.04 LTS',
        planType: 'SHARED',
        cpuPricingId: 'cpu-2',
        cpuName: '2 Cores',
        ramPricingId: 'ram-4',
        ramName: '4 GB',
        diskPricingId: 'disk-50',
        diskName: '50 GB NVMe',
        bandwidthPricingId: 'bw-1000',
        bandwidthName: '1 TB',
        providerCost: 2000, // Provider cost ₹2,000
        isActive: true,
      });

      // Provider cost ₹2,000 / 0.8 = ₹2,500 selling price
      expect(result.profitMarginPercent).toBe(20);
      expect(result.customerSellingPrice).toBe(2500);
      expect(result.grossProfit).toBe(500);

      // Verify VPSPlan.price was updated
      expect(mockPrisma.vPSPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { price: new Prisma.Decimal('2500.00') },
      });
    });

    it('rejects duplicate mapping if VPS plan already has a HostHeaven mapping', async () => {
      mockPrisma.vPSPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Starter Cloud VPS',
      });

      mockPrisma.hostHeavenPlanMapping.findUnique.mockResolvedValue({
        id: 'existing-map',
        planId: 'plan-1',
      });

      await expect(
        service.create({
          planId: 'plan-1',
          zoneId: 'zone-delhi',
          zoneIsoId: 'iso-u22',
          planType: 'SHARED',
          cpuPricingId: 'cpu-2',
          ramPricingId: 'ram-4',
          diskPricingId: 'disk-50',
          bandwidthPricingId: 'bw-1000',
          providerCost: 1000,
        }),
      ).rejects.toThrow('already has an active HostHeaven mapping');
    });
  });

  describe('calculatePricing', () => {
    it('accurately calculates real-time customer price with 20% gross profit margin from providerCost', async () => {
      const calc = await service.calculatePricing({
        planType: 'SHARED',
        providerCost: 1000,
        durationDays: 30,
      });

      expect(calc.providerCost).toBe(1000);
      expect(calc.profitMarginPercent).toBe(20);
      expect(calc.customerSellingPrice).toBe(1250);
      expect(calc.grossProfit).toBe(250);
    });

    it('accurately converts hourly resource rates into provider cost and 20% margin selling price', async () => {
      const calc = await service.calculatePricing({
        planType: 'SHARED',
        cpuPrice: 0.1,
        ramPrice: 0.1954,
        diskPrice: 0.2,
        bandwidthPrice: 0.4,
        durationDays: 30,
      });

      expect(calc.providerCost).toBe(644.69);
      expect(calc.profitMarginPercent).toBe(20);
      expect(calc.customerSellingPrice).toBe(805.86);
      expect(calc.grossProfit).toBe(161.17);
    });
  });
});
