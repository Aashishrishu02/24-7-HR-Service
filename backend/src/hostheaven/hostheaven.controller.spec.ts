import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { HostHeavenController } from './hostheaven.controller.js';
import { HostHeavenService } from './hostheaven.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('HostHeavenController', () => {
  let controller: HostHeavenController;
  let service: HostHeavenService;
  let prisma: PrismaService;

  const mockUserReq = {
    user: {
      sub: 'user-uuid-1',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    },
  } as any;

  beforeEach(() => {
    service = {
      testConnection: vi.fn().mockResolvedValue({
        success: true,
        connected: true,
        mode: 'REAL',
        wallet: { balance: 25000, currency: 'INR' },
      }),
      getZones: vi.fn().mockResolvedValue([
        { id: 'zone-1', name: 'Delhi NCR' },
      ]),
      getZoneIsos: vi.fn().mockResolvedValue([
        { id: 'iso-1', isoName: 'Ubuntu 22.04' },
      ]),
      getCompletePricing: vi.fn().mockResolvedValue({
        shared: { cpu: [], ram: [], disk: [], bandwidth: [] },
        dedicated: { cpu: [], ram: [], disk: [], bandwidth: [] },
      }),
      getWalletBalance: vi.fn().mockResolvedValue({ balance: 25000, currency: 'INR' }),
      getOrderOverview: vi.fn().mockResolvedValue({ totalOrders: 1 }),
      getVmDetails: vi.fn().mockResolvedValue({
        vmId: 'vm-101',
        ipAddress: '103.1.1.1',
        status: 'RUNNING',
      }),
      getVmLockStatus: vi.fn().mockResolvedValue({
        vmId: 'vm-101',
        isLocked: false,
        status: 'UNLOCKED',
      }),
      getVmMetrics: vi.fn().mockResolvedValue({
        vmId: 'vm-101',
        cpu: { usagePercent: 20 },
      }),
      getVmStorage: vi.fn().mockResolvedValue({
        vmId: 'vm-101',
        drives: [],
      }),
      controlVm: vi.fn().mockResolvedValue({
        success: true,
        action: 'start',
        vmId: 'vm-101',
      }),
      rebuildVm: vi.fn().mockResolvedValue({
        success: true,
        vmId: 'vm-101',
        isoId: 'iso-1',
      }),
      changeVmPassword: vi.fn().mockResolvedValue({
        success: true,
        vmId: 'vm-101',
        message: 'Password updated',
      }),
      getUpgradePricing: vi.fn().mockResolvedValue({ vmId: 'vm-101' }),
      calculateRenewal: vi.fn().mockResolvedValue({
        originalAmount: 850,
        payableAmount: 850,
      }),
    } as unknown as HostHeavenService;

    prisma = {
      vPSInstance: {
        findFirst: vi.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'owned-vps-id' && where.userId === 'user-uuid-1') {
            return Promise.resolve({
              id: 'owned-vps-id',
              userId: 'user-uuid-1',
              provider: 'HOSTHEAVEN',
              providerVpsId: 'hh-vm-101',
              ipAddress: '103.1.1.1',
              status: 'RUNNING',
            });
          }
          return Promise.resolve(null);
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;

    controller = new HostHeavenController(service, prisma);
  });

  describe('Admin Endpoints', () => {
    it('adminConnectionTest should return connection test result', async () => {
      const result = await controller.adminConnectionTest();
      expect(result.connected).toBe(true);
      expect(result.wallet.balance).toBe(25000);
      expect(service.testConnection).toHaveBeenCalled();
    });

    it('adminCatalogue should return combined zones, pricing and wallet', async () => {
      const result = await controller.adminCatalogue();
      expect(result.zones).toHaveLength(1);
      expect(result.wallet.balance).toBe(25000);
    });

    it('adminOrders should return orders overview', async () => {
      const result = await controller.adminOrders();
      expect((result as any).totalOrders).toBe(1);
    });
  });

  describe('Customer Catalogue Endpoints', () => {
    it('should return zones and ISOs', async () => {
      const zones = await controller.getZones();
      expect(zones).toHaveLength(1);

      const isos = await controller.getZoneIsos('zone-1');
      expect(isos).toHaveLength(1);
    });
  });

  describe('Customer VPS Ownership & Controls', () => {
    it('should allow customer to get details of owned VPS', async () => {
      const details = await controller.getVmDetails('owned-vps-id', mockUserReq);
      expect(details.ipAddress).toBe('103.1.1.1');
      expect(service.getVmDetails).toHaveBeenCalledWith('hh-vm-101');
    });

    it('should reject access to unowned or nonexistent VPS with 404', async () => {
      await expect(
        controller.getVmDetails('foreign-vps-id', mockUserReq),
      ).rejects.toThrow(NotFoundException);
    });

    it('should execute power action on owned VPS', async () => {
      const res = await controller.controlVm(
        'owned-vps-id',
        { action: 'start' },
        mockUserReq,
      );
      expect(res.success).toBe(true);
      expect(service.controlVm).toHaveBeenCalledWith(
        'user-uuid-1',
        'hh-vm-101',
        'start',
      );
    });

    it('should reject control without action', async () => {
      await expect(
        controller.controlVm('owned-vps-id', { action: '' }, mockUserReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update root password with minimum length', async () => {
      const res = await controller.changeVmPassword(
        'owned-vps-id',
        { password: 'NewSecurePassword123!' },
        mockUserReq,
      );
      expect(res.success).toBe(true);

      await expect(
        controller.changeVmPassword('owned-vps-id', { password: 'short' }, mockUserReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate renewal for owned VPS', async () => {
      const res = await controller.calculateRenewal(
        'owned-vps-id',
        { monthsToAdd: 2 },
        mockUserReq,
      );
      expect(res.payableAmount).toBe(850);
      expect(service.calculateRenewal).toHaveBeenCalledWith(
        expect.objectContaining({ vmId: 'hh-vm-101', monthsToAdd: 2 }),
      );
    });
  });
});
