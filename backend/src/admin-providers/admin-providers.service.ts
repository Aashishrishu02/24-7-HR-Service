import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { HostHeavenService } from '../hostheaven/hostheaven.service.js';
import { VpsService } from '../vps/vps.service.js';

@Injectable()
export class AdminProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hostheavenService: HostHeavenService,
    private readonly vpsService: VpsService,
  ) {}

  private readonly providerSelect = {
    id: true,
    name: true,
    code: true,
    baseUrl: true,
    isActive: true,
    apiPurchaseEnabled: true,
    priority: true,
    maxPurchaseAmount: true,
    currency: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async findAll() {
    const providers = await this.prisma.provider.findMany({
      select: this.providerSelect,
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return {
      providers,
      total: providers.length,
    };
  }

  async findOne(id: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      select: this.providerSelect,
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return provider;
  }

  async updateStatus(id: string, isActive: boolean) {
    await this.findOne(id);

    return this.prisma.provider.update({
      where: { id },
      data: { isActive },
      select: this.providerSelect,
    });
  }

  async testConnection(id: string) {
    const provider = await this.findOne(id);

    if (provider.code === 'HOSTHEAVEN') {
      const result = await this.hostheavenService.testConnection();
      return {
        providerId: provider.id,
        providerName: provider.name,
        providerCode: provider.code,
        ...result,
      };
    }

    if (provider.code === 'SMARTVPS') {
      try {
        await this.vpsService.getIpStock();
        return {
          providerId: provider.id,
          providerName: provider.name,
          providerCode: provider.code,
          success: true,
          connected: true,
          message: 'SmartVPS provider connection verified',
          wallet: {
            balance: 0,
            currency: provider.currency || 'INR',
          },
        };
      } catch (err: any) {
        return {
          providerId: provider.id,
          providerName: provider.name,
          providerCode: provider.code,
          success: false,
          connected: false,
          message: err?.message || 'SmartVPS connection failed',
          wallet: { balance: 0, currency: provider.currency || 'INR' },
        };
      }
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      providerCode: provider.code,
      success: false,
      connected: false,
      message: `Provider ${provider.name} has no backend integration service.`,
      wallet: { balance: 0, currency: provider.currency || 'INR' },
    };
  }
}
