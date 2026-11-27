import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VpsService } from './vps.service.js';

const SUPPORTED_RAM = [4, 8, 16, 32] as const;
type SupportedRam = (typeof SUPPORTED_RAM)[number];

interface SmartVpsPlanConfig {
  providerCost: number | null;
  enabled: boolean;
}

@Controller('admin/smartvps')
@UseGuards(AdminAuthGuard)
export class SmartVpsAdminController {
  constructor(
    private readonly vpsService: VpsService,
    private readonly prisma: PrismaService,
    private readonly adminSettings: AdminSettingsService,
  ) {}

  private async getSavedPlans(): Promise<Record<number, SmartVpsPlanConfig>> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'SMARTVPS_PLAN_SETTINGS' },
    });

    let saved: Record<string, unknown> = {};

    if (setting?.value) {
      try {
        saved = JSON.parse(setting.value);
      } catch {
        saved = {};
      }
    }

    return Object.fromEntries(
      SUPPORTED_RAM.map((ram) => {
        const item = saved[String(ram)] as Partial<SmartVpsPlanConfig> | undefined;
        const cost = Number(item?.providerCost);

        return [
          ram,
          {
            providerCost:
              item?.providerCost !== null &&
              item?.providerCost !== undefined &&
              Number.isFinite(cost) &&
              cost >= 0
                ? cost
                : null,
            enabled: item?.enabled === true,
          },
        ];
      }),
    );
  }

  @Get()
  async getSmartVpsOverview() {
    const [stockResult, savedPlans, settings] = await Promise.all([
      this.vpsService.getIpStock(),
      this.getSavedPlans(),
      this.adminSettings.getSettings(),
    ]);

    const plans = SUPPORTED_RAM.map((ram) => {
      const stockKey = Object.keys(stockResult.stock[0]?.plans ?? {}).find(
        (key) => {
          const normalized = key.toLowerCase().replace(/\s+/g, ' ').trim();
          return ram === 4
            ? normalized.startsWith('4 gb')
            : normalized === `${ram} gb`;
        },
      );

      const availableCount = stockKey
        ? stockResult.stock.reduce((total, row) => {
            const status = String(row.plans?.[stockKey] ?? '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();

            return status === 'buy now' ? total + row.available : total;
          }, 0)
        : 0;

      const config = savedPlans[ram];
      const margin = settings.smartVpsProfitMarginPercent;
      const sellingPrice =
        config.providerCost !== null && margin < 100
          ? Math.round((config.providerCost / (1 - margin / 100)) * 100) / 100
          : null;

      return {
        ramGb: ram,
        availableCount,
        enabled: config.enabled,
        providerCost: config.providerCost,
        sellingPrice,
        currency: 'INR',
        customerVisible:
          config.enabled &&
          availableCount > 0 &&
          config.providerCost !== null,
      };
    });

    return {
      provider: 'SMARTVPS',
      providerStatus: 'CONNECTED',
      refreshedAt: stockResult.refreshedAt,
      profitMarginPercent: settings.smartVpsProfitMarginPercent,
      plans,
    };
  }

  @Put('plans')
  async updatePlans(
    @Body()
    body: {
      plans?: Array<{
        ramGb: number;
        providerCost: number | null;
        enabled: boolean;
      }>;
    },
  ) {
    if (!Array.isArray(body.plans) || body.plans.length === 0) {
      throw new BadRequestException('At least one RAM plan setting is required');
    }

    const savedPlans = await this.getSavedPlans();

    for (const plan of body.plans) {
      if (!SUPPORTED_RAM.includes(plan.ramGb as SupportedRam)) {
        throw new BadRequestException(
          `Unsupported SmartVPS RAM option: ${plan.ramGb}`,
        );
      }

      if (typeof plan.enabled !== 'boolean') {
        throw new BadRequestException('Plan enabled status must be true or false');
      }

      if (
        plan.providerCost !== null &&
        (!Number.isFinite(plan.providerCost) || plan.providerCost < 0)
      ) {
        throw new BadRequestException('Provider cost must be zero or greater');
      }

      savedPlans[plan.ramGb] = {
        providerCost: plan.providerCost,
        enabled: plan.enabled,
      };
    }

    await this.prisma.systemSetting.upsert({
      where: { key: 'SMARTVPS_PLAN_SETTINGS' },
      create: {
        key: 'SMARTVPS_PLAN_SETTINGS',
        value: JSON.stringify(savedPlans),
        description: 'SmartVPS RAM plan provider costs and customer visibility',
      },
      update: {
        value: JSON.stringify(savedPlans),
        description: 'SmartVPS RAM plan provider costs and customer visibility',
      },
    });

    return {
      message: 'SmartVPS plan settings saved successfully',
      plans: savedPlans,
    };
  }
}
