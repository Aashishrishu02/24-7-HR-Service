
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

import { CreatePlanProviderMappingDto } from './dto/create-plan-provider-mapping.dto.js';
import { UpdatePlanProviderMappingDto } from './dto/update-plan-provider-mapping.dto.js';

@Injectable()
export class AdminPlanProviderMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    planId?: string,
    providerId?: string,
    enabled?: string,
  ) {
    const where: Prisma.VPSPlanProviderMappingWhereInput = {};

    if (planId) where.planId = planId;
    if (providerId) where.providerId = providerId;

    if (enabled === 'true') where.isEnabled = true;
    if (enabled === 'false') where.isEnabled = false;

    const mappings = await this.prisma.vPSPlanProviderMapping.findMany({
      where,
      include: {
        plan: true,
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            apiPurchaseEnabled: true,
          },
        },
        providerProduct: true,
      },
      orderBy: [
        { planId: 'asc' },
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return { mappings, total: mappings.length };
  }

  async findOne(id: string) {
    const mapping =
      await this.prisma.vPSPlanProviderMapping.findUnique({
        where: { id },
        include: {
          plan: true,
          provider: {
            select: {
              id: true,
              name: true,
              code: true,
              isActive: true,
              apiPurchaseEnabled: true,
            },
          },
          providerProduct: true,
        },
      });

    if (!mapping) {
      throw new NotFoundException('Plan provider mapping not found');
    }

    return mapping;
  }

  private async validateRelations(
    planId: string,
    providerId: string,
    providerProductId: string,
  ) {
    const [plan, provider, product] = await Promise.all([
      this.prisma.vPSPlan.findUnique({ where: { id: planId } }),
      this.prisma.provider.findUnique({ where: { id: providerId } }),
      this.prisma.providerProduct.findUnique({
        where: { id: providerProductId },
      }),
    ]);

    if (!plan) {
      throw new NotFoundException('VPS plan not found');
    }

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    if (!provider.isActive) {
      throw new BadRequestException('Provider is inactive');
    }

    if (!product) {
      throw new NotFoundException('Provider product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Provider product is inactive');
    }

    if (product.providerId !== providerId) {
      throw new BadRequestException(
        'Selected product does not belong to the selected provider',
      );
    }

    if (plan.productType !== product.productType) {
      throw new BadRequestException(
        'Plan and provider product types do not match',
      );
    }

    if (
      product.cpuCores < plan.cpuCores ||
      product.ramGb < plan.ramGb ||
      product.storageGb < plan.storageGb ||
      (plan.bandwidthGb != null &&
        (product.bandwidthGb == null ||
          product.bandwidthGb < plan.bandwidthGb))
    ) {
      throw new BadRequestException(
        'Provider product specifications do not meet the VPS plan requirements',
      );
    }

    return { plan, provider, product };
  }

  async create(dto: CreatePlanProviderMappingDto) {
    const { provider } = await this.validateRelations(
      dto.planId,
      dto.providerId,
      dto.providerProductId,
    );

    if (dto.autoPurchaseEnabled && !provider.apiPurchaseEnabled) {
      throw new BadRequestException(
        'Provider API purchasing is disabled. Verify and enable it at provider level first.',
      );
    }

    try {
      return await this.prisma.vPSPlanProviderMapping.create({
        data: {
          planId: dto.planId,
          providerId: dto.providerId,
          providerProductId: dto.providerProductId,
          priority: dto.priority ?? 100,
          isEnabled: dto.isEnabled ?? true,
          autoPurchaseEnabled: dto.autoPurchaseEnabled ?? false,
          maxAllowedCost: dto.maxAllowedCost,
          regionMapping: dto.regionMapping as
            | Prisma.InputJsonValue
            | undefined,
          osMapping: dto.osMapping as
            | Prisma.InputJsonValue
            | undefined,
        },
        include: {
          plan: true,
          provider: {
            select: {
              id: true,
              name: true,
              code: true,
              isActive: true,
              apiPurchaseEnabled: true,
            },
          },
          providerProduct: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This provider product is already mapped to this VPS plan',
        );
      }

      throw error;
    }
  }

  async update(id: string, dto: UpdatePlanProviderMappingDto) {
    const existing =
      await this.prisma.vPSPlanProviderMapping.findUnique({
        where: { id },
        include: { provider: true },
      });

    if (!existing) {
      throw new NotFoundException('Plan provider mapping not found');
    }

    if (
      dto.autoPurchaseEnabled === true &&
      !existing.provider.apiPurchaseEnabled
    ) {
      throw new BadRequestException(
        'Provider API purchasing is disabled. Verify and enable it at provider level first.',
      );
    }

    const data: Prisma.VPSPlanProviderMappingUpdateInput = {};

    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.autoPurchaseEnabled !== undefined) {
      data.autoPurchaseEnabled = dto.autoPurchaseEnabled;
    }
    if (dto.maxAllowedCost !== undefined) {
      data.maxAllowedCost = dto.maxAllowedCost;
    }
    if (dto.regionMapping !== undefined) {
      data.regionMapping = dto.regionMapping as Prisma.InputJsonValue;
    }
    if (dto.osMapping !== undefined) {
      data.osMapping = dto.osMapping as Prisma.InputJsonValue;
    }

    return this.prisma.vPSPlanProviderMapping.update({
      where: { id },
      data,
      include: {
        plan: true,
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            apiPurchaseEnabled: true,
          },
        },
        providerProduct: true,
      },
    });
  }
}
