
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateInventoryDto } from './dto/create-inventory.dto.js';

@Injectable()
export class AdminInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private encrypt(value?: string): string | undefined {
    if (value === undefined) return undefined;

    const encodedKey = this.config.get<string>(
      'PROVIDER_ENCRYPTION_KEY',
    );

    if (!encodedKey) {
      throw new InternalServerErrorException(
        'Provider encryption key is not configured',
      );
    }

    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'Provider encryption key must decode to 32 bytes',
      );
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  private safeInventory(inventory: any) {
    const { encryptedAccessDetails, ...safeData } = inventory;

    return {
      ...safeData,
      accessDetailsConfigured: Boolean(encryptedAccessDetails),
    };
  }

  private readonly inventorySelect = {
    id: true,
    providerId: true,
    providerVpsId: true,
    ipAddress: true,
    hostname: true,
    cpuCores: true,
    ramGb: true,
    storageGb: true,
    bandwidthGb: true,
    region: true,
    operatingSystem: true,
    providerCost: true,
    currency: true,
    status: true,
    expiresAt: true,
    encryptedAccessDetails: true,
    createdAt: true,
    updatedAt: true,
    provider: {
      select: {
        id: true,
        name: true,
        code: true,
      },
    },
    vpsInstance: {
      select: {
        id: true,
        userId: true,
        status: true,
      },
    },
  } as const;

  async findAll(status?: string, providerId?: string) {
    const where: any = {};

    if (status) where.status = status;
    if (providerId) where.providerId = providerId;

    const [items, total] = await Promise.all([
      this.prisma.providerInventory.findMany({
        where,
        select: this.inventorySelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.providerInventory.count({ where }),
    ]);

    return {
      inventory: items.map((item) =>
        this.safeInventory(item),
      ),
      total,
    };
  }

  async findOne(id: string) {
    const inventory = await this.prisma.providerInventory.findUnique({
      where: { id },
      select: this.inventorySelect,
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    return this.safeInventory(inventory);
  }

  async create(dto: CreateInventoryDto) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
      select: {
        id: true,
        currency: true,
        maxPurchaseAmount: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    const currency = (dto.currency ?? provider.currency).toUpperCase();

    if (currency !== provider.currency.toUpperCase()) {
      throw new BadRequestException(
        'Inventory currency must match provider currency',
      );
    }

    if (
      provider.maxPurchaseAmount !== null &&
      dto.providerCost > Number(provider.maxPurchaseAmount)
    ) {
      throw new BadRequestException(
        'Provider cost exceeds the configured maximum purchase amount',
      );
    }

    const encryptedAccessDetails = this.encrypt(
      dto.accessDetails,
    );

    try {
      const inventory = await this.prisma.providerInventory.create({
        data: {
          providerId: dto.providerId,
          providerVpsId: dto.providerVpsId,
          ipAddress: dto.ipAddress,
          hostname: dto.hostname,
          cpuCores: dto.cpuCores,
          ramGb: dto.ramGb,
          storageGb: dto.storageGb,
          bandwidthGb: dto.bandwidthGb,
          region: dto.region,
          operatingSystem: dto.operatingSystem,
          providerCost: dto.providerCost,
          currency,
          expiresAt: dto.expiresAt
            ? new Date(dto.expiresAt)
            : undefined,
          encryptedAccessDetails,
          status: 'AVAILABLE',
        },
        select: this.inventorySelect,
      });

      return this.safeInventory(inventory);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'This provider VPS ID or IP address is already registered',
        );
      }

      throw error;
    }
  }

  async updateStatus(id: string, status: string) {
    const current = await this.prisma.providerInventory.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        vpsInstance: { select: { id: true } },
      },
    });

    if (!current) {
      throw new NotFoundException('Inventory item not found');
    }

    if (current.vpsInstance) {
      throw new BadRequestException(
        'Assigned inventory status must be managed through the VPS lifecycle',
      );
    }

    if (current.status === 'RESERVED') {
      throw new BadRequestException(
        'Reserved inventory cannot be manually changed',
      );
    }

    const inventory = await this.prisma.providerInventory.update({
      where: { id },
      data: { status: status as any },
      select: this.inventorySelect,
    });

    return this.safeInventory(inventory);
  }
}
