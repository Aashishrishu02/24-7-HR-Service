import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminSettingsService } from './admin-settings.service.js';

describe('AdminSettingsService', () => {
  let service: AdminSettingsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      systemSetting: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
    };

    service = new AdminSettingsService(mockPrisma);
  });

  it('returns default renewal settings when database has no stored settings', async () => {
    mockPrisma.systemSetting.findMany.mockResolvedValue([]);

    const settings = await service.getSettings();
    expect(settings.renewalWindowDays).toBe(7);
    expect(settings.gracePeriodDays).toBe(3);
    expect(settings.preExpiryNotificationDays).toEqual([7, 3, 1]);
    expect(settings.lowBalanceNotificationHours).toBe(24);
    expect(settings.suspensionPolicy).toBe('AUTO_SUSPEND_ON_EXPIRY');
    expect(settings.terminationPolicy).toBe('AUTO_TERMINATE_AFTER_GRACE');
    expect(settings.renewalPricingModel).toBe('PLAN_SELLING_PRICE');
    expect(settings.nexaVpsProfitMarginPercent).toBe(20);
    expect(settings.smartVpsProfitMarginPercent).toBe(20);
    expect(settings.dedicatedIpEnabled).toBe(false);
  });


  it('saves Nexa profit margin independently from HostHeaven margin', async () => {
    mockPrisma.systemSetting.upsert.mockResolvedValue({});
    mockPrisma.systemSetting.findMany.mockResolvedValue([
      { key: 'NEXAVPS_PROFIT_MARGIN_PERCENT', value: '35.5' },
      { key: 'HOSTHEAVEN_PROFIT_MARGIN_PERCENT', value: '20' },
    ]);

    const updated = await service.updateSettings({
      nexaVpsProfitMarginPercent: 35.5,
    });

    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'NEXAVPS_PROFIT_MARGIN_PERCENT' },
        create: expect.objectContaining({ value: '35.5' }),
      }),
    );
    expect(updated.nexaVpsProfitMarginPercent).toBe(35.5);
    expect(updated.hostHeavenProfitMarginPercent).toBe(20);
  });



  it('saves SmartVPS profit margin independently from Nexa and HostHeaven', async () => {
    mockPrisma.systemSetting.upsert.mockResolvedValue({});
    mockPrisma.systemSetting.findMany.mockResolvedValue([
      { key: 'SMARTVPS_PROFIT_MARGIN_PERCENT', value: '32.5' },
      { key: 'NEXAVPS_PROFIT_MARGIN_PERCENT', value: '35' },
      { key: 'HOSTHEAVEN_PROFIT_MARGIN_PERCENT', value: '20' },
    ]);

    const updated = await service.updateSettings({
      smartVpsProfitMarginPercent: 32.5,
    });

    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'SMARTVPS_PROFIT_MARGIN_PERCENT' },
        create: expect.objectContaining({ value: '32.5' }),
      }),
    );
    expect(updated.smartVpsProfitMarginPercent).toBe(32.5);
    expect(updated.nexaVpsProfitMarginPercent).toBe(35);
    expect(updated.hostHeavenProfitMarginPercent).toBe(20);
  });

  it('saves Dedicated IP availability independently', async () => {
    mockPrisma.systemSetting.upsert.mockResolvedValue({});
    mockPrisma.systemSetting.findMany.mockResolvedValue([
      { key: 'DEDICATED_IP_ENABLED', value: 'true' },
      { key: 'NEXAVPS_PROFIT_MARGIN_PERCENT', value: '35' },
    ]);

    const updated = await service.updateSettings({
      dedicatedIpEnabled: true,
    });

    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'DEDICATED_IP_ENABLED' },
        create: expect.objectContaining({ value: 'true' }),
      }),
    );
    expect(updated.dedicatedIpEnabled).toBe(true);
    expect(updated.nexaVpsProfitMarginPercent).toBe(35);
  });

  it('updates and persists settings into SystemSetting table', async () => {
    mockPrisma.systemSetting.upsert.mockResolvedValue({});
    mockPrisma.systemSetting.findMany.mockResolvedValue([
      { key: 'RENEWAL_WINDOW_DAYS', value: '5' },
      { key: 'GRACE_PERIOD_DAYS', value: '4' },
      { key: 'PRE_EXPIRY_NOTIFICATION_DAYS', value: '5,2' },
    ]);

    const updated = await service.updateSettings({
      renewalWindowDays: 5,
      gracePeriodDays: 4,
      preExpiryNotificationDays: '5,2',
    });

    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'RENEWAL_WINDOW_DAYS' },
        create: expect.objectContaining({ value: '5' }),
      }),
    );
    expect(updated.renewalWindowDays).toBe(5);
    expect(updated.gracePeriodDays).toBe(4);
    expect(updated.preExpiryNotificationDays).toEqual([5, 2]);
  });
});
