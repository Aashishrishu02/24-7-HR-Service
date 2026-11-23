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
import { HostHeavenService } from '../hostheaven/hostheaven.service.js';
import { HostHeavenDirectCatalogueService } from '../hostheaven/hostheaven-direct-catalogue.service.js';
import { DirectHostHeavenCheckoutDto } from '../hostheaven/dto/direct-checkout.dto.js';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryAllocator: InventoryAllocatorService,
    private readonly provisioningService: ProvisioningService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly hostheavenService?: HostHeavenService,
    private readonly hostheavenDirectCatalogueService?: HostHeavenDirectCatalogueService,
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

    let plan = await this.prisma.vPSPlan.findFirst({
      where: {
        id: planId,
        isActive: true,
      },
      include: {
        hostHeavenMapping: true,
      },
    });

    if (!plan && planId.startsWith('hh:') && this.hostheavenDirectCatalogueService) {
      const parts = planId.split(':');
      if (parts.length >= 7) {
        const [, planType, zoneId, cpuPriceId, ramPriceId, diskPriceId, bandwidthPriceId] = parts;
        try {
          const validated = await this.hostheavenDirectCatalogueService.validateConfiguration({
            zoneId,
            zoneIsoId: 'auto',
            planType: planType as 'SHARED' | 'DEDICATED',
            cpuPriceId,
            ramPriceId,
            diskPriceId,
            bandwidthPriceId,
          });
          plan = await this.prisma.vPSPlan.upsert({
            where: { id: validated.serviceId },
            create: {
              id: validated.serviceId,
              name: validated.serviceName,
              productType: 'VPS_HOSTING',
              description: `Direct HostHeaven service (${validated.zoneName})`,
              cpuCores: validated.cpuCores,
              ramGb: validated.ramGb,
              storageGb: validated.storageGb,
              bandwidthGb: validated.bandwidthGb,
              price: new Prisma.Decimal(validated.customerSellingPrice.toFixed(2)),
              currency: 'INR',
              durationDays: 30,
              supportedOS: [operatingSystem],
              isActive: true,
            },
            update: {},
            include: { hostHeavenMapping: true },
          });
        } catch {
          // ignore error and proceed to not found
        }
      }
    }

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
      if (!this.hostheavenService) {
        throw new BadRequestException(
          'Automated HostHeaven VPS checkout is currently disabled pending live provisioning verification.',
        );
      }
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

  /**
   * Creates a customer order before calling HostHeaven.
   * Uncertain provider outcomes remain pending for reconciliation.
   */
  async checkoutDirectHostHeaven(
    userId: string,
    dto: DirectHostHeavenCheckoutDto,
  ) {
    if (!this.hostheavenDirectCatalogueService || !this.hostheavenService) {
      throw new BadRequestException('HostHeaven provider service is not initialized');
    }

    if ((dto.paymentMethod ?? 'WALLET') !== 'WALLET') {
      throw new BadRequestException(
        'Only wallet payment is currently supported for direct HostHeaven checkout.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('Active customer account not found');
    }

    const validated = await this.hostheavenDirectCatalogueService.validateConfiguration({
      zoneId: dto.zoneId,
      zoneIsoId: dto.zoneIsoId,
      planType: dto.planType,
      cpuPriceId: dto.cpuPriceId,
      ramPriceId: dto.ramPriceId,
      diskPriceId: dto.diskPriceId,
      bandwidthPriceId: dto.bandwidthPriceId,
      months: dto.months || 1,
    });

    const finalAmountDec = new Prisma.Decimal(
      validated.customerSellingPrice.toFixed(2),
    );

    const userWallet = await this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    if (userWallet.currency !== 'INR') {
      throw new BadRequestException('Wallet currency must be INR');
    }

    const orderNumber = `HH-${Date.now()}-${randomUUID()
      .replaceAll('-', '')
      .slice(0, 8)
      .toUpperCase()}`;

    // Create the order, payment, provisioning job and wallet debit BEFORE
    // contacting the provider. This gives uncertain requests a local record.
    const localOrder = await this.prisma.$transaction(async (tx) => {
      const debitResult = await tx.wallet.updateMany({
        where: {
          id: userWallet.id,
          balance: { gte: finalAmountDec },
        },
        data: { balance: { decrement: finalAmountDec } },
      });

      if (debitResult.count !== 1) {
        throw new ConflictException(
          `Insufficient wallet balance or concurrent debit. Required: ₹${validated.customerSellingPrice.toFixed(2)}`,
        );
      }

      const systemPlan = await tx.vPSPlan.upsert({
        where: { id: validated.serviceId },
        create: {
          id: validated.serviceId,
          name: validated.serviceName,
          productType: 'VPS_HOSTING',
          description: `Direct HostHeaven service (${validated.zoneName})`,
          cpuCores: validated.cpuCores,
          ramGb: validated.ramGb,
          storageGb: validated.storageGb,
          bandwidthGb: validated.bandwidthGb,
          price: finalAmountDec,
          currency: 'INR',
          durationDays: validated.months * 30,
          supportedOS: [validated.isoName],
          isActive: true,
        },
        update: {
          price: finalAmountDec,
          durationDays: validated.months * 30,
        },
      });

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          planId: systemPlan.id,
          planName: validated.serviceName,
          operatingSystem: validated.isoName,
          amount: finalAmountDec,
          currency: 'INR',
          status: 'PROVISIONING',
        },
      });

      const payment = await tx.payment.create({
        data: {
          userId,
          orderId: order.id,
          purpose: 'VPS_ORDER',
          provider: 'WALLET',
          amount: finalAmountDec,
          currency: 'INR',
          status: 'CAPTURED',
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: userWallet.id,
          type: 'DEBIT',
          amount: finalAmountDec,
          currency: 'INR',
          reference: orderNumber,
          idempotencyKey: `wallet-vps-buy:${orderNumber}`,
          description: `HostHeaven VPS purchase - ${validated.serviceName} (${validated.months} month)`,
          paymentId: payment.id,
          metadata: {
            orderId: order.id,
            orderNumber,
            serviceId: validated.serviceId,
          },
        },
      });

      const job = await tx.provisioningJob.create({
        data: {
          orderId: order.id,
          source: 'PROVIDER_API',
          status: 'PROVISIONING',
          idempotencyKey: `hostheaven-direct:${orderNumber}`,
          startedAt: new Date(),
        },
      });

      return {
        order,
        payment,
        job,
        walletId: userWallet.id,
      };
    });

    let vmResponse: any;

    try {
      vmResponse = await this.hostheavenService.createVm({
        zoneId: validated.zoneId,
        zoneIsoId: validated.zoneIsoId,
        planType: validated.planType,
        cpuPriceId: validated.cpuPriceId,
        ramPriceId: validated.ramPriceId,
        diskPriceId: validated.diskPriceId,
        bandwidthPriceId: validated.bandwidthPriceId,
        months: validated.months,
        quantity: 1,
        useWalletBalance: true,
      });
    } catch (error: any) {
      const message = error?.message || String(error);

      await this.prisma.provisioningJob.update({
        where: { id: localOrder.job.id },
        data: {
          status: 'PROVISIONING',
          errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
          errorMessage: message.slice(0, 1000),
        },
      });

      return {
        success: true,
        status: 'PROVISIONING',
        message: 'Payment recorded. Provider outcome is uncertain; order requires reconciliation. No refund has been issued.',
        order: localOrder.order,
        providerRequestId: null,
      };
    }

    const providerRequestId =
      vmResponse?.orderId != null ? String(vmResponse.orderId) : null;

    if (vmResponse?.status === 'FAILED') {
      await this.prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: localOrder.walletId },
          data: { balance: { increment: finalAmountDec } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: localOrder.walletId,
            type: 'REFUND',
            amount: finalAmountDec,
            currency: 'INR',
            reference: orderNumber,
            idempotencyKey: `wallet-vps-refund:${orderNumber}`,
            description: `Refund for failed HostHeaven VPS purchase - ${validated.serviceName}`,
            paymentId: localOrder.payment.id,
            metadata: {
              orderId: localOrder.order.id,
              providerRequestId,
            },
          },
        });

        await tx.payment.update({
          where: { id: localOrder.payment.id },
          data: { status: 'REFUNDED' },
        });

        await tx.order.update({
          where: { id: localOrder.order.id },
          data: { status: 'FAILED' },
        });

        await tx.provisioningJob.update({
          where: { id: localOrder.job.id },
          data: {
            status: 'FAILED',
            providerRequestId,
            errorCode: 'PROVIDER_REJECTED',
            errorMessage: String(vmResponse?.message || 'Provider rejected VM creation').slice(0, 1000),
            completedAt: new Date(),
          },
        });
      });

      return {
        success: false,
        status: 'FAILED',
        message: 'HostHeaven rejected the VPS purchase. Customer wallet has been refunded.',
        orderId: localOrder.order.id,
        providerRequestId,
      };
    }

    // Save the provider reference, but never treat PENDING or incomplete
    // COMPLETED responses as an active VPS.
    await this.prisma.provisioningJob.update({
      where: { id: localOrder.job.id },
      data: {
        status: 'PROVISIONING',
        providerRequestId,
        errorCode: null,
        errorMessage: null,
      },
    });

    const assignedVm = vmResponse?.vms?.[0];
    const providerVpsId = assignedVm?.vmId;
    const ipAddress = assignedVm?.ipAddress;

    if (
      vmResponse?.status !== 'COMPLETED' ||
      !providerVpsId ||
      !ipAddress
    ) {
      return {
        success: true,
        status: 'PROVISIONING',
        message: 'Payment recorded. HostHeaven provisioning is pending or provider VM details are incomplete. No VPS has been marked active and no refund has been issued.',
        order: localOrder.order,
        providerRequestId,
      };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const hostname =
          dto.hostname?.trim() ||
          assignedVm?.hostname ||
          assignedVm?.vmName ||
          `vps-${orderNumber.toLowerCase()}.247hrservice.com`;

        const expiresAt = new Date(
          Date.now() + validated.months * 30 * 24 * 60 * 60 * 1000,
        );

        const vps = await tx.vPSInstance.create({
          data: {
            userId,
            orderId: localOrder.order.id,
            provider: 'HOSTHEAVEN',
            providerVpsId: String(providerVpsId),
            ipAddress: String(ipAddress),
            hostname,
            operatingSystem: validated.isoName,
            ram: validated.ramGb,
            status: 'ACTIVE',
            expiresAt,
          },
        });

        const order = await tx.order.update({
          where: { id: localOrder.order.id },
          data: { status: 'ACTIVE' },
        });

        await tx.provisioningJob.update({
          where: { id: localOrder.job.id },
          data: {
            status: 'COMPLETED',
            providerRequestId,
            completedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });

        return { order, vps };
      });

      return {
        success: true,
        status: 'ACTIVE',
        message: 'HostHeaven VPS provisioned successfully.',
        order: result.order,
        vps: result.vps,
        providerOrderId: providerRequestId,
      };
    } catch (error: any) {
      // The provider may already have created the VM. Keep the paid order
      // pending for reconciliation; never issue an automatic refund here.
      await this.prisma.provisioningJob.update({
        where: { id: localOrder.job.id },
        data: {
          status: 'PROVISIONING',
          providerRequestId,
          errorCode: 'LOCAL_FINALIZATION_FAILED',
          errorMessage: String(error?.message || error).slice(0, 1000),
        },
      });

      return {
        success: true,
        status: 'PROVISIONING',
        message: 'HostHeaven created the VM, but local VPS registration needs reconciliation. No refund has been issued.',
        order: localOrder.order,
        providerRequestId,
      };
    }
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
        // A HostHeaven order must NEVER be charged and provisioned from unrelated generic provider inventory.
        if (order.plan.hostHeavenMapping || (order.planId && order.planId.startsWith('hh:'))) {
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

    // A missing local VPS record does NOT prove that HostHeaven did not create one.
    // Keep the order and payment untouched until provider-side verification is available.
    return {
      message: 'Provider-side verification is required. No refund has been issued.',
      status: 'REQUIRES_MANUAL_REVIEW',
      orderId: order.id,
      providerRequestId: latestJob?.providerRequestId ?? null,
    };


  }

  async refundOrder(orderId: string, adminUserId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    throw new BadRequestException(
      'Automatic refund is disabled until provider-side VPS absence is verified.',
    );
  }
}
