
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePlanDto } from './dto/create-plan.dto.js';
import { UpdatePlanDto } from './dto/update-plan.dto.js';

@Injectable()
export class AdminPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string, productType?: string, active?: string) {
    const where: any = {};

    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    if (productType?.trim()) {
      where.productType = productType.trim().toUpperCase();
    }

    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;

    const [plans, total] = await Promise.all([
      this.prisma.vPSPlan.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.vPSPlan.count({ where }),
    ]);

    return { plans, total };
  }

  async findOne(id: string) {
    const plan = await this.prisma.vPSPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('VPS plan not found');
    }

    return plan;
  }

  async create(dto: CreatePlanDto) {
    if (!dto.supportedOS?.length) {
      throw new BadRequestException(
        'At least one supported operating system is required',
      );
    }

    return this.prisma.vPSPlan.create({
      data: {
        name: dto.name,
        productType: dto.productType,
        description: dto.description,
        cpuCores: dto.cpuCores,
        ramGb: dto.ramGb,
        storageGb: dto.storageGb,
        bandwidthGb: dto.bandwidthGb,
        price: dto.price,
        currency: dto.currency ?? 'INR',
        durationDays: dto.durationDays,
        supportedOS: dto.supportedOS,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findOne(id);

    if (
      dto.supportedOS !== undefined &&
      dto.supportedOS.length === 0
    ) {
      throw new BadRequestException(
        'At least one supported operating system is required',
      );
    }

    return this.prisma.vPSPlan.update({
      where: { id },
      data: dto,
    });
  }

  async updateStatus(id: string, isActive: boolean) {
    await this.findOne(id);

    return this.prisma.vPSPlan.update({
      where: { id },
      data: { isActive },
    });
  }

  async delete(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.vPSPlan.findUnique({
        where: { id },
        select: { id: true, name: true },
      });

      if (!plan) {
        throw new NotFoundException('VPS plan not found');
      }

      const [orderCount, priceHistoryCount] = await Promise.all([
        tx.order.count({
          where: { planId: id },
        }),
        tx.priceHistory.count({
          where: { planId: id },
        }),
      ]);

      if (orderCount > 0 || priceHistoryCount > 0) {
        await tx.vPSPlan.update({
          where: { id },
          data: { isActive: false },
        });

        return {
          success: true,
          deleted: false,
          deactivated: true,
          message:
            `Plan "${plan.name}" has existing records. It has been deactivated instead of permanently deleted.`,
          orderCount,
          priceHistoryCount,
        };
      }

      await tx.vPSPlan.delete({
        where: { id },
      });

      return {
        success: true,
        deleted: true,
        deactivated: false,
        message: `Plan "${plan.name}" permanently deleted.`,
      };
    });
  }
}
