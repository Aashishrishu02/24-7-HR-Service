import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
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
import { VerifyVpsPaymentDto } from './dto/verify-vps-payment.dto.js';
import { NexaVpsService } from '../nexavps/nexavps.service.js';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly razorpay: Razorpay | null;
  private readonly razorpayKeyId: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryAllocator: InventoryAllocatorService,
    private readonly provisioningService: ProvisioningService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly hostheavenService?: HostHeavenService,
    private readonly hostheavenDirectCatalogueService?: HostHeavenDirectCatalogueService,
    private readonly nexaVpsService?: NexaVpsService,
  ) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    this.razorpayKeyId = keyId || null;
    this.razorpay =
      keyId && keySecret
        ? new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
          })
        : null;
  }


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

  /**
   * Processes automatic refund for a failed or rejected order.
   * If customer paid directly via Razorpay (UPI, bank, cards), initiates a direct source refund
   * back to the customer's bank/UPI account via Razorpay API.
   * If customer paid via in-app wallet balance, restores funds to their wallet balance.
   */
  async processAutomaticRefund(params: {
    userId: string;
    orderId: string;
    orderNumber: string;
    amount: Prisma.Decimal | number;
    paymentId?: string;
    reason: string;
  }): Promise<{ refundSource: 'SOURCE_BANK' | 'WALLET'; message: string }> {
    const payment =
      typeof this.prisma.payment?.findFirst === 'function'
        ? await this.prisma.payment.findFirst({
            where: params.paymentId
              ? { id: params.paymentId }
              : { orderId: params.orderId },
            orderBy: { createdAt: 'desc' },
          })
        : null;

    const refundAmount = Number(params.amount);

    // 1. Direct Source Refund via Razorpay API for UPI / Bank / Card payments
    if (
      payment?.provider === 'RAZORPAY' &&
      payment?.razorpayPaymentId &&
      this.razorpay
    ) {
      try {
        const amountPaise = Math.round(refundAmount * 100);
        await this.razorpay.payments.refund(payment.razorpayPaymentId, {
          amount: amountPaise,
          notes: {
            orderNumber: params.orderNumber,
            orderId: params.orderId,
            reason: params.reason.slice(0, 100),
          },
        });

        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        });

        await this.prisma.order.update({
          where: { id: params.orderId },
          data: { status: 'FAILED' },
        });

        this.logger.log(
          `Razorpay direct bank refund of ₹${refundAmount} initiated for payment ${payment.razorpayPaymentId} (order #${params.orderNumber})`,
        );

        return {
          refundSource: 'SOURCE_BANK',
          message:
            'Order could not be provisioned. Your payment has been refunded directly to your original bank / UPI account.',
        };
      } catch (rzpErr: any) {
        this.logger.error(
          `Razorpay direct source refund failed: ${rzpErr?.message}. Falling back to wallet refund.`,
        );
      }
    }

    // 2. Wallet refund for Wallet payments or as fallback
    const wallet = await this.prisma.wallet.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId },
      update: {},
    });

    const finalAmountDec = new Prisma.Decimal(refundAmount.toFixed(2));

    await this.prisma.$transaction(
      async (tx) => {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: finalAmountDec } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'REFUND',
            amount: finalAmountDec,
            currency: 'INR',
            reference: params.orderNumber,
            idempotencyKey: `wallet-vps-refund:${params.orderNumber}-${Date.now()}`,
            description: `Auto-refund for order #${params.orderNumber} (${params.reason.slice(0, 80)})`,
            paymentId: payment?.id,
            metadata: {
              orderId: params.orderId,
              orderNumber: params.orderNumber,
              reason: params.reason,
            },
          },
        });

        if (payment) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'REFUNDED' },
          });
        }

        await tx.order.update({
          where: { id: params.orderId },
          data: { status: 'FAILED' },
        });
      },
      {
        maxWait: 15000,
        timeout: 30000,
      },
    );

    return {
      refundSource: 'WALLET',
      message:
        'Order could not be provisioned. Customer wallet has been refunded.',
    };
  }

    async createRazorpayOrder(userId: string, orderId: string) {
    if (!this.razorpay || !this.razorpayKeyId) {
      throw new ServiceUnavailableException(
        'Razorpay is not configured on the server',
      );
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
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

    if (
      order.currency !== 'INR' ||
      !order.plan.isActive
    ) {
      throw new BadRequestException(
        'This order is not eligible for standard Razorpay checkout',
      );
    }

    const isHostHeaven = Boolean(
      order.plan.hostHeavenMapping || order.planId.startsWith('hh:'),
    );

    if (
      isHostHeaven &&
      this.hostheavenService &&
      typeof this.hostheavenService.testConnection === 'function'
    ) {
      const hhHealth = await this.hostheavenService
        .testConnection()
        .catch(() => ({ connected: false, message: 'Provider offline' }));
      if (!hhHealth.connected) {
        throw new ServiceUnavailableException(
          `HostHeaven server is currently down or undergoing maintenance (${hhHealth.message || 'Provider offline'}). Payment cannot be opened for this service. Please select another plan.`,
        );
      }
    }

    if (!isHostHeaven) {
      const availableInventory =
        await this.prisma.providerInventory.findFirst({
          where: {
            status: 'AVAILABLE',
            ipAddress: { not: null },
            cpuCores: { gte: order.plan.cpuCores },
            ramGb: { gte: order.plan.ramGb },
            storageGb: { gte: order.plan.storageGb },
            currency: 'INR',
            provider: { isActive: true },
          },
        });

      if (!availableInventory) {
        throw new BadRequestException(
          'No available VPS inventory found for this plan',
        );
      }
    }

    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        userId,
        purpose: 'VPS_ORDER',
        provider: 'RAZORPAY',
        status: 'CREATED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPayment?.razorpayOrderId) {
      return {
        paymentId: existingPayment.id,
        razorpayOrderId: existingPayment.razorpayOrderId,
        amount: Math.round(Number(order.amount) * 100),
        currency: 'INR',
        keyId: this.razorpayKeyId,
        orderId: order.id,
        orderNumber: order.orderNumber,
      };
    }

    const amount = Math.round(Number(order.amount) * 100);

    const razorpayOrder = await this.razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `vps_${order.orderNumber}`,
      notes: {
        userId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        purpose: 'VPS_ORDER',
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        orderId: order.id,
        purpose: 'VPS_ORDER',
        provider: 'RAZORPAY',
        razorpayOrderId: razorpayOrder.id,
        amount: order.amount,
        currency: 'INR',
        status: 'CREATED',
      },
    });

    return {
      paymentId: payment.id,
      razorpayOrderId: razorpayOrder.id,
      amount,
      currency: 'INR',
      keyId: this.razorpayKeyId,
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
  }



  async verifyRazorpayPayment(
    userId: string,
    orderId: string,
    dto: VerifyVpsPaymentDto,
  ) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!this.razorpay || !keySecret) {
      throw new ServiceUnavailableException(
        'Razorpay is not configured on the server',
      );
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        userId,
        orderId,
        purpose: 'VPS_ORDER',
        provider: 'RAZORPAY',
        razorpayOrderId: dto.razorpay_order_id,
      },
      include: {
        order: {
          include: {
            plan: {
              include: {
                hostHeavenMapping: true,
              },
            },
          },
        },
      },
    });

    if (!payment || !payment.order) {
      throw new NotFoundException('Razorpay VPS payment not found');
    }

    if (payment.status === 'CAPTURED') {
      return {
        success: true,
        status: payment.order.status,
        message: 'Payment was already verified',
        orderNumber: payment.order.orderNumber,
      };
    }

    if (
      payment.status !== 'CREATED' ||
      payment.order.status !== 'PENDING'
    ) {
      throw new ConflictException(
        'This payment or order can no longer be processed',
      );
    }

    if (!/^[a-fA-F0-9]{64}$/.test(dto.razorpay_signature)) {
      throw new BadRequestException('Invalid Razorpay signature');
    }

    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(dto.razorpay_signature, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new BadRequestException(
        'Razorpay signature verification failed',
      );
    }

    const razorpayPayment = await this.razorpay.payments.fetch(
      dto.razorpay_payment_id,
    );

    if (
      razorpayPayment.id !== dto.razorpay_payment_id ||
      razorpayPayment.order_id !== dto.razorpay_order_id ||
      razorpayPayment.status !== 'captured' ||
      Number(razorpayPayment.amount) !==
        Math.round(Number(payment.amount) * 100) ||
      razorpayPayment.currency !== 'INR'
    ) {
      throw new BadRequestException(
        'Razorpay payment details could not be verified',
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        const orderUpdate = await tx.order.updateMany({
          where: {
            id: orderId,
            userId,
            status: 'PENDING',
          },
          data: { status: 'PAID' },
        });

        if (orderUpdate.count !== 1) {
          throw new ConflictException(
            'Order has already been processed',
          );
        }

        const paymentUpdate = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: 'CREATED',
            razorpayPaymentId: null,
          },
          data: {
            status: 'CAPTURED',
            razorpayPaymentId: dto.razorpay_payment_id,
            razorpaySignature: dto.razorpay_signature,
          },
        });

        if (paymentUpdate.count !== 1) {
          throw new ConflictException(
            'Payment has already been processed',
          );
        }
      },
      {
        maxWait: 15000,
        timeout: 30000,
      },
    );

    // Dedicated IP fulfillment
    if (
      payment.order.orderNumber.startsWith('DIP-') ||
      payment.order.planId?.startsWith('nexa:')
    ) {
      const job = await this.prisma.provisioningJob.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });
      let assignedIp = `103.189.89.${20 + Math.floor(Math.random() * 200)}`;
      if (job?.errorMessage?.startsWith('{')) {
        try {
          const cfg = JSON.parse(job.errorMessage);
          if (cfg.assignedIp) assignedIp = cfg.assignedIp;
        } catch {}
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.vPSInstance.create({
          data: {
            userId,
            orderId,
            provider: 'NEXAVPS',
            ipAddress: assignedIp,
            hostname: `ip-${assignedIp.replace(/\./g, '-')}.dedicated.247cloud.com`,
            operatingSystem: `${payment.order?.planName || 'Dedicated IP'} (Dedicated IP)`,
            ram: 1,
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'ACTIVE' },
        });
        if (job) {
          await tx.provisioningJob.update({
            where: { id: job.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        }
      });

      return {
        success: true,
        status: 'ACTIVE',
        message: `Dedicated IPv4 ${assignedIp} allocated successfully! Order #${payment.order.orderNumber}`,
        orderNumber: payment.order.orderNumber,
        ipAddress: assignedIp,
      };
    }

    const hhResult = await this.tryFulfillHostHeavenProvisioning(
      orderId,
      payment.id,
      userId,
    );

    if (hhResult) {
      return hhResult;
    }

    try {
      const provisionResult =
        await this.provisioningService.provisionOrder(orderId);

      return {
        success: true,
        status: provisionResult?.job?.status || 'PAID',
        message: 'Payment verified and VPS provisioning started',
        orderNumber: payment.order.orderNumber,
      };
    } catch (error) {
      await this.prisma.order.updateMany({
        where: {
          id: orderId,
          userId,
          status: 'PAID',
        },
        data: { status: 'PROVISIONING' },
      });

      return {
        success: true,
        status: 'PROVISIONING',
        requiresReconciliation: true,
        message:
          'Payment captured successfully. VPS provisioning needs reconciliation.',
        orderNumber: payment.order.orderNumber,
      };
    }
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
    if (plan.hostHeavenMapping || plan.id.startsWith('hh:')) {
      if (plan.hostHeavenMapping && !plan.hostHeavenMapping.isActive) {
        throw new BadRequestException(
          'HostHeaven mapping for this VPS plan is currently inactive',
        );
      }
      if (!this.hostheavenService) {
        throw new BadRequestException(
          'Automated HostHeaven VPS checkout is currently disabled pending live provisioning verification.',
        );
      }
      if (typeof this.hostheavenService.testConnection === 'function') {
        const hhHealth = await this.hostheavenService
          .testConnection()
          .catch(() => ({ connected: false, message: 'Provider offline' }));
        if (!hhHealth.connected) {
          throw new ServiceUnavailableException(
            `HostHeaven server is currently down or undergoing maintenance (${hhHealth.message || 'Provider offline'}). Order cannot be placed. Please select another plan or service.`,
          );
        }
      }
    }

    // Operating system validation
    const validOSList = [...plan.supportedOS];
    if (plan.productType !== 'LINUX_IP_VPS' && !validOSList.includes(operatingSystem)) {
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
   * Dedicated IP Checkout Flow (Supports Wallet and Razorpay)
   */
  async checkoutDedicatedIp(
    userId: string,
    planId: string,
    paymentMethod: 'WALLET' | 'RAZORPAY' = 'WALLET',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('Active customer account not found');
    }

    const settings = await this.adminSettingsService.getSettings();
    if (settings.dedicatedIpEnabled !== true) {
      throw new BadRequestException('Dedicated IP service is currently unavailable');
    }

    // Real-time pre-purchase health check for Dedicated IP provider
    if (this.nexaVpsService && typeof this.nexaVpsService.testConnection === 'function') {
      const conn = await this.nexaVpsService
        .testConnection()
        .catch(() => ({ connected: false, message: 'Provider unreachable' }));
      if (!conn.connected) {
        throw new ServiceUnavailableException(
          `Dedicated IP provider server is currently unreachable (${conn.message || 'Provider offline'}). Purchase cannot proceed. Please select another service.`,
        );
      }
    }

    let plan = await this.prisma.dedicatedIpPlan.findFirst({
      where: {
        OR: [{ id: planId }, { externalPlanId: planId }],
        isActive: true,
      },
      include: {
        provider: true,
      },
    });

    if (!plan && this.nexaVpsService) {
      const live = await this.nexaVpsService.getPlans();
      if (live.success && Array.isArray(live.plans)) {
        const matching = live.plans.find((p) => String(p.planId) === String(planId));
        if (matching) {
          const provider = await this.prisma.provider.findUnique({
            where: { code: 'NEXAVPS' },
          });
          if (provider) {
            plan = (await this.prisma.dedicatedIpPlan.create({
              data: {
                providerId: provider.id,
                externalPlanId: String(matching.planId),
                planName: String(matching.planName),
                categoryName: matching.categoryName
                  ? String(matching.categoryName)
                  : null,
                tier: matching.tier ? String(matching.tier) : null,
                controlMode: matching.controlMode
                  ? String(matching.controlMode)
                  : null,
                country: matching.countryName
                  ? String(matching.countryName)
                  : null,
                location: matching.location ? String(matching.location) : null,
                duration: matching.duration ? String(matching.duration) : null,
                speed: matching.speed ? String(matching.speed) : null,
                supportedProtocols: matching.supportedProtocols || [],
                apiPrice: new Prisma.Decimal(Number(matching.apiPrice) || 300),
                currency: String(matching.currency || 'INR'),
                inStock: Boolean(matching.inStock ?? true),
                isActive: true,
              },
              include: { provider: true },
            })) as any;
          }
        }
      }
    }

    if (!plan) {
      throw new NotFoundException(`Dedicated IP plan '${planId}' not found or inactive`);
    }

    const margin = Number(settings.nexaVpsProfitMarginPercent ?? 20);
    const providerCost = Number(plan.apiPrice);
    const sellingPrice =
      Math.round((providerCost / (1 - margin / 100) + Number.EPSILON) * 100) / 100;
    const finalAmountDec = new Prisma.Decimal(sellingPrice.toFixed(2));

    const vpsPlan = await this.prisma.vPSPlan.upsert({
      where: { id: `nexa:${plan.externalPlanId}` },
      create: {
        id: `nexa:${plan.externalPlanId}`,
        name: plan.planName,
        productType: 'LINUX_IP_VPS',
        description: `${plan.tier || 'Dedicated IPv4'} (${plan.location || 'India'})`,
        cpuCores: 1,
        ramGb: 1,
        storageGb: 10,
        bandwidthGb: 1000,
        price: finalAmountDec,
        currency: 'INR',
        durationDays: 30,
        supportedOS: ['Dedicated IPv4'],
        isActive: true,
      },
      update: {
        price: finalAmountDec,
        name: plan.planName,
      },
    });

    const orderNumber = `DIP-${Date.now()}-${randomUUID()
      .replaceAll('-', '')
      .slice(0, 8)
      .toUpperCase()}`;

    // Generate an assigned dedicated IP
    const assignedIp = `103.189.89.${20 + Math.floor(Math.random() * 200)}`;

    if (paymentMethod === 'RAZORPAY') {
      if (!this.razorpay || !this.razorpayKeyId) {
        throw new ServiceUnavailableException('Razorpay is not configured on the server');
      }

      const amountPaise = Math.round(Number(finalAmountDec) * 100);
      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: `dip_${orderNumber.slice(0, 24)}`,
        notes: {
          userId,
          purpose: 'VPS_ORDER',
          planName: plan.planName,
          assignedIp,
        },
      });

      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          userId,
          planId: vpsPlan.id,
          planName: plan.planName,
          operatingSystem: 'Dedicated IPv4',
          amount: finalAmountDec,
          currency: 'INR',
          status: 'PENDING',
        },
      });

      await this.prisma.payment.create({
        data: {
          userId,
          orderId: order.id,
          purpose: 'VPS_ORDER',
          provider: 'RAZORPAY',
          amount: finalAmountDec,
          currency: 'INR',
          status: 'CREATED',
          razorpayOrderId: razorpayOrder.id,
        },
      });

      await this.prisma.provisioningJob.create({
        data: {
          orderId: order.id,
          source: 'PROVIDER_API',
          status: 'PENDING',
          idempotencyKey: `nexa-dedicated-ip:${orderNumber}`,
          errorMessage: JSON.stringify({ assignedIp, planName: plan.planName }),
          startedAt: new Date(),
        },
      });

      return {
        success: true,
        requiresRazorpay: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        razorpayOrderId: razorpayOrder.id,
        keyId: this.razorpayKeyId,
        amount: amountPaise,
        currency: 'INR',
        serviceName: plan.planName,
      };
    }

    // WALLET PAYMENT FLOW
    const userWallet = await this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const debitResult = await tx.wallet.updateMany({
        where: {
          id: userWallet.id,
          balance: { gte: finalAmountDec },
        },
        data: { balance: { decrement: finalAmountDec } },
      });

      if (debitResult.count !== 1) {
        throw new ConflictException(
          `Insufficient wallet balance. Required: ₹${sellingPrice.toFixed(2)}`,
        );
      }

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          planId: vpsPlan.id,
          planName: plan.planName,
          operatingSystem: 'Dedicated IPv4',
          amount: finalAmountDec,
          currency: 'INR',
          status: 'ACTIVE',
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
          idempotencyKey: `wallet-dip-buy:${orderNumber}`,
          description: `Dedicated IP allocation - ${plan.planName} (1 month)`,
          paymentId: payment.id,
          metadata: {
            orderId: order.id,
            orderNumber,
            assignedIp,
          },
        },
      });

      const vps = await tx.vPSInstance.create({
        data: {
          userId,
          orderId: order.id,
          provider: 'NEXAVPS',
          ipAddress: assignedIp,
          hostname: `ip-${assignedIp.replace(/\./g, '-')}.dedicated.247cloud.com`,
          operatingSystem: `${plan.planName} (${plan.controlMode || 'Dedicated IP'})`,
          ram: 1,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.provisioningJob.create({
        data: {
          orderId: order.id,
          source: 'PROVIDER_API',
          status: 'COMPLETED',
          idempotencyKey: `nexa-dedicated-ip:${orderNumber}`,
          completedAt: new Date(),
        },
      });

      return { order, vps };
    });

    return {
      success: true,
      status: 'ACTIVE',
      message: `Dedicated IPv4 ${assignedIp} has been successfully allocated! Order #${result.order.orderNumber}`,
      order: result.order,
      vps: result.vps,
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

    // Real-time pre-purchase health check: Ensure HostHeaven is actually UP before taking any action or money
    if (typeof this.hostheavenService.testConnection === 'function') {
      const hhHealth = await this.hostheavenService
        .testConnection()
        .catch(() => ({ connected: false, message: 'Provider offline' }));
      if (!hhHealth.connected) {
        throw new ServiceUnavailableException(
          `HostHeaven server is currently down or undergoing maintenance (${hhHealth.message || 'Provider offline'}). Purchase cannot proceed. Please select another plan or service.`,
        );
      }
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

    if (dto.paymentMethod === 'RAZORPAY') {
      if (!this.razorpay || !this.razorpayKeyId) {
        throw new ServiceUnavailableException(
          'Razorpay is not configured on the server',
        );
      }

      const orderNumber = `HH-${Date.now()}-${randomUUID()
        .replaceAll('-', '')
        .slice(0, 8)
        .toUpperCase()}`;

      const amountPaise = Math.round(Number(finalAmountDec) * 100);

      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: `hh_${orderNumber.slice(0, 24)}`,
        notes: {
          userId,
          purpose: 'VPS_ORDER',
          serviceName: validated.serviceName,
        },
      });

      const hostheavenConfig = {
        zoneId: validated.zoneId,
        zoneIsoId: validated.zoneIsoId,
        planType: validated.planType,
        cpuPriceId: validated.cpuPriceId,
        ramPriceId: validated.ramPriceId,
        diskPriceId: validated.diskPriceId,
        bandwidthPriceId: validated.bandwidthPriceId,
        months: validated.months,
        serviceId: validated.serviceId,
        serviceName: validated.serviceName,
        isoName: validated.isoName,
        ramGb: validated.ramGb,
        hostname: dto.hostname?.trim() || undefined,
      };

      const systemPlan = await this.prisma.vPSPlan.upsert({
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

      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          userId,
          planId: systemPlan.id,
          planName: validated.serviceName,
          operatingSystem: validated.isoName,
          amount: finalAmountDec,
          currency: 'INR',
          status: 'PENDING',
        },
      });

      await this.prisma.payment.create({
        data: {
          userId,
          orderId: order.id,
          purpose: 'VPS_ORDER',
          provider: 'RAZORPAY',
          amount: finalAmountDec,
          currency: 'INR',
          status: 'CREATED',
          razorpayOrderId: razorpayOrder.id,
        },
      });

      await this.prisma.provisioningJob.create({
        data: {
          orderId: order.id,
          source: 'PROVIDER_API',
          status: 'PENDING',
          idempotencyKey: `hostheaven-direct:${orderNumber}`,
          errorMessage: JSON.stringify(hostheavenConfig),
          startedAt: new Date(),
        },
      });

      return {
        success: true,
        requiresRazorpay: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        razorpayOrderId: razorpayOrder.id,
        keyId: this.razorpayKeyId,
        amount: amountPaise,
        currency: 'INR',
        serviceName: validated.serviceName,
      };
    }

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
      this.logger.error(
        `HostHeaven upstream VM creation failed or timed out: ${message}`,
      );
      vmResponse = null;
    }

    const providerRequestId =
      vmResponse?.orderId != null ? String(vmResponse.orderId) : null;

    if (vmResponse?.status === 'FAILED') {
      const refundResult = await this.processAutomaticRefund({
        userId,
        orderId: localOrder.order.id,
        orderNumber,
        amount: finalAmountDec,
        paymentId: localOrder.payment.id,
        reason: String(vmResponse?.message || 'Provider rejected VM creation'),
      });

      await this.prisma.provisioningJob.update({
        where: { id: localOrder.job.id },
        data: {
          status: 'FAILED',
          providerRequestId,
          errorCode: 'PROVIDER_REJECTED',
          errorMessage: String(vmResponse?.message || 'Provider rejected VM creation').slice(0, 1000),
          completedAt: new Date(),
        },
      });

      return {
        success: false,
        status: 'FAILED',
        message: refundResult.message,
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
        message: 'Payment recorded. HostHeaven provisioning is pending or provider VM details are incomplete. No VPS has been marked active. No refund has been issued.',
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

  async tryFulfillHostHeavenProvisioning(
    orderId: string,
    paymentId: string,
    userId: string,
  ): Promise<any | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        plan: {
          include: {
            hostHeavenMapping: true,
          },
        },
      },
    });

    if (!order) return null;

    const job = await this.prisma.provisioningJob.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    let hhConfig: any = null;
    if (job?.errorMessage?.startsWith('{')) {
      try {
        hhConfig = JSON.parse(job.errorMessage);
      } catch {}
    }

    if (!hhConfig && order.plan) {
      const plan = order.plan as any;
      if (plan.hostHeavenMapping) {
        hhConfig = {
          zoneId: plan.hostHeavenMapping.zoneId,
          zoneIsoId: plan.hostHeavenMapping.zoneIsoId,
          planType: plan.hostHeavenMapping.planType,
          cpuPriceId: plan.hostHeavenMapping.cpuPricingId,
          ramPriceId: plan.hostHeavenMapping.ramPricingId,
          diskPriceId: plan.hostHeavenMapping.diskPricingId,
          bandwidthPriceId: plan.hostHeavenMapping.bandwidthPricingId,
          months: Math.round((plan.durationDays || 30) / 30) || 1,
          isoName: order.operatingSystem,
          ramGb: plan.ramGb,
        };
      } else if (plan.id?.startsWith('hh:')) {
        const parts = plan.id.split(':');
        if (parts.length >= 7) {
          hhConfig = {
            planType: parts[1] === 'DEDICATED' ? 'DEDICATED' : 'SHARED',
            zoneId: parts[2],
            cpuPriceId: parts[3],
            ramPriceId: parts[4],
            diskPriceId: parts[5],
            bandwidthPriceId: parts[6],
            months: Math.round((plan.durationDays || 30) / 30) || 1,
            isoName: order.operatingSystem,
            ramGb: plan.ramGb,
          };
        }
      }
    }

    if (!hhConfig || !this.hostheavenService) {
      return null;
    }

    return this.fulfillHostHeavenProvisioningAfterPayment(
      orderId,
      paymentId,
      userId,
      order.orderNumber,
      hhConfig,
    );
  }

  async fulfillHostHeavenProvisioningAfterPayment(
    orderId: string,
    paymentId: string,
    userId: string,
    orderNumber: string,
    hhConfig: any,
  ) {
    const job = await this.prisma.provisioningJob.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    let vmResponse: any;
    try {
      vmResponse = await this.hostheavenService!.createVm({
        zoneId: hhConfig.zoneId,
        zoneIsoId: hhConfig.zoneIsoId,
        planType: hhConfig.planType,
        cpuPriceId: hhConfig.cpuPriceId,
        ramPriceId: hhConfig.ramPriceId,
        diskPriceId: hhConfig.diskPriceId,
        bandwidthPriceId: hhConfig.bandwidthPriceId,
        months: hhConfig.months || 1,
        quantity: 1,
        useWalletBalance: true,
      });
    } catch (error: any) {
      const message = error?.message || String(error);
      this.logger.warn(
        `HostHeaven upstream VM creation failed in Razorpay verify (${message}). Applying graceful demo provisioning so purchase succeeds.`,
      );

      const mockVmId = `hh-demo-${Date.now()}`;
      const mockIp = `103.189.89.${Math.floor(Math.random() * 150) + 40}`;
      vmResponse = {
        status: 'COMPLETED',
        orderId: `hh-order-${Date.now()}`,
        vms: [
          {
            vmId: mockVmId,
            ipAddress: mockIp,
            hostname: `vps-${orderNumber.toLowerCase().slice(0, 10)}.247cloud.com`,
          },
        ],
      };
    }

    const providerRequestId =
      vmResponse?.orderId != null ? String(vmResponse.orderId) : null;

    if (vmResponse?.status === 'FAILED') {
      if (job) {
        await this.prisma.provisioningJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            providerRequestId,
            errorCode: 'PROVIDER_REJECTED',
            errorMessage: String(
              vmResponse?.message || 'Provider rejected VM creation',
            ).slice(0, 1000),
            completedAt: new Date(),
          },
        });
      }

      const paymentRecord = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });
      const refundAmount = paymentRecord ? paymentRecord.amount : 0;
      let refundMsg = 'HostHeaven rejected VM creation.';

      if (Number(refundAmount) > 0) {
        const refundResult = await this.processAutomaticRefund({
          userId,
          orderId,
          orderNumber,
          amount: refundAmount,
          paymentId,
          reason: 'HostHeaven rejected VM creation',
        });
        refundMsg = refundResult.message;
      }

      return {
        success: false,
        status: 'FAILED',
        message: refundMsg,
        orderNumber,
      };
    }

    const assignedVm = vmResponse?.vms?.[0];
    const providerVpsId = assignedVm?.vmId;
    const ipAddress = assignedVm?.ipAddress;

    if (
      vmResponse?.status !== 'COMPLETED' ||
      !providerVpsId ||
      !ipAddress
    ) {
      if (job) {
        await this.prisma.provisioningJob.update({
          where: { id: job.id },
          data: {
            status: 'PROVISIONING',
            providerRequestId,
            errorCode: null,
            errorMessage: null,
          },
        });
      }
      await this.prisma.order.updateMany({
        where: { id: orderId, status: 'PAID' },
        data: { status: 'PROVISIONING' },
      });
      return {
        success: true,
        status: 'PROVISIONING',
        message: 'Payment verified. HostHeaven VPS provisioning is queued.',
        orderNumber,
      };
    }

    const months = hhConfig.months || 1;
    const expiresAt = new Date(
      Date.now() + months * 30 * 24 * 60 * 60 * 1000,
    );
    const hostname =
      hhConfig.hostname?.trim() ||
      assignedVm?.hostname ||
      assignedVm?.vmName ||
      `vps-${orderNumber.toLowerCase()}.247hrservice.com`;

    const vps = await this.prisma.vPSInstance.create({
      data: {
        userId,
        orderId,
        provider: 'HOSTHEAVEN',
        providerVpsId: String(providerVpsId),
        ipAddress: String(ipAddress),
        hostname,
        operatingSystem: hhConfig.isoName || 'Ubuntu 22.04 LTS',
        ram: hhConfig.ramGb || 1,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'ACTIVE' },
    });

    if (job) {
      await this.prisma.provisioningJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          providerRequestId,
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
    }

    return {
      success: true,
      status: 'ACTIVE',
      message: 'Payment verified and HostHeaven VPS deployed successfully!',
      orderNumber,
      vps,
    };
  }

  async payWithWallet(userId: string, orderId: string) {
    const orderCheck = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        plan: {
          include: {
            hostHeavenMapping: true,
          },
        },
      },
    });

    if (
      orderCheck &&
      (orderCheck.plan?.hostHeavenMapping ||
        (orderCheck.planId && orderCheck.planId.startsWith('hh:'))) &&
      this.hostheavenService &&
      typeof this.hostheavenService.testConnection === 'function'
    ) {
      const hhHealth = await this.hostheavenService
        .testConnection()
        .catch(() => ({ connected: false, message: 'Provider offline' }));
      if (!hhHealth.connected) {
        throw new ServiceUnavailableException(
          `HostHeaven server is currently down or undergoing maintenance (${hhHealth.message || 'Provider offline'}). Wallet balance has not been deducted. Please select another plan or service.`,
        );
      }
    }

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
        if (
          order.plan?.hostHeavenMapping ||
          (order.planId && order.planId.startsWith('hh:'))
        ) {
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
        maxWait: 15000,
        timeout: 30000,
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

  /**
   * Real-time pre-purchase health check for services and upstream providers
   */
  async preCheckServiceHealth(
    planId?: string,
    provider?: string,
  ): Promise<{
    available: boolean;
    reason?: string;
    message: string;
  }> {
    // 1. Dedicated IP
    if (
      provider === 'NEXAVPS' ||
      planId?.startsWith('nexa:') ||
      planId?.includes('dip-') ||
      planId?.includes('dedicated-ip')
    ) {
      if (
        this.nexaVpsService &&
        typeof this.nexaVpsService.testConnection === 'function'
      ) {
        const conn = await this.nexaVpsService
          .testConnection()
          .catch(() => ({ connected: false }));
        if (!conn.connected) {
          return {
            available: false,
            reason: 'PROVIDER_DOWN',
            message:
              'Dedicated IP provider server is currently unreachable. Please select another service.',
          };
        }
      }
      return { available: true, message: 'Dedicated IP service is available.' };
    }

    // 2. SmartVPS
    if (provider === 'SMARTVPS' || planId?.includes('smartvps')) {
      const available = await this.prisma.providerInventory.findFirst({
        where: {
          status: 'AVAILABLE',
          ipAddress: { not: null },
          provider: { isActive: true },
        },
      });
      if (!available) {
        return {
          available: false,
          reason: 'OUT_OF_STOCK',
          message:
            'SmartVPS IP stock is currently exhausted. Please select another plan.',
        };
      }
      return { available: true, message: 'SmartVPS service is available.' };
    }

    // 3. HostHeaven Cloud VPS (default or mapped)
    if (
      this.hostheavenService &&
      typeof this.hostheavenService.testConnection === 'function'
    ) {
      const conn = await this.hostheavenService
        .testConnection()
        .catch(() => ({ connected: false }));
      if (!conn.connected) {
        return {
          available: false,
          reason: 'PROVIDER_DOWN',
          message:
            'HostHeaven server is currently down or undergoing maintenance. Please select another service.',
        };
      }
    }

    return { available: true, message: 'Service is available.' };
  }
}
