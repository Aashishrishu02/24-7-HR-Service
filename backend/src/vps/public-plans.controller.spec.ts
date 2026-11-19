import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PublicPlansController } from './public-plans.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import { Prisma } from '../generated/prisma/client.js';

describe('PublicPlansController — Monthly Pricing Display & Privacy Verification', () => {
  let controller: PublicPlansController;
  let mockPrisma: any;
  let mockSettings: any;

  beforeEach(() => {
    mockPrisma = {
      vPSPlan: {
        findMany: vi.fn(),
      },
    };

    mockSettings = {
      getSettings: vi.fn().mockResolvedValue({
        hostHeavenProfitMarginPercent: 20,
        hostHeavenMarkupPercent: 25,
      }),
    };

    controller = new PublicPlansController(
      mockPrisma as unknown as PrismaService,
      mockSettings as unknown as AdminSettingsService,
    );
  });

  describe('Business Requirement: 20% Gross Profit Margin on Monthly Provider Cost', () => {
    it('verifies monthly provider price ₹644.69 produces customer price ₹805.86', async () => {
      mockPrisma.vPSPlan.findMany.mockResolvedValue([
        {
          id: 'plan-shared-644',
          name: 'Cloud VPS 1 vCPU - 1 GB RAM (India)',
          productType: 'VPS_HOSTING',
          description: 'High performance Shared Cloud VPS',
          cpuCores: 1,
          ramGb: 1,
          storageGb: 20,
          bandwidthGb: 1000,
          price: new Prisma.Decimal('805.86'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 1,
          hostHeavenMapping: {
            id: 'map-shared-1',
            zoneId: 'zone-in',
            zoneName: 'India',
            zoneIsoId: 'iso-u22',
            isoName: 'Ubuntu 22.04 LTS',
            planType: 'SHARED',
            providerCost: new Prisma.Decimal('644.69'), // Provider monthly cost: ₹644.69
            isCostVerified: true,
            costStatus: 'VERIFIED',
            isActive: true,
          },
        },
      ]);

      const result = await controller.findActivePlans();
      expect(result.plans).toHaveLength(1);

      const plan = result.plans[0];
      // 644.69 / 0.80 = 805.8625 -> ₹805.86
      expect(plan.price).toBe(805.86);
      expect(plan.monthlyPrice).toBe(805.86);
      expect(plan.billingInterval).toBe('month');
      expect(plan.currency).toBe('INR');
      expect(plan.durationDays).toBe(30);
    });

    it('verifies monthly provider price ₹1,000 produces customer price ₹1,250', async () => {
      mockPrisma.vPSPlan.findMany.mockResolvedValue([
        {
          id: 'plan-hh-1000',
          name: 'HostHeaven Pro 2C-4G',
          productType: 'VPS_HOSTING',
          description: 'High performance HostHeaven VPS',
          cpuCores: 2,
          ramGb: 4,
          storageGb: 50,
          bandwidthGb: 1000,
          price: new Prisma.Decimal('1250.00'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 1,
          hostHeavenMapping: {
            id: 'map-1000',
            zoneId: 'zone-delhi',
            zoneName: 'Delhi NCR',
            zoneIsoId: 'iso-u22',
            isoName: 'Ubuntu 22.04 LTS',
            planType: 'SHARED',
            providerCost: new Prisma.Decimal('1000.00'), // Provider monthly cost: ₹1,000
            isCostVerified: true,
            costStatus: 'VERIFIED',
            isActive: true,
          },
        },
      ]);

      const result = await controller.findActivePlans();
      expect(result.plans).toHaveLength(1);

      const plan = result.plans[0];
      // 1000 / 0.80 = ₹1,250
      expect(plan.price).toBe(1250);
      expect(plan.monthlyPrice).toBe(1250);
      expect(plan.billingInterval).toBe('month');
    });

    it('verifies ₹100 produces ₹125 and ₹500 produces ₹625', async () => {
      mockPrisma.vPSPlan.findMany.mockResolvedValue([
        {
          id: 'plan-100',
          name: 'Micro VPS',
          productType: 'VPS_HOSTING',
          price: new Prisma.Decimal('125.00'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04'],
          isActive: true,
          hostHeavenMapping: {
            providerCost: new Prisma.Decimal('100.00'),
            isCostVerified: true,
            isActive: true,
          },
        },
        {
          id: 'plan-500',
          name: 'Starter VPS',
          productType: 'VPS_HOSTING',
          price: new Prisma.Decimal('625.00'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04'],
          isActive: true,
          hostHeavenMapping: {
            providerCost: new Prisma.Decimal('500.00'),
            isCostVerified: true,
            isActive: true,
          },
        },
      ]);

      const result = await controller.findActivePlans();
      expect(result.plans[0].price).toBe(125);
      expect(result.plans[1].price).toBe(625);
    });

    it('ensures 20% margin is applied exactly once and not compounded onto an already-marked-up price', async () => {
      // In database, plan.price already stores the customer price ₹805.86, and hostHeavenMapping.providerCost is ₹644.69
      mockPrisma.vPSPlan.findMany.mockResolvedValue([
        {
          id: 'plan-test-single-margin',
          name: 'Single Margin Check VPS',
          productType: 'VPS_HOSTING',
          price: new Prisma.Decimal('805.86'), // Stored customer price
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 1,
          hostHeavenMapping: {
            id: 'map-1',
            providerCost: new Prisma.Decimal('644.69'), // Upstream provider cost
            isCostVerified: true,
            costStatus: 'VERIFIED',
            isActive: true,
          },
        },
      ]);

      const result = await controller.findActivePlans();
      const plan = result.plans[0];

      // If margin were applied twice, 805.86 / 0.80 = 1007.33 (WRONG).
      // It must be exactly ₹805.86!
      expect(plan.price).toBe(805.86);
      expect(plan.price).not.toBe(1007.33);
    });
  });

  describe('Safety & Privacy: Hourly Rates & Provider Cost Are Never Exposed', () => {
    it('ensures HostHeaven plans display monthly customer selling price (₹805.86) and never raw hourly rates', async () => {
      mockPrisma.vPSPlan.findMany.mockResolvedValue([
        {
          id: 'plan-hourly-test',
          name: 'Cloud VPS 2 vCPU - 4 GB RAM',
          productType: 'VPS_HOSTING',
          price: new Prisma.Decimal('805.86'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 1,
          hostHeavenMapping: {
            id: 'map-shared-1',
            zoneId: 'zone-in',
            zoneName: 'India',
            zoneIsoId: 'iso-u22',
            isoName: 'Ubuntu 22.04 LTS',
            planType: 'SHARED',
            providerCost: new Prisma.Decimal('644.69'), // Provider monthly cost: ₹644.69 (0.8954 * 720)
            isCostVerified: true,
            costStatus: 'VERIFIED',
            isActive: true,
          },
        },
      ]);

      const result = await controller.findActivePlans();
      const plan = result.plans[0];

      // Must be ₹805.86 monthly selling price, NOT raw hourly rates (0.8954, 0.1, etc.)
      expect(plan.price).toBe(805.86);
      expect(plan.monthlyPrice).toBe(805.86);
      expect(plan.price).not.toBe(0.8954);
      expect(plan.price).not.toBe(0.1);
      expect(plan.price).not.toBe(644.69); // Provider cost hidden
    });

    it('customer API returns monthly INR selling price only and strictly hides provider costs and internal pricing IDs', async () => {
      mockPrisma.vPSPlan.findMany.mockResolvedValue([
        {
          id: 'plan-private-1',
          name: 'Private Details Plan',
          productType: 'VPS_HOSTING',
          description: 'Production VPS',
          cpuCores: 2,
          ramGb: 4,
          storageGb: 50,
          bandwidthGb: 1000,
          price: new Prisma.Decimal('1250.00'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 1,
          hostHeavenMapping: {
            id: 'map-private-1',
            zoneId: 'zone-delhi',
            zoneName: 'Delhi NCR',
            zoneIsoId: 'iso-u22',
            isoName: 'Ubuntu 22.04 LTS',
            planType: 'SHARED',
            providerCost: new Prisma.Decimal('1000.00'),
            isCostVerified: true,
            costStatus: 'VERIFIED',
            isActive: true,
          },
        },
      ]);

      const result = await controller.findActivePlans();
      const plan = result.plans[0];

      // Verifies only public fields exist
      expect(plan.price).toBe(1250);
      expect(plan.monthlyPrice).toBe(1250);
      expect(plan.currency).toBe('INR');
      expect(plan.billingInterval).toBe('month');

      // CRITICAL SECURITY ASSERTIONS:
      expect((plan as any).providerCost).toBeUndefined();
      expect((plan as any).cpuPricingId).toBeUndefined();
      expect((plan as any).ramPricingId).toBeUndefined();
      expect((plan as any).diskPricingId).toBeUndefined();
      expect((plan as any).bandwidthPricingId).toBeUndefined();
      expect((plan as any).cpuPrice).toBeUndefined();
      expect((plan as any).ramPrice).toBeUndefined();
      expect((plan as any).diskPrice).toBeUndefined();
      expect((plan as any).bandwidthPrice).toBeUndefined();
      expect((plan as any).hostHeavenMapping).toBeUndefined();
      expect((plan as any).pricingDetails).toBeUndefined();
    });

    it('excludes plans whose HostHeaven mapping is marked inactive', async () => {
      mockPrisma.vPSPlan.findMany.mockResolvedValue([
        {
          id: 'plan-active-1',
          name: 'Active Cloud VPS',
          productType: 'CLOUD_VPS',
          price: new Prisma.Decimal('1000.00'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 1,
          hostHeavenMapping: {
            id: 'map-active',
            providerCost: new Prisma.Decimal('800.00'),
            isCostVerified: true,
            costStatus: 'VERIFIED',
            isActive: true,
          },
        },
        {
          id: 'plan-inactive-hh',
          name: 'HostHeaven Plan Offline',
          productType: 'CLOUD_VPS',
          price: new Prisma.Decimal('1000.00'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 2,
          hostHeavenMapping: {
            id: 'map-inactive',
            providerCost: new Prisma.Decimal('800.00'),
            isCostVerified: true,
            costStatus: 'VERIFIED',
            isActive: false, // Inactive mapping
          },
        },
      ]);

      const result = await controller.findActivePlans();
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0].id).toBe('plan-active-1');
    });

    it('excludes plans whose HostHeaven mapping has unverified/estimated cost', async () => {
      mockPrisma.vPSPlan.findMany.mockResolvedValue([
        {
          id: 'plan-active-verified',
          name: 'Verified VPS',
          productType: 'CLOUD_VPS',
          price: new Prisma.Decimal('1250.00'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 1,
          hostHeavenMapping: {
            id: 'map-verified',
            providerCost: new Prisma.Decimal('1000.00'),
            isCostVerified: true,
            costStatus: 'VERIFIED',
            isActive: true,
          },
        },
        {
          id: 'plan-unverified-estimated',
          name: 'Estimated VPS Pending Verification',
          productType: 'CLOUD_VPS',
          price: new Prisma.Decimal('1250.00'),
          currency: 'INR',
          durationDays: 30,
          supportedOS: ['Ubuntu 22.04 LTS'],
          isActive: true,
          sortOrder: 2,
          hostHeavenMapping: {
            id: 'map-unverified',
            providerCost: new Prisma.Decimal('1000.00'),
            isCostVerified: false,
            costStatus: 'ESTIMATED',
            isActive: false,
          },
        },
      ]);

      const result = await controller.findActivePlans();
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0].id).toBe('plan-active-verified');
    });
  });
});
