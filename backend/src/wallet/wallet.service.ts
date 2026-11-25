import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import Razorpay from 'razorpay';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly razorpay: Razorpay | null;
  private readonly keyId: string | undefined;
  private readonly keySecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    this.keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');

    if (this.keyId && this.keySecret) {
      this.razorpay = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
    } else {
      this.razorpay = null;
    }
  }

  private getRazorpay(): Razorpay {
    if (!this.razorpay || !this.keyId || !this.keySecret) {
      throw new ServiceUnavailableException('Razorpay payment service is not configured');
    }
    return this.razorpay;
  }

  async getWallet(userId: string) {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: {
        id: true,
        balance: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getTransactions(userId: string, limit = 20, cursor?: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wallet) {
      return {
        transactions: [],
        nextCursor: null,
      };
    }

    if (cursor) {
      const cursorTransaction = await this.prisma.walletTransaction.findFirst({
        where: {
          id: cursor,
          walletId: wallet.id,
        },
        select: { id: true },
      });

      if (!cursorTransaction) {
        throw new BadRequestException('Invalid transaction cursor');
      }
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const transactions = await this.prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
      },
      take: safeLimit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });

    const hasMore = transactions.length > safeLimit;
    const items = hasMore ? transactions.slice(0, safeLimit) : transactions;

    return {
      transactions: items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async createTopup(userId: string, amount: number) {
    const minimum = Number(this.config.get('TOPUP_MIN_AMOUNT') ?? 100);
    const maximum = Number(this.config.get('TOPUP_MAX_AMOUNT') ?? 100000);

    if (
      !Number.isFinite(amount) ||
      amount < minimum ||
      amount > maximum ||
      Math.round(amount * 100) !== amount * 100
    ) {
      throw new BadRequestException(`Top-up amount must be between ₹${minimum} and ₹${maximum}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('Active customer account not found');
    }

    const amountPaise = Math.round(amount * 100);
    const receipt = `topup_${randomUUID().replaceAll('-', '').slice(0, 24)}`;

    if (!this.razorpay || !this.keyId || !this.keySecret) {
      throw new ServiceUnavailableException(
        'Payment gateway is not configured. Please supply Razorpay credentials.',
      );
    }

    let razorpayOrderId: string;
    try {
      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          userId,
          purpose: 'WALLET_TOPUP',
        },
      });
      razorpayOrderId = razorpayOrder.id;
    } catch (error: unknown) {
      const err = error as any;
      const gatewayError = err?.error ?? err?.response?.data?.error ?? {};

      this.logger.error(
        'Razorpay wallet top-up order creation failed',
        JSON.stringify({
          statusCode: err?.statusCode ?? err?.response?.status ?? null,
          code: gatewayError?.code ?? err?.code ?? null,
          description: gatewayError?.description ?? err?.description ?? null,
          reason: gatewayError?.reason ?? err?.reason ?? null,
          message: typeof err?.message === 'string'
            ? err.message.slice(0, 300)
            : null,
        }),
      );

      throw new InternalServerErrorException('Unable to create Razorpay order');
    }

    try {
      const payment = await this.prisma.payment.create({
        data: {
          userId,
          purpose: 'WALLET_TOPUP',
          provider: 'RAZORPAY',
          razorpayOrderId,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          currency: 'INR',
          status: 'CREATED',
        },
      });

      return {
        paymentId: payment.id,
        razorpayOrderId,
        amount: amountPaise,
        currency: 'INR',
        keyId: this.keyId,
      };
    } catch {
      throw new InternalServerErrorException(
        'Order was created, but payment record could not be saved. Contact support before retrying.',
      );
    }
  }

  async verifyTopup(
    userId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        userId,
        purpose: 'WALLET_TOPUP',
        razorpayOrderId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment order not found');
    }

    if (payment.status === 'CAPTURED') {
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId },
        select: {
          balance: true,
          currency: true,
        },
      });

      return {
        message: 'Payment already processed',
        balance: wallet?.balance ?? new Prisma.Decimal(0),
        currency: wallet?.currency ?? 'INR',
      };
    }

    if (payment.status !== 'CREATED') {
      throw new BadRequestException('Payment is not eligible for verification');
    }

    if (!this.razorpay || !this.keySecret) {
      throw new ServiceUnavailableException(
        'Razorpay payment verification service is unavailable',
      );
    }

    if (!/^[a-fA-F0-9]{64}$/.test(razorpaySignature)) {
      throw new BadRequestException('Invalid payment signature format');
    }

    const expectedSignature = createHmac('sha256', this.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const received = Buffer.from(razorpaySignature, 'hex');
    const expected = Buffer.from(expectedSignature, 'hex');

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new BadRequestException('Invalid payment signature');
    }

    let razorpayPayment: any;
    try {
      razorpayPayment = await this.razorpay.payments.fetch(razorpayPaymentId);
    } catch {
      throw new BadRequestException(
        'Unable to verify Razorpay payment with gateway',
      );
    }

    if (
      razorpayPayment.id !== razorpayPaymentId ||
      razorpayPayment.order_id !== razorpayOrderId ||
      razorpayPayment.status !== 'captured' ||
      razorpayPayment.amount !== Math.round(Number(payment.amount) * 100) ||
      razorpayPayment.currency !== 'INR'
    ) {
      throw new BadRequestException(
        'Razorpay payment details do not match the order',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });

        const updatedPayment = await tx.payment.updateMany({
          where: {
            id: payment.id,
            userId,
            status: 'CREATED',
          },
          data: {
            status: 'CAPTURED',
            razorpayPaymentId,
            razorpaySignature,
          },
        });

        if (updatedPayment.count === 0) {
          const existingPayment = await tx.payment.findUnique({
            where: { id: payment.id },
          });

          if (existingPayment?.status === 'CAPTURED') {
            const currentWallet = await tx.wallet.findUnique({
              where: { userId },
              select: {
                balance: true,
                currency: true,
              },
            });

            return {
              message: 'Payment already processed',
              balance: currentWallet?.balance ?? new Prisma.Decimal(0),
              currency: currentWallet?.currency ?? 'INR',
            };
          }

          throw new BadRequestException('Payment has already been processed');
        }

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            paymentId: payment.id,
            type: 'CREDIT',
            amount: payment.amount,
            currency: 'INR',
            reference: razorpayPaymentId,
            idempotencyKey: `topup:${razorpayPaymentId}`,
            description: 'Wallet top-up through Razorpay',
          },
        });

        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: {
              increment: payment.amount,
            },
          },
        });

        return {
          message: 'Wallet credited successfully',
          balance: updatedWallet.balance,
          currency: updatedWallet.currency,
        };
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Wallet credit could not be completed');
    }
  }
}
