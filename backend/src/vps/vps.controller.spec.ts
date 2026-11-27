import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VpsController } from './vps.controller.js';
import { NotFoundException } from '@nestjs/common';

describe('VpsController', () => {
  let controller: VpsController;
  let mockVpsService: any;
  let mockPrisma: any;
  let mockRenewalService: any;

  beforeEach(() => {
    mockVpsService = {
      getIpStock: vi.fn(),
      getOsTemplate: vi.fn(),
      buy: vi.fn(),
      getStatus: vi.fn(),
      start: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
      stop: vi.fn().mockResolvedValue({ status: 'STOPPED' }),
      changeOs: vi.fn().mockResolvedValue({ os: 'ubuntu' }),
    };

    mockPrisma = {
      vPSInstance: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    mockRenewalService = {
      updateAutoRenewConsent: vi.fn().mockResolvedValue({ autoRenew: true }),
      getVpsRenewalDetails: vi.fn().mockResolvedValue({ autoRenew: true, renewalPrice: 999 }),
      renewVpsManual: vi.fn().mockResolvedValue({ message: 'Success' }),
    };

    controller = new VpsController(
      mockVpsService,
      mockPrisma,
      mockRenewalService,
    );
  });

  it('delegates updateAutoRenew to renewalService with req.user.sub', async () => {
    const req: any = { user: { sub: 'cust-1' } };
    const result = await controller.updateAutoRenew('vps-1', { enabled: true, consent: true }, req);

    expect(result).toEqual({ autoRenew: true });
    expect(mockRenewalService.updateAutoRenewConsent).toHaveBeenCalledWith(
      'cust-1',
      'vps-1',
      true,
      true,
    );
  });

  it('delegates getRenewalDetails to renewalService with req.user.sub', async () => {
    const req: any = { user: { sub: 'cust-1' } };
    const result = await controller.getRenewalDetails('vps-1', req);

    expect(result).toEqual({ autoRenew: true, renewalPrice: 999 });
    expect(mockRenewalService.getVpsRenewalDetails).toHaveBeenCalledWith('cust-1', 'vps-1');
  });

  it('delegates renewVps to renewalService with req.user.sub', async () => {
    const req: any = { user: { sub: 'cust-1' } };
    const result = await controller.renewVps('vps-1', req);

    expect(result).toEqual({ message: 'Success' });
    expect(mockRenewalService.renewVpsManual).toHaveBeenCalledWith('cust-1', 'vps-1');
  });

  it('starts VPS with ownership check and updates status', async () => {
    mockPrisma.vPSInstance.findFirst.mockResolvedValue({
      id: 'vps-1',
      userId: 'cust-1',
      ipAddress: '103.1.1.1',
      provider: 'SMARTVPS',
    });
    mockPrisma.vPSInstance.update.mockResolvedValue({});

    const req: any = { user: { sub: 'cust-1' } };
    const result = await controller.startVps('vps-1', req);

    expect(result.message).toBe('VPS start request submitted');
    expect(mockVpsService.start).toHaveBeenCalledWith('103.1.1.1');
    expect(mockPrisma.vPSInstance.update).toHaveBeenCalledWith({
      where: { id: 'vps-1' },
      data: { status: 'RUNNING' },
    });
  });

  it('stops VPS with ownership check and updates status', async () => {
    mockPrisma.vPSInstance.findFirst.mockResolvedValue({
      id: 'vps-1',
      userId: 'cust-1',
      ipAddress: '103.1.1.1',
      provider: 'SMARTVPS',
    });
    mockPrisma.vPSInstance.update.mockResolvedValue({});

    const req: any = { user: { sub: 'cust-1' } };
    const result = await controller.stopVps('vps-1', req);

    expect(result.message).toBe('VPS stop request submitted');
    expect(mockVpsService.stop).toHaveBeenCalledWith('103.1.1.1');
    expect(mockPrisma.vPSInstance.update).toHaveBeenCalledWith({
      where: { id: 'vps-1' },
      data: { status: 'STOPPED' },
    });
  });

  it('enforces ownership: throws NotFoundException if user does not own VPS', async () => {
    mockPrisma.vPSInstance.findFirst.mockResolvedValue(null);

    const req: any = { user: { sub: 'cust-unauthorized' } };
    await expect(controller.startVps('vps-1', req)).rejects.toThrow(NotFoundException);
  });
});
