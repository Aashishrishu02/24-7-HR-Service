import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenewalAdminController } from './renewal-admin.controller.js';

describe('RenewalAdminController', () => {
  let controller: RenewalAdminController;
  let mockAdminSettings: any;
  let mockRenewalService: any;
  let mockLifecycleService: any;
  let mockSchedulerService: any;

  beforeEach(() => {
    mockAdminSettings = {
      getSettings: vi.fn().mockResolvedValue({ renewalWindowDays: 7 }),
      updateSettings: vi.fn().mockResolvedValue({ renewalWindowDays: 5 }),
    };

    mockRenewalService = {
      getUpcomingRenewals: vi.fn().mockResolvedValue([]),
      getRenewalHistory: vi.fn().mockResolvedValue({ attempts: [], total: 0 }),
      getInsufficientBalanceCases: vi.fn().mockResolvedValue([]),
      processAutoRenewals: vi.fn().mockResolvedValue({ renewed: 1 }),
      retryRenewal: vi.fn().mockResolvedValue({ message: 'Success' }),
    };

    mockLifecycleService = {
      getSuspendedInstances: vi.fn().mockResolvedValue([]),
      getTerminationPendingInstances: vi.fn().mockResolvedValue([]),
      processLifecycle: vi.fn().mockResolvedValue({ suspended: 0 }),
      retryLifecycleAction: vi.fn().mockResolvedValue({ message: 'Done' }),
    };

    mockSchedulerService = {
      runScheduledCycle: vi.fn().mockResolvedValue({ timestamp: new Date() }),
    };

    controller = new RenewalAdminController(
      mockAdminSettings,
      mockRenewalService,
      mockLifecycleService,
      mockSchedulerService,
    );
  });

  it('delegates getSettings and updateSettings to AdminSettingsService', async () => {
    const settings = await controller.getSettings();
    expect(settings).toEqual({ renewalWindowDays: 7 });

    const updated = await controller.updateSettings({ renewalWindowDays: 5 });
    expect(updated).toEqual({ renewalWindowDays: 5 });
    expect(mockAdminSettings.updateSettings).toHaveBeenCalledWith({ renewalWindowDays: 5 });
  });

  it('delegates renewal admin operations to RenewalService', async () => {
    await controller.getUpcomingRenewals();
    expect(mockRenewalService.getUpcomingRenewals).toHaveBeenCalled();

    await controller.getRenewalHistory('SUCCESS', '1', '10');
    expect(mockRenewalService.getRenewalHistory).toHaveBeenCalledWith('SUCCESS', 1, 10);

    await controller.getInsufficientBalanceCases();
    expect(mockRenewalService.getInsufficientBalanceCases).toHaveBeenCalled();

    await controller.triggerRenewalCycle();
    expect(mockRenewalService.processAutoRenewals).toHaveBeenCalled();

    await controller.retryRenewal('vps-uuid-1');
    expect(mockRenewalService.retryRenewal).toHaveBeenCalledWith('vps-uuid-1');
  });

  it('delegates lifecycle admin operations to LifecycleService', async () => {
    await controller.getSuspendedInstances();
    expect(mockLifecycleService.getSuspendedInstances).toHaveBeenCalled();

    await controller.getTerminationPendingInstances();
    expect(mockLifecycleService.getTerminationPendingInstances).toHaveBeenCalled();

    await controller.triggerLifecycleCycle();
    expect(mockLifecycleService.processLifecycle).toHaveBeenCalled();

    await controller.retrySuspend('vps-uuid-1');
    expect(mockLifecycleService.retryLifecycleAction).toHaveBeenCalledWith('vps-uuid-1', 'SUSPEND');

    await controller.retryTerminate('vps-uuid-1');
    expect(mockLifecycleService.retryLifecycleAction).toHaveBeenCalledWith('vps-uuid-1', 'TERMINATE');
  });
});
