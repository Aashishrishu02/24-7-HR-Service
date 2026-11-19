import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryAllocatorService } from './inventory-allocator.service.js';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('InventoryAllocatorService', () => {
  let service: InventoryAllocatorService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {};
    service = new InventoryAllocatorService(mockPrisma);
  });

  it('reserves inventory atomically when matching inventory is available', async () => {
    const mockTx: any = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ord-1',
          status: 'PAID',
          currency: 'INR',
          plan: { cpuCores: 2, ramGb: 4, storageGb: 40 },
        }),
      },
      providerInventory: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inv-1',
          ipAddress: '103.10.10.1',
          status: 'AVAILABLE',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'inv-1',
          ipAddress: '103.10.10.1',
          status: 'RESERVED',
          provider: { id: 'prov-1', code: 'SMARTVPS' },
        }),
      },
    };

    const result = await service.reserveForOrder(mockTx, 'ord-1');
    expect(result.id).toBe('inv-1');
    expect(result.status).toBe('RESERVED');
    expect(mockTx.providerInventory.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: 'AVAILABLE' },
      data: { status: 'RESERVED' },
    });
  });

  it('prevents duplicate allocation under concurrent requests (throws ConflictException if already reserved)', async () => {
    const mockTx: any = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ord-2',
          status: 'PAID',
          currency: 'INR',
          plan: { cpuCores: 2, ramGb: 4, storageGb: 40 },
        }),
      },
      providerInventory: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inv-1',
          ipAddress: '103.10.10.1',
          status: 'AVAILABLE',
        }),
        // Simulate race condition: another concurrent process reserved it first, so count is 0
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await expect(service.reserveForOrder(mockTx, 'ord-2')).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects allocation if order is not in PAID status', async () => {
    const mockTx: any = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ord-3',
          status: 'PENDING',
          currency: 'INR',
          plan: { cpuCores: 2, ramGb: 4, storageGb: 40 },
        }),
      },
    };

    await expect(service.reserveForOrder(mockTx, 'ord-3')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects allocation if no matching inventory is found', async () => {
    const mockTx: any = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ord-4',
          status: 'PAID',
          currency: 'INR',
          plan: { cpuCores: 8, ramGb: 32, storageGb: 500 },
        }),
      },
      providerInventory: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(service.reserveForOrder(mockTx, 'ord-4')).rejects.toThrow(
      NotFoundException,
    );
  });
});
