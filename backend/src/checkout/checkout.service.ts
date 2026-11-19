import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryAllocatorService } from '../provisioning/inventory-allocator.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import {
  calculateSellingPrice,
  calculateDurationMonths,
} from '../hostheaven/hostheaven-pricing.util.js';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryAllocator: InventoryAllocatorService,
    private readonly provisioningService: ProvisioningService,
    private readonly adminSettingsService: AdminSettingsService,
  ) {}

  /**
   * Calculates the authoritative server-side selling price for an order,
   * guaranteeing that checkout uses the identical 20% margin calculation as PublicPlansController.
   * Frontend-submitted prices are NEVER trusted or accepted.
   */
  async calculateServerSellingPrice(
    plan: {
      price: Prisma.Decimal;
      durationDays?: number;
      hostHeavenMapping?: {
        isActive: boolean;
        isCostVerified: boolean;
        providerCost: Prisma.Decimal;
      } | null;
    },
  ): Promise<Prisma.Decimal> {
    if (
      plan.hostHeavenMapping &&
      plan.hostHeavenMapping.isActive &&
      plan.hostHeavenMapping.isCostVerified
    ) {
      const settings = await this.adminSettingsService.getSettings();
      const margin = settings.hostHeavenProfitMarginPercent ?? 20;
      const monthlyProviderCost = Number(plan.hostHeavenMapping.providerCost);
      const durationMonths =
        plan.durationDays && plan.durationDays > 30
          ? calculateDurationMonths(plan.durationDays)
          : 1;
      const totalProviderCost = monthlyProviderCost * durationMonths;
      const calculatedSellingPrice = calculateSellingPrice(totalProviderCost, margin);
      return new Prisma.Decimal(calculatedSellingPrice.toFixed(2));
    }
    return plan.price;
  }

  async createOrder(
    userId: string,
    planId: string,
    operatingSystem: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('Active customer account not found');
    }

    const plan = await this.prisma.vPSPlan.findFirst({
      where: {
        id: planId,
        isActive: true,
      },
      include: {
        hostHeavenMapping: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Active VPS plan not found');
    }

    if (plan.currency !== 'INR') {
      throw new BadRequestException('Only INR plans are supported');
    }

    // Verify HostHeaven mapping if plan is mapped
    if (plan.hostHeavenMapping) {
      if (!plan.hostHeavenMapping.isActive) {
        throw new BadRequestException(
          'HostHeaven mapping for this VPS plan is currently inactive',
        );
      }
      throw new BadRequestException(
        'Automated HostHeaven VPS checkout is currently disabled pending live provisioning verification.',
      );
    }

    // Operating system validation
    const validOSList = [...plan.supportedOS];
    if (!validOSList.includes(operatingSystem)) {
      throw new BadRequestException(
        'Selected operating system is not supported by this plan',
      );
    }

    const finalAmount = await this.calculateServerSellingPrice(plan);

    const orderNumber = `IC-${Date.now()}-${randomUUID()
      .replaceAll('-', '')
      .slice(0, 8)
      .toUpperCase()}`;

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId,
        planId: plan.id,
        planName: plan.name,
        operatingSystem,
        amount: finalAmount,
        currency: 'INR',
        status: 'PENDING',
      },
      select: {
        id: true,
        orderNumber: true,
        planId: true,
        planName: true,
        operatingSystem: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      message: 'Checkout order created successfully',
      order,
    };
  }

  async payWithWallet(userId: string, orderId: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            userId,
          },
          include: {
            plan: {
              include: {
                hostHeavenMapping: true,
              },
            },
          },
        });

        if (!order) {
          throw new NotFoundException('Order not found');
        }

        if (order.status !== 'PENDING') {
          throw new ConflictException(
            `Order cannot be paid because its status is ${order.status}`,
          );
        }

        if (order.currency !== 'INR' || order.plan.currency !== 'INR') {
          throw new BadRequestException('Only INR payments are supported');
        }

        if (!order.plan.isActive) {
          throw new BadRequestException('This VPS plan is no longer active');
        }

        if (order.plan.hostHeavenMapping && !order.plan.hostHeavenMapping.isActive) {
          throw new BadRequestException(
            'The HostHeaven mapping for this plan is no longer active',
          );
        }

        const validOSList = [...order.plan.supportedOS];
        if (
          order.plan.hostHeavenMapping?.isoName &&
          !validOSList.includes(order.plan.hostHeavenMapping.isoName)
        ) {
          validOSList.push(order.plan.hostHeavenMapping.isoName);
        }

        if (!validOSList.includes(order.operatingSystem)) {
          throw new BadRequestException(
            'The selected operating system is no longer supported',
          );
        }

        // HostHeaven provisioning safety guard:
        // A HostHeaven-mapped order must NEVER be charged and provisioned from unrelated generic provider inventory.
        // While direct HostHeaven provisioning is disabled, reject ALL HostHeaven-mapped payment attempts BEFORE:
        // generic inventory lookup, wallet creation or modification, order status update, wallet debit, payment creation, provisioning.
        if (order.plan.hostHeavenMapping) {
          throw new BadRequestException(
            'Live HostHeaven automated VM provisioning is currently feature-gated pending provider payment gateway verification. HostHeaven plans cannot be provisioned from generic inventory.',
          );
        }

        // Verify that matching inventory is available before taking payment
        const availableInventory = await tx.providerInventory.findFirst({
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
        });

        if (!availableInventory) {
          throw new BadRequestException(
            'No available VPS inventory found for this plan. Please choose another plan or contact support.',
          );
        }

        const wallet = await tx.wallet.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });

        if (wallet.currency !== 'INR') {
          throw new BadRequestException('Wallet currency must be INR');
        }

        const claimedOrder = await tx.order.updateMany({
          where: {
            id: order.id,
            userId,
            status: 'PENDING',
          },
          data: {
            status: 'PAID',
          },
        });

        if (claimedOrder.count !== 1) {
          throw new ConflictException(
            'Order is already being processed or has been paid',
          );
        }

        const debit = await tx.wallet.updateMany({
          where: {
            id: wallet.id,
            balance: {
              gte: order.amount,
            },
          },
          data: {
            balance: {
              decrement: order.amount,
            },
          },
        });

        if (debit.count !== 1) {
          throw new BadRequestException(
            'Insufficient wallet balance. Please add money to your wallet.',
          );
        }

        const payment = await tx.payment.create({
          data: {
            userId,
            orderId: order.id,
            purpose: 'VPS_ORDER',
            provider: 'WALLET',
            amount: order.amount,
            currency: 'INR',
            status: 'CAPTURED',
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'DEBIT',
            amount: order.amount,
            currency: 'INR',
            reference: order.orderNumber,
            idempotencyKey: `wallet-vps-order:${order.id}`,
            description: `VPS purchase - ${order.planName}`,
            paymentId: payment.id,
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              planId: order.planId,
            },
          },
        });

        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          amount: order.amount,
          currency: 'INR',
          paymentId: payment.id,
          walletBalance: wallet.balance.sub(order.amount),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    try {
      const provisioning = await this.provisioningService.provisionOrder(
        result.orderId,
      );
      return {
        message: 'Payment successful and VPS provisioning completed',
        payment: {
          id: result.paymentId,
          amount: result.amount,
          currency: result.currency,
          status: 'CAPTURED',
        },
        order: {
          id: result.orderId,
          orderNumber: result.orderNumber,
        },
        wallet: {
          balance: result.walletBalance,
          currency: result.currency,
        },
        provisioning,
      };
    } catch (provisioningError) {
      // For uncertain outcomes, do NOT automatically refund!
      // Retain the wallet debit and mark the order as PROVISIONING for reconciliation.
      await this.prisma.order.updateMany({
        where: { id: result.orderId, status: 'PAID' },
        data: { status: 'PROVISIONING' },
      });

      return {
        message:
          'Payment captured successfully. Server provisioning is in progress or pending verification with provider. Your wallet debit has been retained while allocation is confirmed.',
        status: 'PROVISIONING',
        payment: {
          id: result.paymentId,
          amount: result.amount,
          currency: result.currency,
          status: 'CAPTURED',
        },
        order: {
          id: result.orderId,
          orderNumber: result.orderNumber,
          status: 'PROVISIONING',
        },
        wallet: {
          balance: result.walletBalance,
          currency: result.currency,
        },
        requiresReconciliation: true,
        error:
          provisioningError instanceof Error
            ? provisioningError.message
            : 'Provisioning timed out or encountered an uncertain provider outcome',
      };
    }
  }

  async getOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: {
        plan: {
          select: {
            name: true,
            cpuCores: true,
            ramGb: true,
            storageGb: true,
            durationDays: true,
          },
        },
        vpsInstance: {
          select: {
            id: true,
            ipAddress: true,
            status: true,
            expiresAt: true,
          },
        },
        payments: {
          select: {
            id: true,
            provider: true,
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return {
      orders,
      total: orders.length,
    };
  }

  async reconcileOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        plan: true,
        vpsInstance: true,
        payments: true,
        provisioningJobs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // 1. Check if VPS already exists on the order
    if (
      order.vpsInstance &&
      (order.vpsInstance.status === 'ACTIVE' ||
        order.vpsInstance.status === 'RUNNING')
    ) {
      if (order.status !== 'ACTIVE') {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: 'ACTIVE' },
        });
      }
      return {
        message: 'Order already has an active provisioned VPS',
        status: 'ACTIVE',
        orderId: order.id,
        vps: order.vpsInstance,
      };
    }

    // 2. Query provider / database using stable provider order/reference ID
    const latestJob = order.provisioningJobs[0];

    // Check if a VPS was created matching this orderId or provider reference
    const remoteVps = await this.prisma.vPSInstance.findFirst({
      where: {
        OR: [
          { orderId: order.id },
          { providerVpsId: order.orderNumber },
          { hostname: order.orderNumber },
        ],
      },
    });

    if (remoteVps) {
      // If the provider created a VPS but response timed out, attach the VPS to the order instead of refunding!
      await this.prisma.$transaction(async (tx) => {
        await tx.vPSInstance.update({
          where: { id: remoteVps.id },
          data: {
            orderId: order.id,
            userId: order.userId,
            status: 'ACTIVE',
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'ACTIVE' },
        });
        if (latestJob) {
          await tx.provisioningJob.update({
            where: { id: latestJob.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              errorMessage: null,
            },
          });
        }
      });

      return {
        message:
          'VPS located from provider and attached to order successfully. No refund necessary.',
        status: 'ACTIVE',
        vps: remoteVps,
        orderId: order.id,
      };
    }

    // 3. Confirm that NO VPS was created before refunding:
    const payment = order.payments.find(
      (p) => p.status === 'CAPTURED' && p.provider === 'WALLET',
    );

    if (!payment) {
      const existingRefund = await this.prisma.walletTransaction.findFirst({
        where: {
          reference: order.orderNumber,
          type: 'REFUND',
        },
      });

      if (existingRefund) {
        return {
          message: 'Order has already been refunded',
          status: 'REFUNDED',
          orderId: order.id,
        };
      }

      throw new BadRequestException(
        'No captured wallet payment found for this order to refund',
      );
    }

    // Execute atomic, idempotent refund
    return await this.prisma.$transaction(
      async (tx) => {
        const existingRefundTx = await tx.walletTransaction.findFirst({
          where: {
            paymentId: payment.id,
            type: 'REFUND',
          },
        });

        if (existingRefundTx) {
          const userWallet = await tx.wallet.findUniqueOrThrow({
            where: { userId: order.userId },
          });
          return {
            message: 'Order has already been refunded',
            status: 'REFUNDED',
            balance: userWallet.balance,
          };
        }

        const userWallet = await tx.wallet.findUniqueOrThrow({
          where: { userId: order.userId },
        });

        const updatedWallet = await tx.wallet.update({
          where: { id: userWallet.id },
          data: {
            balance: {
              increment: payment.amount,
            },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: userWallet.id,
            type: 'REFUND',
            amount: payment.amount,
            currency: 'INR',
            reference: order.orderNumber,
            idempotencyKey: `wallet-vps-refund:${order.id}`,
            description: `Refund after reconciliation confirmed no VPS created - Order ${order.orderNumber}`,
            paymentId: payment.id,
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              reason: 'Reconciliation confirmed no VPS was created by provider',
            },
          },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'REFUNDED',
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'FAILED',
          },
        });

        if (latestJob) {
          await tx.provisioningJob.update({
            where: { id: latestJob.id },
            data: {
              status: 'CANCELLED',
            },
          });
        }

        return {
          message:
            'Reconciliation confirmed no VPS was created. Order refunded in full.',
          status: 'REFUNDED',
          refundedAmount: payment.amount,
          balance: updatedWallet.balance,
          currency: updatedWallet.currency,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async refundOrder(orderId: string, adminUserId?: string) {
    return this.reconcileOrder(orderId);
  }
}
