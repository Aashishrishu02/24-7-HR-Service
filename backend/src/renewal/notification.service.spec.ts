import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService } from './notification.service.js';

describe('NotificationService', () => {
  let service: NotificationService;
  let mockPrisma: any;
  let mockEmailService: any;

  beforeEach(() => {
    mockPrisma = {
      notificationLog: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    mockEmailService = {
      sendNotificationEmail: vi.fn().mockResolvedValue({ success: true }),
    };

    service = new NotificationService(mockPrisma, mockEmailService);
  });

  it('sends upcoming expiry notification and logs it with unique idempotencyKey', async () => {
    mockPrisma.notificationLog.findUnique.mockResolvedValue(null);
    mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log-1' });

    const user = { id: 'u-1', email: 'test@example.com', name: 'John Doe' };
    const vps = { id: 'vps-1', ipAddress: '103.10.10.1', hostname: 'host-1', expiresAt: new Date('2026-12-01') };

    const result = await service.notifyUpcomingExpiry(user, vps, 3);
    expect(result.sent).toBe(true);
    expect(mockEmailService.sendNotificationEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringContaining('expires in 3 days'),
      expect.any(String),
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-1',
        vpsId: 'vps-1',
        type: 'EXPIRY_WARNING',
        idempotencyKey: 'notif-expiry:vps-1:2026-12-01:3d',
      }),
    });
  });

  it('skips duplicate notifications idempotently when idempotencyKey already exists', async () => {
    mockPrisma.notificationLog.findUnique.mockResolvedValue({
      id: 'log-existing',
      idempotencyKey: 'notif-expiry:vps-1:2026-12-01:3d',
    });

    const user = { id: 'u-1', email: 'test@example.com', name: 'John Doe' };
    const vps = { id: 'vps-1', ipAddress: '103.10.10.1', hostname: 'host-1', expiresAt: new Date('2026-12-01') };

    const result = await service.notifyUpcomingExpiry(user, vps, 3);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('ALREADY_SENT');
    expect(mockEmailService.sendNotificationEmail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it('sends insufficient balance notification with renewal amount, balance, and shortfall', async () => {
    mockPrisma.notificationLog.findUnique.mockResolvedValue(null);
    mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log-insufficient' });

    const user = { id: 'u-1', email: 'test@example.com', name: 'John Doe' };
    const vps = { id: 'vps-1', ipAddress: '103.10.10.1', hostname: 'host-1', expiresAt: new Date('2026-12-01') };

    const result = await service.notifyInsufficientBalance(user, vps, 999, 200, 799);
    expect(result.sent).toBe(true);
    expect(mockEmailService.sendNotificationEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringContaining('Insufficient Wallet Balance'),
      expect.stringContaining('₹799'),
    );
  });

  it('sends renewal success notification', async () => {
    mockPrisma.notificationLog.findUnique.mockResolvedValue(null);
    mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log-success' });

    const user = { id: 'u-1', email: 'test@example.com', name: 'John Doe' };
    const vps = { id: 'vps-1', ipAddress: '103.10.10.1', hostname: 'host-1' };

    const result = await service.notifyRenewalSuccess(user, vps, 999, new Date('2027-01-01'), 'cycle-2026');
    expect(result.sent).toBe(true);
    expect(mockEmailService.sendNotificationEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringContaining('Auto-Renewal Successful'),
      expect.any(String),
    );
  });

  it('sends suspension notification with grace period details', async () => {
    mockPrisma.notificationLog.findUnique.mockResolvedValue(null);
    mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log-suspended' });

    const user = { id: 'u-1', email: 'test@example.com' };
    const vps = { id: 'vps-1', ipAddress: '103.10.10.1', hostname: 'host-1' };

    const result = await service.notifyVpsSuspended(user, vps, new Date('2026-12-05'));
    expect(result.sent).toBe(true);
    expect(mockEmailService.sendNotificationEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringContaining('Service Suspended'),
      expect.stringContaining('2026-12-05'),
    );
  });

  it('sends termination notification', async () => {
    mockPrisma.notificationLog.findUnique.mockResolvedValue(null);
    mockPrisma.notificationLog.create.mockResolvedValue({ id: 'log-terminated' });

    const user = { id: 'u-1', email: 'test@example.com' };
    const vps = { id: 'vps-1', ipAddress: '103.10.10.1', hostname: 'host-1' };

    const result = await service.notifyVpsTerminated(user, vps);
    expect(result.sent).toBe(true);
    expect(mockEmailService.sendNotificationEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringContaining('Service Terminated'),
      expect.any(String),
    );
  });
});
