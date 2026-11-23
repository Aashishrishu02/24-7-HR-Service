import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { HostHeavenService } from '../hostheaven/hostheaven.service.js';
import { VpsService } from '../vps/vps.service.js';
import { NexaVpsService } from '../nexavps/nexavps.service.js';
import { DedicatedIpSyncService } from '../nexavps/dedicated-ip-sync.service.js';

@Injectable()
export class AdminProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hostheavenService: HostHeavenService,
    private readonly vpsService: VpsService,
    private readonly nexaVpsService: NexaVpsService,
    private readonly dedicatedIpSyncService: DedicatedIpSyncService,
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

  async getConnectionStatus(id: string) {
    const provider = await this.findOne(id);

    if (!['HOSTHEAVEN', 'NEXAVPS'].includes(provider.code)) {
      return null;
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: `PROVIDER_CONNECTION_STATUS_${provider.id}` },
      select: { value: true },
    });

    if (!setting) return null;

    try {
      return JSON.parse(setting.value);
    } catch {
      return null;
    }
  }

  async getCatalogue(id: string) {
    const provider = await this.findOne(id);

    if (provider.code !== 'NEXAVPS') {
      throw new NotFoundException('Nexa VPS provider not found');
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      providerCode: provider.code,
      ...(await this.nexaVpsService.getPlans(provider.baseUrl || undefined)),
      fetchedAt: new Date().toISOString(),
    };
  }

  async getDedicatedIpSyncStatus(id: string) {
    await this.findOne(id);
    return this.dedicatedIpSyncService.getSyncStatus(id);
  }

  async syncDedicatedIpCatalogue(id: string) {
    await this.findOne(id);
    return this.dedicatedIpSyncService.syncCatalogue(id);
  }

  async getBalance(id: string) {
    const provider = await this.findOne(id);

    if (provider.code !== 'NEXAVPS') {
      throw new NotFoundException('Nexa VPS provider not found');
    }

    const result = await this.nexaVpsService.getBalance(
      provider.baseUrl || undefined,
    );

    return {
      providerId: provider.id,
      providerName: provider.name,
      providerCode: provider.code,
      currency: provider.currency || 'INR',
      ...result,
    };
  }

  async testConnection(id: string) {
    const provider = await this.findOne(id);

    if (provider.code === 'HOSTHEAVEN') {
      const result = await this.hostheavenService.testConnection();
      const testedAt = new Date().toISOString();
      const savedResult = { ...result, testedAt };

      await this.prisma.systemSetting.upsert({
        where: { key: `PROVIDER_CONNECTION_STATUS_${provider.id}` },
        create: {
          key: `PROVIDER_CONNECTION_STATUS_${provider.id}`,
          value: JSON.stringify(savedResult),
          description: 'Last HostHeaven connection test result',
        },
        update: {
          value: JSON.stringify(savedResult),
          description: 'Last HostHeaven connection test result',
        },
      });

      return {
        providerId: provider.id,
        providerName: provider.name,
        providerCode: provider.code,
        ...savedResult,
      };
    }

    if (provider.code === 'NEXAVPS') {
      const result = await this.nexaVpsService.testConnection(provider.baseUrl || undefined);
      const testedAt = new Date().toISOString();
      const savedResult = { ...result, testedAt };

      await this.prisma.systemSetting.upsert({
        where: { key: `PROVIDER_CONNECTION_STATUS_${provider.id}` },
        create: {
          key: `PROVIDER_CONNECTION_STATUS_${provider.id}`,
          value: JSON.stringify(savedResult),
          description: 'Last Nexa VPS connection test result',
        },
        update: {
          value: JSON.stringify(savedResult),
          description: 'Last Nexa VPS connection test result',
        },
      });

      return {
        providerId: provider.id,
        providerName: provider.name,
        providerCode: provider.code,
        ...savedResult,
        wallet: {
          balance: 0,
          currency: provider.currency || 'INR',
        },
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
