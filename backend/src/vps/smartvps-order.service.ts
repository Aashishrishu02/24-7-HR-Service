import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VpsService } from './vps.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';

const SUPPORTED_RAM = [4, 8, 16, 32];

@Injectable()
export class SmartVpsOrderService {
  private readonly logger = new Logger(SmartVpsOrderService.name);
  private readonly razorpay: Razorpay | null;
  private readonly keyId?: string;
  private readonly keySecret?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly vpsService: VpsService,
    private readonly adminSettings: AdminSettingsService,
  ) {
    this.keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    this.keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    this.razorpay =
      this.keyId && this.keySecret
        ? new Razorpay({ key_id: this.keyId, key_secret: this.keySecret })
        : null;
  }

  private getGateway(): Razorpay {
    if (!this.razorpay || !this.keyId || !this.keySecret) {
      throw new ServiceUnavailableException(
        'Payment gateway is not configured',
      );
    }
    return this.razorpay;
  }

  private async getCurrentPlan(ramGb: number) {
    if (!SUPPORTED_RAM.includes(ramGb)) {
      throw new BadRequestException('Unsupported SmartVPS RAM plan');
    }

    const [setting, settings, stockResult] = await Promise.all([
      this.prisma.systemSetting.findUnique({
        where: { key: 'SMARTVPS_PLAN_SETTINGS' },
      }),
      this.adminSettings.getSettings(),
      this.vpsService.getIpStock(),
    ]);

    let saved: Record<string, any> = {};
    try {
      saved = setting?.value ? JSON.parse(setting.value) : {};
    } catch {
      throw new ServiceUnavailableException(
        'SmartVPS plan configuration is invalid',
      );
    }

    const plan = saved[String(ramGb)];
    const providerCost = Number(plan?.providerCost);
    const margin = Number(settings.smartVpsProfitMarginPercent);

    if (
      plan?.enabled !== true ||
      !Number.isFinite(providerCost) ||
      providerCost <= 0
    ) {
      throw new BadRequestException(
        'This SmartVPS plan is currently unavailable',
      );
    }
    if (!Number.isFinite(margin) || margin < 0 || margin > 80) {
      throw new ServiceUnavailableException(
        'SmartVPS pricing is not configured correctly',
      );
    }

    const stockKey = Object.keys(stockResult.stock[0]?.plans ?? {}).find(
      (key) => {
        const normalized = key.toLowerCase().replace(/\s+/g, ' ').trim();
        return ramGb === 4
          ? normalized.startsWith('4 gb')
          : normalized === `${ramGb} gb`;
      },
    );

    const availableCount = stockKey
      ? stockResult.stock.reduce((total, row) => {
          const status = String(row.plans?.[stockKey] ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          return status === 'buy now'
            ? total + Math.max(0, Number(row.available) || 0)
            : total;
        }, 0)
      : 0;

    if (availableCount <= 0) {
      throw new BadRequestException(
        'This SmartVPS plan is currently out of stock',
      );
    }

    const amount =
      Math.round((providerCost / (1 - margin / 100) + Number.EPSILON) * 100) /
      100;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ServiceUnavailableException(
        'SmartVPS selling price is invalid',
      );
    }

    return { amount, planName: `SmartVPS ${ramGb} GB` };
  }

  async createOrder(userId: string, ramGb: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Active customer account not found');

    const { amount, planName } = await this.getCurrentPlan(ramGb);
    const receipt = `smartvps_${randomUUID().replaceAll('-', '').slice(0, 24)}`;

    let razorpayOrder: { id: string };
    try {
      razorpayOrder = await this.getGateway().orders.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt,
        notes: { userId, purpose: 'SMARTVPS_ORDER', ramGb: String(ramGb) },
      });
    } catch (error) {
      this.logger.error(
        'Razorpay SmartVPS order creation failed',
        error instanceof Error ? error.message : String(error),
      );
      throw new ServiceUnavailableException(
        'Unable to start SmartVPS checkout',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.smartVpsOrder.create({
        data: {
          userId,
          ramGb,
          planName,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          currency: 'INR',
        },
      });

      const payment = await tx.payment.create({
        data: {
          userId,
          smartVpsOrderId: order.id,
          purpose: 'SMARTVPS_ORDER',
          provider: 'RAZORPAY',
          razorpayOrderId: razorpayOrder.id,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          currency: 'INR',
          status: 'CREATED',
        },
      });

      return { order, payment };
    });

    return {
      orderId: result.order.id,
      paymentId: result.payment.id,
      razorpayOrderId: razorpayOrder.id,
      amount: Math.round(amount * 100),
      currency: 'INR',
      keyId: this.keyId,
      planName,
      ramGb,
    };
  }

  private async verifyGatewayPayment(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    expectedAmount: number,
  ) {
    let gatewayPayment: any;
    try {
      gatewayPayment =
        await this.getGateway().payments.fetch(razorpayPaymentId);
    } catch {
      throw new BadRequestException(
        'Unable to verify payment with the payment gateway',
      );
    }

    if (
      gatewayPayment.id !== razorpayPaymentId ||
      gatewayPayment.order_id !== razorpayOrderId ||
      gatewayPayment.status !== 'captured' ||
      gatewayPayment.amount !== Math.round(expectedAmount * 100) ||
      gatewayPayment.currency !== 'INR'
    ) {
      throw new BadRequestException(
        'Payment details do not match this SmartVPS order',
      );
    }
  }

  private async markCaptured(
    paymentId: string,
    razorpayPaymentId: string,
    signature?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'CREATED' },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId,
          ...(signature ? { razorpaySignature: signature } : {}),
        },
      });

      if (changed.count === 0) {
        const existing = await tx.payment.findUnique({
          where: { id: paymentId },
          select: { status: true, smartVpsOrderId: true },
        });
        if (existing?.status === 'CAPTURED') {
          return {
            status: 'already_processed',
            orderId: existing.smartVpsOrderId,
          };
        }
        throw new BadRequestException(
          'Payment is no longer awaiting confirmation',
        );
      }

      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { smartVpsOrderId: true },
      });

      if (!payment.smartVpsOrderId) {
        throw new BadRequestException('SmartVPS order link is missing');
      }

      const changedOrder = await tx.smartVpsOrder.updateMany({
        where: {
          id: payment.smartVpsOrderId,
          status: 'PAYMENT_PENDING',
        },
        data: { status: 'PAID', paidAt: new Date() },
      });

      if (changedOrder.count !== 1) {
        throw new BadRequestException('SmartVPS order is not awaiting payment');
      }

      return { status: 'success', orderId: payment.smartVpsOrderId };
    });
  }

  async verifyPayment(
    userId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    signature: string,
  ) {
    if (
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !signature ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      throw new BadRequestException(
        'Valid Razorpay payment details are required',
      );
    }

    const payment = await this.prisma.payment.findFirst({
      where: { userId, razorpayOrderId, purpose: 'SMARTVPS_ORDER' },
      select: {
        id: true,
        amount: true,
        status: true,
        smartVpsOrderId: true,
      },
    });

    if (!payment)
      throw new NotFoundException('SmartVPS payment order not found');

    if (payment.status === 'CAPTURED') {
      return { status: 'already_processed', orderId: payment.smartVpsOrderId };
    }

    const expectedSignature = createHmac('sha256', this.keySecret ?? '')
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const received = Buffer.from(signature, 'hex');
    const expected = Buffer.from(expectedSignature, 'hex');

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new BadRequestException('Invalid payment signature');
    }

    await this.verifyGatewayPayment(
      razorpayOrderId,
      razorpayPaymentId,
      Number(payment.amount),
    );

    return this.markCaptured(payment.id, razorpayPaymentId, signature);
  }

  async handleCapturedWebhook(
    razorpayOrderId: string,
    razorpayPaymentId: string,
  ) {
    if (!razorpayOrderId || !razorpayPaymentId) {
      return { status: 'ignored', reason: 'Missing payment identifiers' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { razorpayOrderId, purpose: 'SMARTVPS_ORDER' },
      select: {
        id: true,
        amount: true,
        status: true,
        smartVpsOrderId: true,
      },
    });

    if (!payment)
      return { status: 'ignored', reason: 'SmartVPS payment not found' };

    if (payment.status === 'CAPTURED') {
      return { status: 'already_processed', orderId: payment.smartVpsOrderId };
    }

    await this.verifyGatewayPayment(
      razorpayOrderId,
      razorpayPaymentId,
      Number(payment.amount),
    );

    return this.markCaptured(payment.id, razorpayPaymentId);
  }

  async getMyOrders(userId: string) {
    return this.prisma.smartVpsOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ramGb: true,
        planName: true,
        amount: true,
        currency: true,
        status: true,
        paidAt: true,
        provisionedAt: true,
        createdAt: true,
      },
    });
  }
}
