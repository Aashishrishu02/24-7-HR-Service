import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DedicatedIpSyncService } from './dedicated-ip-sync.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NexaVpsService } from './nexavps.service.js';

describe('DedicatedIpSyncService', () => {
  let service: DedicatedIpSyncService;
  let prisma: any;
  let nexa: any;

  const provider = {
    id: 'provider-nexa-1',
    code: 'NEXAVPS',
    baseUrl: 'https://nexahostvps.com/api/v1/dedicated-ips',
  };

  const catalogue = [
    {
      planId: 'plan-101',
      planName: 'India Dedicated IP',
      categoryId: 'cat-1',
      categoryName: 'India',
      tier: 'PREMIUM',
      tierLabel: 'Premium',
      controlMode: 'STATIC',
      protocol: 'IPV4',
      supportedProtocols: ['HTTP', 'SOCKS5'],
      countryCode: 'IN',
      countryName: 'India',
      location: 'Mumbai',
      duration: '30 Days',
      speed: '1 Gbps',
      minQuantity: 1,
      regularPrice: 1200,
      apiPrice: 900,
      currency: 'INR',
      inStock: true,
      stock: 10,
      defaultSubnet: '192.0.2.0/24',
      poolsCount: 1,
      pools: [
        {
          poolId: 'pool-201',
          poolName: 'Mumbai Pool',
          subnet: '192.0.2.0/24',
          location: 'Mumbai',
          regularPrice: 1200,
          apiPrice: 900,
          currency: 'INR',
          inStock: true,
          stock: 10,
          isDefault: true,
        },
      ],
    },
  ];

  beforeEach(() => {
    prisma = {
      provider: {
        findUnique: vi.fn().mockResolvedValue(provider),
      },
      dedicatedIpSyncState: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      dedicatedIpPlan: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({ id: 'saved-plan-1' }),
      },
      dedicatedIpPool: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (callback: any) => callback(prisma)),
    };

    nexa = {
      getPlans: vi.fn().mockResolvedValue({
        success: true,
        plans: catalogue,
        totalPlans: catalogue.length,
      }),
    };

    service = new DedicatedIpSyncService(
      prisma as unknown as PrismaService,
      nexa as unknown as NexaVpsService,
    );
  });

  it('returns NEVER_SYNCED when no sync state exists', async () => {
    const result = await service.getSyncStatus(provider.id);

    expect(result.status).toBe('NEVER_SYNCED');
    expect(result.syncedPlanCount).toBe(0);
    expect(result.syncedPoolCount).toBe(0);
    expect(result.isSyncInProgress).toBe(false);
  });

  it('returns MIGRATION_PENDING when the sync-state table is missing', async () => {
    const missingTableError = Object.assign(
      new Error('The table does not exist'),
      { code: 'P2021' },
    );
    prisma.dedicatedIpSyncState.findUnique.mockRejectedValue(missingTableError);

    const result = await service.getSyncStatus(provider.id);

    expect(result).toMatchObject({
      providerId: provider.id,
      status: 'MIGRATION_PENDING',
      migrationRequired: true,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: 'Dedicated IP database tables have not been created yet.',
      syncedPlanCount: 0,
      syncedPoolCount: 0,
      isSyncInProgress: false,
    });
  });

  it('rethrows sync status errors other than a missing table', async () => {
    prisma.dedicatedIpSyncState.findUnique.mockRejectedValue(
      Object.assign(new Error('Database connection failed'), { code: 'P1001' }),
    );

    await expect(service.getSyncStatus(provider.id)).rejects.toThrow(
      'Database connection failed',
    );
  });

  it('throws when provider does not exist', async () => {
    prisma.provider.findUnique.mockResolvedValue(null);

    await expect(service.getSyncStatus(provider.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects sync for a provider other than Nexa', async () => {
    prisma.provider.findUnique.mockResolvedValue({
      ...provider,
      code: 'HOSTHEAVEN',
    });

    await expect(service.syncCatalogue(provider.id)).rejects.toThrow(
      BadRequestException,
    );
    expect(nexa.getPlans).not.toHaveBeenCalled();
  });

  it('saves plans and pools and records successful sync', async () => {
    const result = await service.syncCatalogue(provider.id);

    expect(result.success).toBe(true);
    expect(result.syncedPlanCount).toBe(1);
    expect(result.syncedPoolCount).toBe(1);

    expect(nexa.getPlans).toHaveBeenCalledWith(provider.baseUrl);

    expect(prisma.dedicatedIpPlan.updateMany).toHaveBeenCalledWith({
      where: { providerId: provider.id },
      data: { isActive: false },
    });

    expect(prisma.dedicatedIpPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerId_externalPlanId: {
            providerId: provider.id,
            externalPlanId: 'plan-101',
          },
        },
        create: expect.objectContaining({
          planName: 'India Dedicated IP',
          apiPrice: '900',
          inStock: true,
          isActive: true,
        }),
      }),
    );

    expect(prisma.dedicatedIpPool.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          planId_externalPoolId: {
            planId: 'saved-plan-1',
            externalPoolId: 'pool-201',
          },
        },
      }),
    );

    expect(prisma.dedicatedIpSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerId: provider.id },
        create: expect.objectContaining({
          status: 'SUCCESS',
          syncedPlanCount: 1,
          syncedPoolCount: 1,
        }),
      }),
    );
  });

  it('does not overwrite catalogue when Nexa API fails', async () => {
    nexa.getPlans.mockResolvedValue({
      success: false,
      message: 'Provider API unavailable',
      plans: [],
    });

    const result = await service.syncCatalogue(provider.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Provider API unavailable');
    expect(prisma.dedicatedIpPlan.updateMany).not.toHaveBeenCalled();
    expect(prisma.dedicatedIpPlan.upsert).not.toHaveBeenCalled();
    expect(prisma.dedicatedIpPool.upsert).not.toHaveBeenCalled();
  });

  it('rejects an empty catalogue without overwriting saved plans', async () => {
    nexa.getPlans.mockResolvedValue({
      success: true,
      plans: [],
      totalPlans: 0,
    });

    const result = await service.syncCatalogue(provider.id);

    expect(result.success).toBe(false);
    expect(prisma.dedicatedIpPlan.upsert).not.toHaveBeenCalled();
  });

  it('rejects plans without valid external IDs', async () => {
    nexa.getPlans.mockResolvedValue({
      success: true,
      plans: [{ ...catalogue[0], planId: null }],
    });

    const result = await service.syncCatalogue(provider.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain('plan without a valid external ID');
    expect(prisma.dedicatedIpPlan.upsert).not.toHaveBeenCalled();
  });

  it('rejects pools without valid external IDs', async () => {
    nexa.getPlans.mockResolvedValue({
      success: true,
      plans: [
        {
          ...catalogue[0],
          pools: [{ ...catalogue[0].pools[0], poolId: null }],
        },
      ],
    });

    const result = await service.syncCatalogue(provider.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain('IP pool without a valid external ID');
    expect(prisma.dedicatedIpPlan.upsert).not.toHaveBeenCalled();
  });

  it('records failed sync state when a database transaction fails', async () => {
    prisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

    const result = await service.syncCatalogue(provider.id);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Transaction failed');
    expect(prisma.dedicatedIpSyncState.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'FAILED',
          lastError: 'Transaction failed',
        }),
      }),
    );
  });
});
