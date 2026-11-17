import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { Prisma, } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class InventoryAllocatorService {
  constructor(private readonly prisma: PrismaService) {}

  async reserveForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    // 1. Validate order
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { plan: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'PAID') {
      throw new BadRequestException(
        'Only paid orders can be provisioned',
      );
    }

    // 2. Find matching inventory
    const inventory = await tx.providerInventory.findFirst({
      where: {
        status: 'AVAILABLE',
        ipAddress: { not: null },
        cpuCores: { gte: order.plan.cpuCores },
        ramGb: { gte: order.plan.ramGb },
        storageGb: { gte: order.plan.storageGb },
        currency: order.currency,
        provider: {
          isActive: true,
        },
      },
      orderBy: [
        { provider: { priority: 'asc' } },
        { createdAt: 'asc' },
      ],
    });

    if (!inventory) {
      throw new NotFoundException(
        'No matching VPS inventory is currently available',
      );
    }

    // 3. Atomic conditional reservation
    const reservation = await tx.providerInventory.updateMany({
      where: {
        id: inventory.id,
        status: 'AVAILABLE',
      },
      data: {
        status: 'RESERVED',
      },
    });

    if (reservation.count !== 1) {
      throw new ConflictException(
        'Inventory was reserved by another request. Please retry.',
      );
    }

    // 4. Return reserved inventory
    return tx.providerInventory.findUniqueOrThrow({
      where: { id: inventory.id },
      include: {
        provider: true,
      },
    });
  }
}