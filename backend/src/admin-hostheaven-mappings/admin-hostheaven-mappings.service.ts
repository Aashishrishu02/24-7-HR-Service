import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import { HostHeavenService } from '../hostheaven/hostheaven.service.js';
import { HostHeavenSyncService } from '../hostheaven/hostheaven-sync.service.js';
import {
  calculateSellingPrice,
  calculateProviderCost,
  calculatePricingBreakdown,
  calculateDurationMonths,
} from '../hostheaven/hostheaven-pricing.util.js';
import { CreateHostHeavenMappingDto } from './dto/create-hostheaven-mapping.dto.js';
import { UpdateHostHeavenMappingDto } from './dto/update-hostheaven-mapping.dto.js';
import { CalculateHostHeavenPriceDto } from './dto/calculate-price.dto.js';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class AdminHostHeavenMappingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly hostheavenService: HostHeavenService,
    private readonly syncService: HostHeavenSyncService,
  ) {}

  async syncNow() {
    return this.syncService.syncCatalogue();
  }

  async getSyncStatus() {
    return this.syncService.getSyncStatus();
  }

  async confirmCost(id: string, confirmedCost: number) {
    return this.syncService.confirmProviderCost(id, confirmedCost);
  }

  async findAll(planId?: string, isActive?: string, isCostVerified?: string) {
    const where: Prisma.HostHeavenPlanMappingWhereInput = {};
    if (planId) where.planId = planId;
    if (isActive === 'true') where.isActive = true;
    if (isActive === 'false') where.isActive = false;
    if (isCostVerified === 'true') where.isCostVerified = true;
    if (isCostVerified === 'false') where.isCostVerified = false;

    const [mappings, settings] = await Promise.all([
      this.prisma.hostHeavenPlanMapping.findMany({
        where,
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              productType: true,
              cpuCores: true,
              ramGb: true,
              storageGb: true,
              bandwidthGb: true,
              price: true,
              currency: true,
              durationDays: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.adminSettingsService.getSettings(),
    ]);

    const margin = settings.hostHeavenProfitMarginPercent ?? 20;

    const enriched = mappings.map((m) => {
      const cost = Number(m.providerCost);
      const calculatedSellingPrice = calculateSellingPrice(cost, margin);
      const grossProfit = Math.round((calculatedSellingPrice - cost) * 100) / 100;
      const durationDays = m.plan?.durationDays ?? 30;
      const durationMonths = calculateDurationMonths(durationDays);

      return {
        ...m,
        profitMarginPercent: margin,
        calculatedSellingPrice,
        grossProfit,
        billingDurationDays: durationDays,
        billingDurationMonths: durationMonths,
      };
    });

    return {
      mappings: enriched,
      total: enriched.length,
      currentProfitMarginPercent: margin,
    };
  }

  async findOne(id: string) {
    const mapping = await this.prisma.hostHeavenPlanMapping.findUnique({
      where: { id },
      include: {
        plan: true,
      },
    });

    if (!mapping) {
      throw new NotFoundException('HostHeaven plan mapping not found');
    }

    const settings = await this.adminSettingsService.getSettings();
    const margin = settings.hostHeavenProfitMarginPercent ?? 20;
    const cost = Number(mapping.providerCost);
    const calculatedSellingPrice = calculateSellingPrice(cost, margin);
    const grossProfit = Math.round((calculatedSellingPrice - cost) * 100) / 100;
    const durationDays = mapping.plan?.durationDays ?? 30;
    const durationMonths = calculateDurationMonths(durationDays);

    return {
      ...mapping,
      profitMarginPercent: margin,
      calculatedSellingPrice,
      grossProfit,
      billingDurationDays: durationDays,
      billingDurationMonths: durationMonths,
    };
  }

  async calculatePricing(dto: CalculateHostHeavenPriceDto) {
    let durationDays = dto.durationDays || 30;

    if (dto.planId) {
      const plan = await this.prisma.vPSPlan.findUnique({
        where: { id: dto.planId },
        select: { durationDays: true },
      });
      if (plan) {
        durationDays = plan.durationDays;
      }
    }

    const settings = await this.adminSettingsService.getSettings();
    const margin = settings.hostHeavenProfitMarginPercent ?? 20;

    let providerCost = 0;
    let pricingBreakdown = null;

    if (dto.providerCost !== undefined && dto.providerCost > 0) {
      providerCost = dto.providerCost;
    } else {
      pricingBreakdown = calculatePricingBreakdown(
        dto.cpuPrice || 0,
        dto.ramPrice || 0,
        dto.diskPrice || 0,
        dto.bandwidthPrice || 0,
        durationDays,
        margin,
      );
      providerCost = pricingBreakdown.totalProviderCost;
    }

    const customerSellingPrice = calculateSellingPrice(providerCost, margin);
    const grossProfit = Math.round((customerSellingPrice - providerCost) * 100) / 100;

    return {
      planType: dto.planType,
      durationDays,
      durationMonths: calculateDurationMonths(durationDays),
      providerCost,
      currency: 'INR',
      profitMarginPercent: margin,
      customerSellingPrice,
      grossProfit,
      pricingBreakdown,
      formula: 'sellingPrice = providerCost / (1 - margin/100)',
    };
  }

  async create(dto: CreateHostHeavenMappingDto) {
    const plan = await this.prisma.vPSPlan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundException(`VPS plan with ID ${dto.planId} not found`);
    }

    const existing = await this.prisma.hostHeavenPlanMapping.findUnique({
      where: { planId: dto.planId },
    });

    if (existing) {
      throw new ConflictException(
        `VPS plan "${plan.name}" already has an active HostHeaven mapping. Update the existing mapping instead.`,
      );
    }

    // Determine provider cost
    let providerCost = dto.providerCost;
    if (providerCost === undefined || providerCost <= 0) {
      throw new BadRequestException('Provider cost in INR must be greater than zero');
    }

    const settings = await this.adminSettingsService.getSettings();
    const margin = settings.hostHeavenProfitMarginPercent ?? 20;
    const sellingPrice = calculateSellingPrice(providerCost, margin);

    return this.prisma.$transaction(async (tx) => {
      // Create HostHeaven mapping
      const mapping = await tx.hostHeavenPlanMapping.create({
        data: {
          planId: dto.planId,
          zoneId: dto.zoneId,
          zoneName: dto.zoneName,
          zoneIsoId: dto.zoneIsoId,
          isoName: dto.isoName,
          planType: dto.planType,
          cpuPricingId: dto.cpuPricingId,
          cpuName: dto.cpuName,
          ramPricingId: dto.ramPricingId,
          ramName: dto.ramName,
          diskPricingId: dto.diskPricingId,
          diskName: dto.diskName,
          bandwidthPricingId: dto.bandwidthPricingId,
          bandwidthName: dto.bandwidthName,
          providerCost: new Prisma.Decimal(providerCost.toFixed(2)),
          currency: 'INR',
          isCostVerified: dto.isCostVerified ?? true,
          costStatus: dto.costStatus || 'VERIFIED',
          externalConfigId: dto.externalConfigId,
          isActive: dto.isActive ?? true,
        },
      });

      // Update VPSPlan.price to server-calculated customer selling price
      await tx.vPSPlan.update({
        where: { id: dto.planId },
        data: {
          price: new Prisma.Decimal(sellingPrice.toFixed(2)),
        },
      });

      return {
        ...mapping,
        profitMarginPercent: margin,
        customerSellingPrice: sellingPrice,
        grossProfit: Math.round((sellingPrice - providerCost) * 100) / 100,
      };
    });
  }

  async update(id: string, dto: UpdateHostHeavenMappingDto) {
    const mapping = await this.prisma.hostHeavenPlanMapping.findUnique({
      where: { id },
      include: { plan: true },
    });

    if (!mapping) {
      throw new NotFoundException('HostHeaven plan mapping not found');
    }

    let providerCost = Number(mapping.providerCost);
    let shouldRecalculatePrice = false;

    if (dto.providerCost !== undefined && dto.providerCost > 0) {
      providerCost = dto.providerCost;
      shouldRecalculatePrice = true;
    }

    const settings = await this.adminSettingsService.getSettings();
    const margin = settings.hostHeavenProfitMarginPercent ?? 20;
    const sellingPrice = calculateSellingPrice(providerCost, margin);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.hostHeavenPlanMapping.update({
        where: { id },
        data: {
          zoneId: dto.zoneId,
          zoneName: dto.zoneName,
          zoneIsoId: dto.zoneIsoId,
          isoName: dto.isoName,
          planType: dto.planType,
          cpuPricingId: dto.cpuPricingId,
          cpuName: dto.cpuName,
          ramPricingId: dto.ramPricingId,
          ramName: dto.ramName,
          diskPricingId: dto.diskPricingId,
          diskName: dto.diskName,
          bandwidthPricingId: dto.bandwidthPricingId,
          bandwidthName: dto.bandwidthName,
          providerCost:
            dto.providerCost !== undefined
              ? new Prisma.Decimal(providerCost.toFixed(2))
              : undefined,
          isActive: dto.isActive,
        },
      });

      if (shouldRecalculatePrice) {
        await tx.vPSPlan.update({
          where: { id: mapping.planId },
          data: {
            price: new Prisma.Decimal(sellingPrice.toFixed(2)),
          },
        });
      }

      return {
        ...updated,
        profitMarginPercent: margin,
        customerSellingPrice: sellingPrice,
        grossProfit: Math.round((sellingPrice - providerCost) * 100) / 100,
      };
    });
  }

  async updateStatus(id: string, isActive: boolean) {
    return this.syncService.toggleMappingStatus(id, isActive);
  }

  async delete(id: string) {
    const mapping = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.hostHeavenPlanMapping.delete({
        where: { id },
      });
      // Deactivate the VPS plan so it does not stay orphaned
      await tx.vPSPlan.update({
        where: { id: mapping.planId },
        data: { isActive: false },
      });
      return { success: true, message: 'HostHeaven mapping deleted' };
    });
  }
}
