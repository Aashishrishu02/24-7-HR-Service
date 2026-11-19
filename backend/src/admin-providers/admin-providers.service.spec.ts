import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminProvidersService } from './admin-providers.service.js';
import { NotFoundException } from '@nestjs/common';

describe('AdminProvidersService (Backend-Only Integration Architecture)', () => {
  let service: AdminProvidersService;
  let mockPrisma: any;
  let mockHostHeaven: any;
  let mockVpsService: any;

  beforeEach(() => {
    mockPrisma = {
      provider: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    mockHostHeaven = {
      testConnection: vi.fn(),
    };

    mockVpsService = {
      getIpStock: vi.fn(),
    };

    service = new AdminProvidersService(
      mockPrisma,
      mockHostHeaven as any,
      mockVpsService as any,
    );
  });

  it('lists integrated backend providers without credential management forms', async () => {
    mockPrisma.provider.findMany.mockResolvedValue([
      { id: 'p-1', name: 'SmartVPS', code: 'SMARTVPS', isActive: true, priority: 1 },
      { id: 'p-2', name: 'HostHeaven', code: 'HOSTHEAVEN', isActive: true, priority: 2 },
    ]);

    const result = await service.findAll();
    expect(result.total).toBe(2);
    expect(result.providers).toHaveLength(2);
    expect(result.providers[0].code).toBe('SMARTVPS');
    expect(result.providers[1].code).toBe('HOSTHEAVEN');
    // Ensure no generic credential properties are returned
    expect((result.providers[0] as any).credential).toBeUndefined();
    expect((result.providers[0] as any).passwordEncrypted).toBeUndefined();
  });

  it('returns single provider details or throws NotFoundException', async () => {
    mockPrisma.provider.findUnique.mockResolvedValue(null);
    await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
  });

  it('toggles platform active status for integrated provider', async () => {
    mockPrisma.provider.findUnique.mockResolvedValue({
      id: 'p-1',
      name: 'SmartVPS',
      isActive: true,
    });
    mockPrisma.provider.update.mockResolvedValue({
      id: 'p-1',
      name: 'SmartVPS',
      isActive: false,
    });

    const result = await service.updateStatus('p-1', false);
    expect(result.isActive).toBe(false);
    expect(mockPrisma.provider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p-1' },
        data: { isActive: false },
      }),
    );
  });

  it('delegates testConnection to HostHeavenService for HOSTHEAVEN provider', async () => {
    mockPrisma.provider.findUnique.mockResolvedValue({
      id: 'p-hh',
      name: 'HostHeaven',
      code: 'HOSTHEAVEN',
    });
    mockHostHeaven.testConnection.mockResolvedValue({
      success: true,
      connected: true,
      message: 'HostHeaven connection verified successfully',
      wallet: { balance: 25000, currency: 'INR' },
    });

    const result = await service.testConnection('p-hh');
    expect(mockHostHeaven.testConnection).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.connected).toBe(true);
    expect(result.wallet.balance).toBe(25000);
  });

  it('delegates testConnection to VpsService for SMARTVPS provider', async () => {
    mockPrisma.provider.findUnique.mockResolvedValue({
      id: 'p-smart',
      name: 'SmartVPS',
      code: 'SMARTVPS',
      currency: 'INR',
    });
    mockVpsService.getIpStock.mockResolvedValue({ availableIps: ['103.1.1.1'] });

    const result = await service.testConnection('p-smart');
    expect(mockVpsService.getIpStock).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.connected).toBe(true);
    expect(result.message).toContain('SmartVPS provider connection verified');
  });

  it('fails closed when provider has no backend integration adapter', async () => {
    mockPrisma.provider.findUnique.mockResolvedValue({
      id: 'p-unknown',
      name: 'GenericCloud',
      code: 'GENERIC_CLOUD',
    });

    const result = await service.testConnection('p-unknown');
    expect(result.success).toBe(false);
    expect(result.connected).toBe(false);
    expect(result.message).toContain('no backend integration service');
  });

  it('ensures generic credential creation and editing methods do not exist', () => {
    expect((service as any).create).toBeUndefined();
    expect((service as any).update).toBeUndefined();
    expect((service as any).encrypt).toBeUndefined();
    expect((service as any).encryptCredentials).toBeUndefined();
  });
});
