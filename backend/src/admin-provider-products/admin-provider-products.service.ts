
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProviderProductDto } from './dto/create-provider-product.dto.js';
import { UpdateProviderProductDto } from './dto/update-provider-product.dto.js';

@Injectable()
export class AdminProviderProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    providerId?: string,
    productType?: string,
    active?: string,
  ) {
    const where: any = {};

    if (providerId) {
      where.providerId = providerId;
    }

    if (productType) {
      where.productType = productType.toUpperCase();
    }

    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;

    const [products, total] = await Promise.all([
      this.prisma.providerProduct.findMany({
        where,
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              code: true,
              isActive: true,
            },
          },
        },
        orderBy: [
          { providerId: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.providerProduct.count({ where }),
    ]);

    return { products, total };
  }

  async findOne(id: string) {
    const product = await this.prisma.providerProduct.findUnique({
      where: { id },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
          },
        },
        mappings: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Provider product not found');
    }

    return product;
  }

  async create(dto: CreateProviderProductDto) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    if (!provider.isActive) {
      throw new BadRequestException(
        'Cannot add a product to an inactive provider',
      );
    }

    try {
      return await this.prisma.providerProduct.create({
        data: {
          providerId: dto.providerId,
          externalProductId: dto.externalProductId,
          name: dto.name,
          productType: dto.productType,
          cpuCores: dto.cpuCores,
          ramGb: dto.ramGb,
          storageGb: dto.storageGb,
          bandwidthGb: dto.bandwidthGb,
          region: dto.region,
          supportedOS: dto.supportedOS,
          isActive: dto.isActive ?? true,
        },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'This external product ID already exists for this provider',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProviderProductDto) {
    await this.findOne(id);

    try {
      return await this.prisma.providerProduct.update({
        where: { id },
        data: dto,
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'This external product ID already exists for this provider',
        );
      }
      throw error;
    }
  }

  async updateStatus(id: string, isActive: boolean) {
    await this.findOne(id);

    return this.prisma.providerProduct.update({
      where: { id },
      data: { isActive },
    });
  }
}
