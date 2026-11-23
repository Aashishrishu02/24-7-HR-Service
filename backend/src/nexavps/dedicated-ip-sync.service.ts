import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NexaVpsService } from './nexavps.service.js';

@Injectable()
export class DedicatedIpSyncService {
  private readonly logger = new Logger(DedicatedIpSyncService.name);
  private isSyncInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nexaVpsService: NexaVpsService,
  ) {}

  private toNullableString(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    return String(value);
  }

  private toNullablePrice(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : null;
  }

  private toNullableInt(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  async getSyncStatus(providerId: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true, code: true },
    });

    if (!provider) throw new NotFoundException('Provider not found');

    if (provider.code !== 'NEXAVPS') {
      throw new BadRequestException('This provider does not support Dedicated IP sync');
    }

    let state: any;

    try {
      state = await this.prisma.dedicatedIpSyncState.findUnique({
        where: { providerId },
      });
    } catch (error) {
      const prismaCode =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: string }).code
          : undefined;

      if (prismaCode !== 'P2021') {
        throw error;
      }

      this.logger.warn(
        'Dedicated IP sync status unavailable because its database table is missing.',
      );

      return {
        providerId,
        status: 'MIGRATION_PENDING',
        migrationRequired: true,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: 'Dedicated IP database tables have not been created yet.',
        syncedPlanCount: 0,
        syncedPoolCount: 0,
        isSyncInProgress: false,
      };
    }

    return {
      providerId,
      status: state?.status ?? 'NEVER_SYNCED',
      migrationRequired: false,
      lastAttemptAt: state?.lastAttemptAt ?? null,
      lastSuccessAt: state?.lastSuccessAt ?? null,
      lastError: state?.lastError ?? null,
      syncedPlanCount: state?.syncedPlanCount ?? 0,
      syncedPoolCount: state?.syncedPoolCount ?? 0,
      isSyncInProgress: this.isSyncInProgress,
    };
  }

  async syncCatalogue(providerId: string) {
    if (this.isSyncInProgress) {
      return {
        success: false,
        message: 'A Dedicated IP catalogue sync is already running.',
      };
    }

    this.isSyncInProgress = true;

    let provider: { id: string; code: string; baseUrl: string | null } | null = null;

    try {
      provider = await this.prisma.provider.findUnique({
        where: { id: providerId },
        select: { id: true, code: true, baseUrl: true },
      });

      if (!provider) throw new NotFoundException('Provider not found');

      if (provider.code !== 'NEXAVPS') {
        throw new BadRequestException('Nexa VPS provider not found');
      }
    } catch (error) {
      this.isSyncInProgress = false;
      throw error;
    }

    const attemptedAt = new Date();

    try {
      await this.prisma.dedicatedIpSyncState.upsert({
        where: { providerId },
        create: {
          providerId,
          status: 'IN_PROGRESS',
          lastAttemptAt: attemptedAt,
          lastError: null,
        },
        update: {
          status: 'IN_PROGRESS',
          lastAttemptAt: attemptedAt,
          lastError: null,
        },
      });

      const result = await this.nexaVpsService.getPlans(
        provider.baseUrl || undefined,
      );

      if (!result.success || !Array.isArray(result.plans) || result.plans.length === 0) {
        throw new Error(
          result.message || 'Nexa returned an empty or invalid Dedicated IP catalogue.',
        );
      }

      const plans = result.plans;

      for (const plan of plans) {
        if (plan.planId === null || plan.planId === undefined || String(plan.planId).trim() === '') {
          throw new Error('Nexa catalogue contains a plan without a valid external ID.');
        }

        for (const pool of plan.pools ?? []) {
          if (pool.poolId === null || pool.poolId === undefined || String(pool.poolId).trim() === '') {
            throw new Error('Nexa catalogue contains an IP pool without a valid external ID.');
          }
        }
      }

      const syncedAt = new Date();

      const stats = await this.prisma.$transaction(async (tx) => {
        await tx.dedicatedIpPlan.updateMany({
          where: { providerId },
          data: { isActive: false },
        });

        let syncedPoolCount = 0;

        for (const plan of plans) {
          const externalPlanId = String(plan.planId).trim();
          const pools = plan.pools ?? [];

          const planData = {
            planName: String(plan.planName || 'Unnamed plan'),
            categoryId: this.toNullableString(plan.categoryId),
            categoryName: this.toNullableString(plan.categoryName),
            tier: this.toNullableString(plan.tier),
            tierLabel: this.toNullableString(plan.tierLabel),
            controlMode: this.toNullableString(plan.controlMode),
            protocol: this.toNullableString(plan.protocol),
            supportedProtocols: Array.isArray(plan.supportedProtocols)
              ? plan.supportedProtocols.filter(
                  (item): item is string => typeof item === 'string',
                )
              : [],
            countryCode: this.toNullableString(plan.countryCode),
            countryName: this.toNullableString(plan.countryName),
            location: this.toNullableString(plan.location),
            duration: this.toNullableString(plan.duration),
            speed: this.toNullableString(plan.speed),
            minQuantity: this.toNullableInt(plan.minQuantity),
            regularPrice: this.toNullablePrice(plan.regularPrice),
            apiPrice: this.toNullablePrice(plan.apiPrice),
            currency: String(plan.currency || 'INR'),
            inStock: plan.inStock === true,
            isActive: true,
            stock: this.toNullableInt(plan.stock),
            defaultSubnet: this.toNullableString(plan.defaultSubnet),
            poolsCount: this.toNullableInt(plan.poolsCount) ?? pools.length,
            lastSyncedAt: syncedAt,
          };

          const savedPlan = await tx.dedicatedIpPlan.upsert({
            where: {
              providerId_externalPlanId: {
                providerId,
                externalPlanId,
              },
            },
            create: {
              providerId,
              externalPlanId,
              ...planData,
            },
            update: planData,
            select: { id: true },
          });

          for (const pool of pools) {
            const externalPoolId = String(pool.poolId).trim();

            const poolData = {
              poolName: this.toNullableString(pool.poolName),
              subnet: this.toNullableString(pool.subnet),
              location: this.toNullableString(pool.location),
              regularPrice: this.toNullablePrice(pool.regularPrice),
              apiPrice: this.toNullablePrice(pool.apiPrice),
              currency: String(pool.currency || plan.currency || 'INR'),
              inStock: pool.inStock === true,
              stock: this.toNullableInt(pool.stock),
              isDefault: pool.isDefault === true,
              lastSyncedAt: syncedAt,
            };

            await tx.dedicatedIpPool.upsert({
              where: {
                planId_externalPoolId: {
                  planId: savedPlan.id,
                  externalPoolId,
                },
              },
              create: {
                planId: savedPlan.id,
                externalPoolId,
                ...poolData,
              },
              update: poolData,
            });

            syncedPoolCount++;
          }
        }

        await tx.dedicatedIpSyncState.upsert({
          where: { providerId },
          create: {
            providerId,
            status: 'SUCCESS',
            lastAttemptAt: attemptedAt,
            lastSuccessAt: syncedAt,
            lastError: null,
            syncedPlanCount: plans.length,
            syncedPoolCount,
          },
          update: {
            status: 'SUCCESS',
            lastAttemptAt: attemptedAt,
            lastSuccessAt: syncedAt,
            lastError: null,
            syncedPlanCount: plans.length,
            syncedPoolCount,
          },
        });

        return {
          syncedPlanCount: plans.length,
          syncedPoolCount,
        };
      });

      this.logger.log(
        `Nexa Dedicated IP sync completed: ${stats.syncedPlanCount} plans, ${stats.syncedPoolCount} pools.`,
      );

      return {
        success: true,
        message: 'Dedicated IP catalogue synchronized successfully.',
        ...stats,
        syncedAt: syncedAt.toISOString(),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'Unknown Dedicated IP synchronization error';

      this.logger.error(`Nexa Dedicated IP sync failed: ${message}`);

      try {
        await this.prisma.dedicatedIpSyncState.upsert({
          where: { providerId },
          create: {
            providerId,
            status: 'FAILED',
            lastAttemptAt: attemptedAt,
            lastError: message,
          },
          update: {
            status: 'FAILED',
            lastAttemptAt: attemptedAt,
            lastError: message,
          },
        });
      } catch (stateError) {
        this.logger.error('Could not save Dedicated IP sync failure status.');
      }

      return {
        success: false,
        message: 'Dedicated IP catalogue synchronization failed.',
        error: message,
      };
    } finally {
      this.isSyncInProgress = false;
    }
  }
}
