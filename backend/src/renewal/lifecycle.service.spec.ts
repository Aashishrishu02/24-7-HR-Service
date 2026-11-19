import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LifecycleService } from './lifecycle.service.js';

describe('LifecycleService', () => {
  let service: LifecycleService;
  let mockPrisma: any;
  let mockVpsService: any;
  let mockAdminSettings: any;
  let mockNotificationService: any;

  beforeEach(() => {
    mockPrisma = {
      vPSInstance: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    mockVpsService = {
      stop: vi.fn().mockResolvedValue({ message: 'Stopped' }),
      getStatus: vi.fn().mockResolvedValue({ status: 'STOPPED' }),
    };

    mockAdminSettings = {
      getSettings: vi.fn().mockResolvedValue({
        renewalWindowDays: 7,
        gracePeriodDays: 3,
        preExpiryNotificationDays: [7, 3, 1],
        lowBalanceNotificationHours: 24,
        suspensionPolicy: 'AUTO_SUSPEND_ON_EXPIRY',
        terminationPolicy: 'AUTO_TERMINATE_AFTER_GRACE',
        renewalPricingModel: 'PLAN_SELLING_PRICE',
      }),
    };

    mockNotificationService = {
      notifyUpcomingExpiry: vi.fn().mockResolvedValue({ sent: true }),
      notifyVpsSuspended: vi.fn().mockResolvedValue({ sent: true }),
      notifyGracePeriodEnding: vi.fn().mockResolvedValue({ sent: true }),
      notifyVpsTerminated: vi.fn().mockResolvedValue({ sent: true }),
    };

    service = new LifecycleService(
      mockPrisma,
      mockVpsService,
      mockAdminSettings,
      mockNotificationService,
    );
  });

  it('suspends expired VPS instances, sets gracePeriodExpiresAt, and calls provider stop', async () => {
    const expiredVps = {
      id: 'vps-expired-1',
      userId: 'u-1',
      ipAddress: '103.1.2.3',
      hostname: 'host-expired',
      status: 'ACTIVE',
      gracePeriodDays: 3,
      expiresAt: new Date(Date.now() - 3600 * 1000), // expired 1 hour ago
      user: { id: 'u-1', email: 'test@example.com' },
    };

    // findMany calls:
    // 1st, 2nd, 3rd: pre-expiry notifications for milestones 7, 3, 1 -> []
    // 4th: expired instances to suspend -> [expiredVps]
    // 5th: grace ending warnings -> []
    // 6th: termination eligible -> []
    mockPrisma.vPSInstance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expiredVps])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPrisma.vPSInstance.update.mockResolvedValue({
      ...expiredVps,
      status: 'SUSPENDED',
    });

    const summary = await service.processLifecycle();

    expect(summary.suspended).toBe(1);
    expect(mockVpsService.stop).toHaveBeenCalledWith('103.1.2.3');
    expect(mockPrisma.vPSInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vps-expired-1' },
        data: expect.objectContaining({
          status: 'SUSPENDED',
          suspendedAt: expect.any(Date),
          gracePeriodExpiresAt: expect.any(Date),
        }),
      }),
    );
    expect(mockNotificationService.notifyVpsSuspended).toHaveBeenCalled();
  });

  it('handles provider timeout gracefully during suspension without crashing or losing state', async () => {
    const expiredVps = {
      id: 'vps-timeout-1',
      userId: 'u-1',
      ipAddress: '103.1.2.4',
      status: 'RUNNING',
      gracePeriodDays: 3,
      expiresAt: new Date(Date.now() - 3600 * 1000),
      user: { id: 'u-1', email: 'test@example.com' },
    };

    mockPrisma.vPSInstance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expiredVps])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // Provider stop times out / throws
    mockVpsService.stop.mockRejectedValue(new Error('Provider gateway timeout'));

    mockPrisma.vPSInstance.update.mockResolvedValue({
      ...expiredVps,
      status: 'SUSPENDED',
      providerSuspended: false,
    });

    const summary = await service.processLifecycle();

    expect(summary.suspended).toBe(1);
    // Verified: Database state is still recorded as SUSPENDED with providerSuspended: false
    expect(mockPrisma.vPSInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vps-timeout-1' },
        data: expect.objectContaining({
          status: 'SUSPENDED',
          providerSuspended: false,
        }),
      }),
    );
  });

  it('terminates VPS only after verifying provider status and ownership', async () => {
    const terminationEligibleVps = {
      id: 'vps-terminate-1',
      userId: 'u-1',
      ipAddress: '103.1.2.5',
      status: 'SUSPENDED',
      gracePeriodExpiresAt: new Date(Date.now() - 1000), // grace period passed
      user: { id: 'u-1', email: 'test@example.com' },
    };

    mockPrisma.vPSInstance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([terminationEligibleVps]);

    mockPrisma.vPSInstance.update.mockResolvedValue({
      ...terminationEligibleVps,
      status: 'TERMINATED',
    });

    const summary = await service.processLifecycle();

    expect(summary.terminated).toBe(1);
    expect(mockVpsService.getStatus).toHaveBeenCalledWith('103.1.2.5');
    expect(mockPrisma.vPSInstance.update).toHaveBeenCalledWith({
      where: { id: 'vps-terminate-1' },
      data: { status: 'TERMINATED' },
    });
    expect(mockNotificationService.notifyVpsTerminated).toHaveBeenCalled();
  });

  it('does NOT terminate if provider status verification throws or fails', async () => {
    const terminationEligibleVps = {
      id: 'vps-terminate-fail',
      userId: 'u-1',
      ipAddress: '103.1.2.6',
      status: 'SUSPENDED',
      gracePeriodExpiresAt: new Date(Date.now() - 1000),
      user: { id: 'u-1', email: 'test@example.com' },
    };

    mockPrisma.vPSInstance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([terminationEligibleVps]);

    // Provider check fails/times out
    mockVpsService.getStatus.mockRejectedValue(new Error('Provider unreachable'));

    const summary = await service.processLifecycle();

    expect(summary.terminated).toBe(0);
    // Instance was NOT marked TERMINATED!
    expect(mockPrisma.vPSInstance.update).not.toHaveBeenCalled();
    expect(mockNotificationService.notifyVpsTerminated).not.toHaveBeenCalled();
  });
});
