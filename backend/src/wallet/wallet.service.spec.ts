import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletService } from './wallet.service.js';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { createHmac } from 'node:crypto';

describe('WalletService', () => {
  let service: WalletService;
  let mockPrisma: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
      wallet: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      payment: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      walletTransaction: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockConfig = {
      get: vi.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return null;
      }),
    };

    service = new WalletService(mockPrisma, mockConfig);
  });

  it('should return or create wallet on getWallet', async () => {
    const mockWallet = {
      id: 'w-1',
      userId: 'u-1',
      currency: 'INR',
      balance: new Prisma.Decimal(1500.0),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.wallet.upsert.mockResolvedValue(mockWallet);

    const result = await service.getWallet('u-1');
    expect(result.id).toBe('w-1');
    expect(result.balance.toString()).toBe('1500');
    expect(mockPrisma.wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u-1' },
        create: { userId: 'u-1' },
        update: {},
      }),
    );
  });

  it('should reject topup when Razorpay is not configured', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'customer@test.com',
      isActive: true,
    });

    await expect(service.createTopup('u-1', 500)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should reject topup amount below 100', async () => {
    await expect(service.createTopup('u-1', 50)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should verify real Razorpay topup with valid signature and API confirmation', async () => {
    const keySecret = 'secret_test_key_123';
    mockConfig.get = vi.fn((key: string) => {
      if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_123';
      if (key === 'RAZORPAY_KEY_SECRET') return keySecret;
      return null;
    });

    // Reinitialize service with razorpay keys
    const rzpService = new WalletService(mockPrisma, mockConfig);
    const orderId = 'order_real_123';
    const paymentId = 'pay_real_456';
    const validSignature = createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Mock razorpay payment fetch
    (rzpService as any).razorpay = {
      payments: {
        fetch: vi.fn().mockResolvedValue({
          id: paymentId,
          order_id: orderId,
          status: 'captured',
          amount: 50000,
          currency: 'INR',
        }),
      },
    };

    const mockPayment = {
      id: 'pay-real-id',
      userId: 'u-1',
      amount: new Prisma.Decimal(500.0),
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: orderId,
    };
    mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 'w-1',
      userId: 'u-1',
      currency: 'INR',
      balance: new Prisma.Decimal(1000.0),
    });
    mockPrisma.wallet.update.mockResolvedValue({
      id: 'w-1',
      balance: new Prisma.Decimal(1500.0),
      currency: 'INR',
    });

    const result = await rzpService.verifyTopup(
      'u-1',
      orderId,
      paymentId,
      validSignature,
    );

    expect(result.message).toBe('Wallet credited successfully');
    expect(result.balance.toString()).toBe('1500');
  });

  it('should reject real Razorpay topup with invalid signature', async () => {
    mockConfig.get = vi.fn((key: string) => {
      if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_123';
      if (key === 'RAZORPAY_KEY_SECRET') return 'secret_test_key_123';
      return null;
    });

    const rzpService = new WalletService(mockPrisma, mockConfig);
    const mockPayment = {
      id: 'pay-real-id',
      userId: 'u-1',
      amount: new Prisma.Decimal(500.0),
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: 'order_real_123',
    };
    mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);

    // 64-char invalid hex signature
    const invalidSig = 'a'.repeat(64);

    await expect(
      rzpService.verifyTopup(
        'u-1',
        'order_real_123',
        'pay_real_456',
        invalidSig,
      ),
    ).rejects.toThrow('Invalid payment signature');
  });

  it('should handle duplicate topup verification idempotently', async () => {
    const mockPayment = {
      id: 'pay-1',
      userId: 'u-1',
      amount: new Prisma.Decimal(500.0),
      currency: 'INR',
      status: 'CAPTURED',
      razorpayOrderId: 'order_demo_test_1',
    };
    mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);
    mockPrisma.walletTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      type: 'CREDIT',
    });
    mockPrisma.wallet.findUnique.mockResolvedValue({
      id: 'w-1',
      balance: new Prisma.Decimal(1500.0),
      currency: 'INR',
    });

    const result = await service.verifyTopup(
      'u-1',
      'order_demo_test_1',
      'pay_mock_1',
      'sig',
    );

    expect(result.message).toBe('Payment already processed');
    expect(result.balance.toString()).toBe('1500');
    expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
  });

  it("should prevent crediting another user's wallet when payment belongs to a different user", async () => {
    // When an attacker attempts to claim another user's orderId, findFirst scoped to attacker returns null
    mockPrisma.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.verifyTopup(
        'attacker-user-id',
        'order_legit_user_1',
        'pay_123',
        'sig_123',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject real Razorpay topup if gateway status is not captured', async () => {
    const keySecret = 'secret_test_key_123';
    mockConfig.get = vi.fn((key: string) => {
      if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_123';
      if (key === 'RAZORPAY_KEY_SECRET') return keySecret;
      return null;
    });

    const rzpService = new WalletService(mockPrisma, mockConfig);
    const orderId = 'order_real_failed_status';
    const paymentId = 'pay_real_failed_status';
    const validSignature = createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    (rzpService as any).razorpay = {
      payments: {
        fetch: vi.fn().mockResolvedValue({
          id: paymentId,
          order_id: orderId,
          status: 'failed', // Not captured!
          amount: 50000,
          currency: 'INR',
        }),
      },
    };

    const mockPayment = {
      id: 'pay-failed-status-id',
      userId: 'u-1',
      amount: new Prisma.Decimal(500.0),
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: orderId,
    };
    mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);

    await expect(
      rzpService.verifyTopup('u-1', orderId, paymentId, validSignature),
    ).rejects.toThrow('Razorpay payment details do not match the order');
  });

  it('should reject real Razorpay topup if gateway amount does not match order amount', async () => {
    const keySecret = 'secret_test_key_123';
    mockConfig.get = vi.fn((key: string) => {
      if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_123';
      if (key === 'RAZORPAY_KEY_SECRET') return keySecret;
      return null;
    });

    const rzpService = new WalletService(mockPrisma, mockConfig);
    const orderId = 'order_real_mismatched_amount';
    const paymentId = 'pay_real_mismatched_amount';
    const validSignature = createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    (rzpService as any).razorpay = {
      payments: {
        fetch: vi.fn().mockResolvedValue({
          id: paymentId,
          order_id: orderId,
          status: 'captured',
          amount: 10000, // 100 INR instead of 500 INR
          currency: 'INR',
        }),
      },
    };

    const mockPayment = {
      id: 'pay-mismatched-amount-id',
      userId: 'u-1',
      amount: new Prisma.Decimal(500.0), // 500 INR
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: orderId,
    };
    mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);

    await expect(
      rzpService.verifyTopup('u-1', orderId, paymentId, validSignature),
    ).rejects.toThrow('Razorpay payment details do not match the order');
  });
});
