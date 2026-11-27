import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { RenewalService } from '../renewal/renewal.service.js';
import { CheckoutService } from '../checkout/checkout.service.js';
import { SmartVpsOrderService } from '../vps/smartvps-order.service.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provisioningService: ProvisioningService,
    private readonly renewalService: RenewalService,
    @Inject(forwardRef(() => CheckoutService))
    private readonly checkoutService: CheckoutService,
    private readonly smartVpsOrderService: SmartVpsOrderService,
  ) {}

  /**
   * Verify Razorpay Webhook Signature using HMAC-SHA256
   */
  verifySignature(
    rawBody: Buffer | string | undefined,
    signature: string | undefined,
  ): boolean {
    const webhookSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');

    // If webhook secret is not set or placeholder in dev, log a warning and proceed
    if (!webhookSecret || webhookSecret === 'rzp_webhook_secret_placeholder') {
      this.logger.warn(
        'RAZORPAY_WEBHOOK_SECRET is not configured or is placeholder. Skipping signature verification in dev mode.',
      );
      return true;
    }

    if (!signature || !rawBody) {
      this.logger.error('Missing Razorpay webhook signature or raw body');
      return false;
    }

    try {
      const bodyString = Buffer.isBuffer(rawBody)
        ? rawBody.toString('utf8')
        : String(rawBody);
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(bodyString)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const receivedBuffer = Buffer.from(signature, 'utf8');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch (err: any) {
      this.logger.error(`Webhook signature verification error: ${err.message}`);
      return false;
    }
  }

  /**
   * Main Webhook Event Handler
   */
  async handleRazorpayEvent(event: any, rawBody?: Buffer, signature?: string) {
    // 1. Signature Verification
    const isValid = this.verifySignature(rawBody, signature);
    if (!isValid) {
      this.logger.error('Invalid Razorpay webhook signature received');
      throw new UnauthorizedException('Invalid Razorpay webhook signature');
    }

    const eventName = event?.event;
    this.logger.log(`Received Razorpay webhook event: ${eventName}`);

    if (!eventName) {
      return { status: 'ignored', reason: 'No event specified' };
    }

    // Handle payment.captured or order.paid
    if (eventName === 'payment.captured' || eventName === 'order.paid') {
      return this.processPaymentSuccess(event);
    }

    if (eventName === 'payment.failed') {
      return this.processPaymentFailure(event);
    }

    return { status: 'acknowledged', event: eventName };
  }

  /**
   * Process successful payment from Razorpay Webhook
   */
  private async processPaymentSuccess(event: any) {
    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;

    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const razorpayPaymentId = paymentEntity?.id;

    if (!razorpayOrderId && !razorpayPaymentId) {
      this.logger.warn(
        'Webhook event missing razorpay order/payment identifiers',
      );
      return { status: 'ignored', reason: 'Missing order_id and payment_id' };
    }

    // Find payment record in our DB
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          ...(razorpayOrderId ? [{ razorpayOrderId }] : []),
          ...(razorpayPaymentId ? [{ razorpayPaymentId }] : []),
        ],
      },
      include: {
        order: true,
        user: true,
      },
    });

    if (!payment) {
      this.logger.warn(
        `Payment record not found for Razorpay order ${razorpayOrderId} / payment ${razorpayPaymentId}. Checking notes.`,
      );
      return {
        status: 'ignored',
        reason: 'Payment record not found in system',
      };
    }

    // Idempotency: if already CAPTURED, do not re-process
    if (payment.status === 'CAPTURED') {
      this.logger.log(
        `Payment ${payment.id} already processed. Skipping duplicate webhook.`,
      );
      return { status: 'already_processed', paymentId: payment.id };
    }

    this.logger.log(
      `Processing webhook payment ${payment.id} with purpose: ${payment.purpose}`,
    );

    switch (payment.purpose) {
      case 'WALLET_TOPUP':
        return this.handleWalletTopupSuccess(payment, razorpayPaymentId);

      case 'VPS_ORDER':
        return this.handleVpsOrderSuccess(payment, razorpayPaymentId);

      case 'VPS_RENEWAL':
        return this.handleVpsRenewalSuccess(payment, razorpayPaymentId, event);

      case 'SMARTVPS_ORDER':
        if (!razorpayPaymentId || !razorpayOrderId) {
          return { status: 'awaiting_payment_details' };
        }
        return this.smartVpsOrderService.handleCapturedWebhook(
          razorpayOrderId,
          razorpayPaymentId,
        );

      default:
        this.logger.warn(`Unknown payment purpose: ${payment.purpose}`);
        return { status: 'unhandled_purpose', purpose: payment.purpose };
    }
  }

  /**
   * Handle Wallet Top-Up Fulfillment via Webhook
   */
  private async handleWalletTopupSuccess(
    payment: any,
    razorpayPaymentId?: string,
  ) {
    const payId =
      razorpayPaymentId || payment.razorpayPaymentId || `webhook_${Date.now()}`;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId: payment.userId },
        create: { userId: payment.userId },
        update: {},
      });

      const updatedPayment = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: 'CREATED',
        },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId: payId,
        },
      });

      if (updatedPayment.count === 0) {
        return; // Already processed concurrently
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          paymentId: payment.id,
          type: 'CREDIT',
          amount: payment.amount,
          currency: 'INR',
          reference: payId,
          idempotencyKey: `topup:${payId}`,
          description: 'Wallet top-up through Razorpay (Webhook Verified)',
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            increment: payment.amount,
          },
        },
      });
    });

    this.logger.log(
      `Successfully credited wallet for user ${payment.userId} with ₹${payment.amount}`,
    );
    return { status: 'success', action: 'WALLET_TOPUP_CREDITED' };
  }

  /**
   * Handle Direct VPS Order Purchase Fulfillment via Webhook
   */
  private async handleVpsOrderSuccess(
    payment: any,
    razorpayPaymentId?: string,
  ) {
    if (!payment.orderId) {
      this.logger.error(
        `Payment ${payment.id} marked as VPS_ORDER but missing orderId`,
      );
      return {
        status: 'error',
        reason: 'Missing orderId on VPS_ORDER payment',
      };
    }

    const payId =
      razorpayPaymentId || payment.razorpayPaymentId || `webhook_${Date.now()}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          id: payment.orderId,
          status: 'PENDING',
        },
        data: { status: 'PAID' },
      });

      await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: 'CREATED',
        },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId: payId,
        },
      });
    });

    if (this.checkoutService && payment.orderId) {
      try {
        const hhResult =
          await this.checkoutService.tryFulfillHostHeavenProvisioning(
            payment.orderId,
            payment.id,
            payment.userId,
          );
        if (hhResult) {
          this.logger.log(
            `HostHeaven provisioning executed via webhook: ${JSON.stringify(hhResult)}`,
          );
          return {
            status: 'success',
            action: 'HOSTHEAVEN_VPS_PROVISIONED',
            result: hhResult,
          };
        }
      } catch (hhErr: any) {
        this.logger.error(
          `Error running HostHeaven provisioning in webhook for order ${payment.orderId}: ${hhErr.message}`,
        );
      }
    }

    // Trigger asynchronous VPS provisioning job
    try {
      await this.provisioningService.provisionOrder(payment.orderId);
      this.logger.log(
        `Triggered provisioning for order ${payment.orderId} via webhook`,
      );
    } catch (provisionErr: any) {
      this.logger.error(
        `Provisioning trigger error for order ${payment.orderId}: ${provisionErr.message}`,
      );
      await this.prisma.order.updateMany({
        where: { id: payment.orderId, status: 'PAID' },
        data: { status: 'PROVISIONING' },
      });
    }

    return { status: 'success', action: 'VPS_ORDER_PAID_AND_PROVISIONED' };
  }

  /**
   * Handle Direct VPS Renewal Fulfillment via Webhook
   */
  private async handleVpsRenewalSuccess(
    payment: any,
    razorpayPaymentId?: string,
    event?: any,
  ) {
    const payId =
      razorpayPaymentId || payment.razorpayPaymentId || `webhook_${Date.now()}`;
    const notes = event?.payload?.payment?.entity?.notes || {};
    const vpsId = notes?.vpsId;

    // Use RenewalService helper to apply renewal
    const result = await this.renewalService.applyVpsRenewalFromPayment({
      paymentId: payment.id,
      userId: payment.userId,
      razorpayPaymentId: payId,
      vpsIdHint: vpsId,
    });

    this.logger.log(
      `VPS renewal applied via webhook for payment ${payment.id}: ${JSON.stringify(result)}`,
    );
    return { status: 'success', action: 'VPS_RENEWAL_APPLIED', result };
  }

  /**
   * Process payment.failed event
   */
  private async processPaymentFailure(event: any) {
    const paymentEntity = event?.payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id;
    const razorpayPaymentId = paymentEntity?.id;

    if (razorpayOrderId) {
      const failed = await this.prisma.payment.updateMany({
        where: { razorpayOrderId, status: 'CREATED' },
        data: {
          status: 'FAILED',
          razorpayPaymentId: razorpayPaymentId || null,
        },
      });

      if (failed.count > 0) {
        const smartVpsPayment = await this.prisma.payment.findFirst({
          where: { razorpayOrderId, purpose: 'SMARTVPS_ORDER' },
          select: { smartVpsOrderId: true },
        });

        if (smartVpsPayment?.smartVpsOrderId) {
          await this.prisma.smartVpsOrder.updateMany({
            where: {
              id: smartVpsPayment.smartVpsOrderId,
              status: 'PAYMENT_PENDING',
            },
            data: { status: 'CANCELLED' },
          });
        }
      }

      this.logger.warn(
        `Marked payment for order ${razorpayOrderId} as FAILED from webhook`,
      );
    }

    return { status: 'acknowledged', action: 'PAYMENT_MARKED_FAILED' };
  }
}
