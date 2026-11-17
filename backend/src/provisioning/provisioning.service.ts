import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryAllocatorService } from './inventory-allocator.service.js';

@Injectable()
export class ProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryAllocator: InventoryAllocatorService,
  ) {}

  async provisionOrder(orderId: string) {
    const idempotencyKey = `vps-provision:${orderId}`;

    const existingJob = await this.prisma.provisioningJob.findUnique({
      where: { idempotencyKey },
      include: {
        order: {
          include: {
            vpsInstance: true,
          },
        },
        inventory: true,
      },
    });

    if (existingJob) {
      if (existingJob.status === 'COMPLETED') {
        return {
          message: 'Order has already been provisioned',
          job: existingJob,
          vps: existingJob.order.vpsInstance,
        };
      }

      throw new ConflictException(
        `Provisioning job already exists with status ${existingJob.status}. Reconciliation is required.`,
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        vpsInstance: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'PAID') {
      throw new BadRequestException(
        'Only paid orders can be provisioned',
      );
    }

    if (order.vpsInstance) {
      throw new ConflictException(
        'A VPS instance is already linked to this order',
      );
    }

    let job;

    try {
      job = await this.prisma.provisioningJob.create({
        data: {
          orderId,
          idempotencyKey,
          source: 'INVENTORY',
          status: 'CHECKING_INVENTORY',
          attemptNumber: 1,
          startedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A provisioning request for this order already exists',
        );
      }

      throw error;
    }

    try {
      // Reserve inventory and update the job atomically.
      const inventory = await this.prisma.$transaction(async (tx) => {
        const reservedInventory =
          await this.inventoryAllocator.reserveForOrder(tx, orderId);

        await tx.provisioningJob.update({
          where: { id: job.id },
          data: {
            status: 'PROVISIONING',
            inventoryId: reservedInventory.id,
            providerId: reservedInventory.providerId,
          },
        });

        return reservedInventory;
      });

      // Create VPS and complete job atomically.
      const result = await this.prisma.$transaction(async (tx) => {
        const currentJob = await tx.provisioningJob.findUnique({
          where: { id: job.id },
        });

        if (
          !currentJob ||
          currentJob.status !== 'PROVISIONING'
        ) {
          throw new ConflictException(
            'Provisioning job state changed unexpectedly',
          );
        }

        const currentOrder = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            vpsInstance: true,
            plan: true,
          },
        });

        if (!currentOrder || currentOrder.status !== 'PAID') {
          throw new ConflictException(
            'Order is no longer eligible for provisioning',
          );
        }

        if (currentOrder.vpsInstance) {
          throw new ConflictException(
            'A VPS instance is already linked to this order',
          );
        }

        const currentInventory =
          await tx.providerInventory.findUnique({
            where: { id: inventory.id },
          });

        if (
          !currentInventory ||
          currentInventory.status !== 'RESERVED'
        ) {
          throw new ConflictException(
            'Reserved inventory is no longer available',
          );
        }

        const expiresAt = new Date(
          Date.now() +
            currentOrder.plan.durationDays *
              24 *
              60 *
              60 *
              1000,
        );

        const vps = await tx.vPSInstance.create({
          data: {
            userId: currentOrder.userId,
            orderId: currentOrder.id,
            inventoryId: inventory.id,
            provider: inventory.provider.code,
            providerVpsId: inventory.providerVpsId,
            ipAddress: inventory.ipAddress!,
            hostname: inventory.hostname,
            operatingSystem: currentOrder.operatingSystem,
            ram: inventory.ramGb,
            status: 'ACTIVE',
            expiresAt,
          },
        });

        await tx.providerInventory.update({
          where: { id: inventory.id },
          data: {
            status: 'ASSIGNED',
          },
        });

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'ACTIVE',
          },
        });

        const completedJob = await tx.provisioningJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            inventoryId: inventory.id,
            providerId: inventory.providerId,
            completedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });

        return {
          job: completedJob,
          vps,
        };
      });

      return {
        message: 'VPS provisioned successfully from inventory',
        ...result,
      };
    } catch (error) {
      await this.prisma.provisioningJob.updateMany({
        where: {
          id: job.id,
          status: { not: 'COMPLETED' },
        },
        data: {
          status: 'FAILED',
          errorCode: 'INVENTORY_PROVISIONING_FAILED',
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Unknown provisioning error',
        },
      });

      throw error;
    }
  }

  async findAllJobs() {
    const jobs = await this.prisma.provisioningJob.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        providerId: true,
        inventoryId: true,
        source: true,
        status: true,
        attemptNumber: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            orderNumber: true,
            status: true,
            amount: true,
            currency: true,
            vpsInstance: {
              select: {
                id: true,
                ipAddress: true,
                status: true,
              },
            },
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        inventory: {
          select: {
            id: true,
            ipAddress: true,
            status: true,
          },
        },
      },
    });

    return {
      jobs,
      total: jobs.length,
    };
  }

  async findJobById(id: string) {
    const job = await this.prisma.provisioningJob.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        providerId: true,
        inventoryId: true,
        source: true,
        status: true,
        attemptNumber: true,
        providerRequestId: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            userId: true,
            planName: true,
            operatingSystem: true,
            amount: true,
            currency: true,
            status: true,
            vpsInstance: {
              select: {
                id: true,
                ipAddress: true,
                hostname: true,
                status: true,
                expiresAt: true,
              },
            },
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
          },
        },
        inventory: {
          select: {
            id: true,
            providerVpsId: true,
            ipAddress: true,
            hostname: true,
            status: true,
            expiresAt: true,
            vpsInstance: {
              select: {
                id: true,
                ipAddress: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Provisioning job not found');
    }

    return job;
  }

  async reconcileJob(id: string) {
    const job = await this.findJobById(id);

    const orderVps = job.order.vpsInstance;
    const inventoryVps = job.inventory?.vpsInstance ?? null;

    const hasVpsInstance = Boolean(orderVps || inventoryVps);

    let assessment = 'REQUIRES_MANUAL_REVIEW';
    let recommendation =
      'Inspect the provider and database records before taking action.';

    if (job.status === 'COMPLETED' && hasVpsInstance) {
      assessment = 'PROVISIONING_COMPLETED';
      recommendation =
        'Verify that the VPS is operational with the provider.';
    } else if (job.status === 'COMPLETED' && !hasVpsInstance) {
      assessment = 'INCONSISTENT_COMPLETED_JOB';
      recommendation =
        'Investigate why the completed job has no linked VPS instance.';
    } else if (hasVpsInstance && job.status !== 'COMPLETED') {
      assessment = 'VPS_EXISTS_JOB_NOT_COMPLETED';
      recommendation =
        'Verify the VPS with the provider. Do not provision another VPS.';
    } else if (
      job.inventory?.status === 'RESERVED' &&
      job.status === 'FAILED'
    ) {
      assessment = 'RESERVED_INVENTORY_AFTER_FAILURE';
      recommendation =
        'Verify inventory with the provider before releasing or reusing it.';
    } else if (
      job.inventory?.status === 'ASSIGNED' &&
      !hasVpsInstance
    ) {
      assessment = 'ASSIGNED_INVENTORY_WITHOUT_VPS';
      recommendation =
        'Investigate the inventory assignment and VPS database records.';
    } else if (job.status === 'FAILED' && !job.inventory) {
      assessment = 'FAILED_WITHOUT_INVENTORY';
      recommendation =
        'Review the failure reason and check inventory availability before any retry.';
    }

    return {
      message: 'Reconciliation inspection completed',
      readOnly: true,
      assessment,
      recommendation,
      job,
      checks: {
        orderExists: Boolean(job.order),
        orderStatus: job.order.status,
        inventoryLinked: Boolean(job.inventory),
        inventoryStatus: job.inventory?.status ?? null,
        orderVpsExists: Boolean(orderVps),
        inventoryVpsExists: Boolean(inventoryVps),
        jobStatus: job.status,
      },
    };
  }
}
