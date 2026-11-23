
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateRenewalSettingsDto } from './dto/update-settings.dto.js';

export interface RenewalSettings {
  renewalWindowDays: number;
  gracePeriodDays: number;
  preExpiryNotificationDays: number[];
  lowBalanceNotificationHours: number;
  suspensionPolicy: string;
  terminationPolicy: string;
  renewalPricingModel: string;
  hostHeavenMarkupPercent: number;
  hostHeavenProfitMarginPercent: number;
  nexaVpsProfitMarginPercent: number;
  dedicatedIpEnabled: boolean;
}

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);

  private readonly defaults = {
    RENEWAL_WINDOW_DAYS: '7',
    GRACE_PERIOD_DAYS: '3',
    PRE_EXPIRY_NOTIFICATION_DAYS: '7,3,1',
    LOW_BALANCE_NOTIFICATION_HOURS: '24',
    SUSPENSION_POLICY: 'AUTO_SUSPEND_ON_EXPIRY',
    TERMINATION_POLICY: 'AUTO_TERMINATE_AFTER_GRACE',
    RENEWAL_PRICING_MODEL: 'PLAN_SELLING_PRICE',
    HOSTHEAVEN_PROFIT_MARGIN_PERCENT: '20',
    HOSTHEAVEN_MARKUP_PERCENT: '25',
    NEXAVPS_PROFIT_MARGIN_PERCENT: '20',
    DEDICATED_IP_ENABLED: 'false',
  };

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<RenewalSettings> {
    const settingsRows = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: Object.keys(this.defaults),
        },
      },
    });

    const settingsMap = new Map<string, string>();

    for (const row of settingsRows) {
      settingsMap.set(row.key, row.value);
    }

    const renewalWindowDays = parseInt(
      settingsMap.get('RENEWAL_WINDOW_DAYS') ??
        this.defaults.RENEWAL_WINDOW_DAYS,
      10,
    );

    const gracePeriodDays = parseInt(
      settingsMap.get('GRACE_PERIOD_DAYS') ??
        this.defaults.GRACE_PERIOD_DAYS,
      10,
    );

    const rawPreExpiry =
      settingsMap.get('PRE_EXPIRY_NOTIFICATION_DAYS') ??
      this.defaults.PRE_EXPIRY_NOTIFICATION_DAYS;

    const preExpiryNotificationDays = rawPreExpiry
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => b - a);

    const lowBalanceNotificationHours = parseInt(
      settingsMap.get('LOW_BALANCE_NOTIFICATION_HOURS') ??
        this.defaults.LOW_BALANCE_NOTIFICATION_HOURS,
      10,
    );

    const suspensionPolicy =
      settingsMap.get('SUSPENSION_POLICY') ??
      this.defaults.SUSPENSION_POLICY;

    const terminationPolicy =
      settingsMap.get('TERMINATION_POLICY') ??
      this.defaults.TERMINATION_POLICY;

    const renewalPricingModel =
      settingsMap.get('RENEWAL_PRICING_MODEL') ??
      this.defaults.RENEWAL_PRICING_MODEL;

    // Profit margin calculation with legacy markup backward-compatibility
    let hostHeavenProfitMarginPercent = 20;
    if (settingsMap.has('HOSTHEAVEN_PROFIT_MARGIN_PERCENT')) {
      const parsedMargin = Number(settingsMap.get('HOSTHEAVEN_PROFIT_MARGIN_PERCENT'));
      if (!isNaN(parsedMargin) && parsedMargin >= 0 && parsedMargin <= 80) {
        hostHeavenProfitMarginPercent = parsedMargin;
      }
    } else if (settingsMap.has('HOSTHEAVEN_MARKUP_PERCENT')) {
      // Legacy markup to profit margin conversion: P = (M / (100 + M)) * 100
      const parsedMarkup = Number(settingsMap.get('HOSTHEAVEN_MARKUP_PERCENT'));
      if (!isNaN(parsedMarkup) && parsedMarkup >= 0) {
        hostHeavenProfitMarginPercent = Math.round((parsedMarkup / (100 + parsedMarkup)) * 100 * 100) / 100;
        if (hostHeavenProfitMarginPercent > 80) hostHeavenProfitMarginPercent = 80;
      }
    }

    const dedicatedIpEnabled =
      (settingsMap.get('DEDICATED_IP_ENABLED') ??
        this.defaults.DEDICATED_IP_ENABLED) === 'true';

    const rawNexaMargin = Number(
      settingsMap.get('NEXAVPS_PROFIT_MARGIN_PERCENT') ??
        this.defaults.NEXAVPS_PROFIT_MARGIN_PERCENT,
    );
    const nexaVpsProfitMarginPercent =
      Number.isFinite(rawNexaMargin) && rawNexaMargin >= 0 && rawNexaMargin <= 80
        ? rawNexaMargin
        : 20;

    // Equivalent markup for legacy callers: M = (P / (100 - P)) * 100
    const hostHeavenMarkupPercent =
      hostHeavenProfitMarginPercent < 100
        ? Math.round((hostHeavenProfitMarginPercent / (100 - hostHeavenProfitMarginPercent)) * 100 * 100) / 100
        : 25;

    return {
      renewalWindowDays: Number.isInteger(renewalWindowDays)
        ? renewalWindowDays
        : 7,
      gracePeriodDays: Number.isInteger(gracePeriodDays)
        ? gracePeriodDays
        : 3,
      preExpiryNotificationDays,
      lowBalanceNotificationHours: Number.isInteger(
        lowBalanceNotificationHours,
      )
        ? lowBalanceNotificationHours
        : 24,
      suspensionPolicy,
      terminationPolicy,
      renewalPricingModel,
      hostHeavenMarkupPercent,
      hostHeavenProfitMarginPercent,
      nexaVpsProfitMarginPercent,
      dedicatedIpEnabled,
    };
  }

  async updateSettings(
    dto: UpdateRenewalSettingsDto,
  ): Promise<RenewalSettings> {
    const updates: {
      key: string;
      value: string;
      description: string;
    }[] = [];

    if (dto.renewalWindowDays !== undefined) {
      updates.push({
        key: 'RENEWAL_WINDOW_DAYS',
        value: dto.renewalWindowDays.toString(),
        description: 'Days before expiry to attempt automatic renewal',
      });
    }

    if (dto.gracePeriodDays !== undefined) {
      updates.push({
        key: 'GRACE_PERIOD_DAYS',
        value: dto.gracePeriodDays.toString(),
        description: 'Duration in days of grace period before termination',
      });
    }

    if (dto.preExpiryNotificationDays !== undefined) {
      updates.push({
        key: 'PRE_EXPIRY_NOTIFICATION_DAYS',
        value: dto.preExpiryNotificationDays,
        description:
          'Comma-separated days before expiry to send reminder emails',
      });
    }

    if (dto.lowBalanceNotificationHours !== undefined) {
      updates.push({
        key: 'LOW_BALANCE_NOTIFICATION_HOURS',
        value: dto.lowBalanceNotificationHours.toString(),
        description:
          'Minimum hours between low wallet balance notifications',
      });
    }

    if (dto.suspensionPolicy !== undefined) {
      updates.push({
        key: 'SUSPENSION_POLICY',
        value: dto.suspensionPolicy,
        description:
          'Policy for expired instances: AUTO_SUSPEND_ON_EXPIRY or MANUAL',
      });
    }

    if (dto.terminationPolicy !== undefined) {
      updates.push({
        key: 'TERMINATION_POLICY',
        value: dto.terminationPolicy,
        description:
          'Policy for post-grace instances: AUTO_TERMINATE_AFTER_GRACE or MANUAL',
      });
    }

    if (dto.renewalPricingModel !== undefined) {
      updates.push({
        key: 'RENEWAL_PRICING_MODEL',
        value: dto.renewalPricingModel,
        description: 'Customer renewal pricing model: PLAN_SELLING_PRICE',
      });
    }

    if (dto.hostHeavenProfitMarginPercent !== undefined) {
      const margin = Math.min(80, Math.max(0, dto.hostHeavenProfitMarginPercent));
      const equivalentMarkup =
        margin < 100 ? Math.round((margin / (100 - margin)) * 100 * 100) / 100 : 25;

      updates.push({
        key: 'HOSTHEAVEN_PROFIT_MARGIN_PERCENT',
        value: margin.toString(),
        description: 'Gross profit margin on HostHeaven provider cost (default 20%)',
      });
      updates.push({
        key: 'HOSTHEAVEN_MARKUP_PERCENT',
        value: equivalentMarkup.toString(),
        description: 'Percentage markup applied to HostHeaven provider cost',
      });
    } else if (dto.hostHeavenMarkupPercent !== undefined) {
      const markup = Math.max(0, dto.hostHeavenMarkupPercent);
      const equivalentMargin =
        Math.min(80, Math.round((markup / (100 + markup)) * 100 * 100) / 100);

      updates.push({
        key: 'HOSTHEAVEN_MARKUP_PERCENT',
        value: markup.toString(),
        description: 'Percentage markup applied to HostHeaven provider cost',
      });
      updates.push({
        key: 'HOSTHEAVEN_PROFIT_MARGIN_PERCENT',
        value: equivalentMargin.toString(),
        description: 'Gross profit margin on HostHeaven provider cost (default 20%)',
      });
    }

    if (dto.dedicatedIpEnabled !== undefined) {
      updates.push({
        key: 'DEDICATED_IP_ENABLED',
        value: dto.dedicatedIpEnabled.toString(),
        description: 'Controls whether Dedicated IP catalogue is visible to customers',
      });
    }

    if (dto.nexaVpsProfitMarginPercent !== undefined) {
      const margin = Math.min(80, Math.max(0, dto.nexaVpsProfitMarginPercent));
      updates.push({
        key: 'NEXAVPS_PROFIT_MARGIN_PERCENT',
        value: margin.toString(),
        description: 'Gross profit margin on Nexa VPS provider cost (default 20%)',
      });
    }

    for (const item of updates) {
      await this.prisma.systemSetting.upsert({
        where: { key: item.key },
        create: {
          key: item.key,
          value: item.value,
          description: item.description,
        },
        update: {
          value: item.value,
          description: item.description,
        },
      });
    }

    this.logger.log(`Updated renewal settings: ${JSON.stringify(dto)}`);

    return this.getSettings();
  }
}
