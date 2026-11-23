import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckoutService } from './checkout.service.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let mockPrisma: any;
  let mockInventoryAllocator: any;
  let mockProvisioningService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
      vPSPlan: {
        findFirst: vi.fn(),
      },
      order: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      vPSInstance: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      provisioningJob: {
        update: vi.fn(),
      },
      wallet: {
        findUniqueOrThrow: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      providerInventory: {
        findFirst: vi.fn(),
      },
      payment: {
        create: vi.fn(),
        update: vi.fn(),
      },
      walletTransaction: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockInventoryAllocator = {
      reserveForOrder: vi.fn(),
    };

    mockProvisioningService = {
      provisionOrder: vi.fn(),
    };

    service = new CheckoutService(
      mockPrisma,
      mockInventoryAllocator,
      mockProvisioningService,
    );
  });

  it('should create order when plan and user are valid', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      isActive: true,
    });
    mockPrisma.vPSPlan.findFirst.mockResolvedValue({
      id: 'plan-1',
      name: 'Windows VPS Pro',
      price: new Prisma.Decimal(999.0),
      currency: 'INR',
      supportedOS: ['Windows Server 2022', 'Ubuntu 22.04'],
      isActive: true,
    });
    mockPrisma.order.create.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'IC-123456',
      planId: 'plan-1',
      planName: 'Windows VPS Pro',
      operatingSystem: 'Windows Server 2022',
      amount: new Prisma.Decimal(999.0),
      currency: 'INR',
      status: 'PENDING',
      createdAt: new Date(),
    });

    const result = await service.createOrder(
      'u-1',
      'plan-1',
      'Windows Server 2022',
    );

    expect(result.message).toBe('Checkout order created successfully');
    expect(result.order.orderNumber).toBe('IC-123456');
    expect(mockPrisma.order.create).toHaveBeenCalled();
  });

  it('should reject order if OS is not supported by plan', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      isActive: true,
    });
    mockPrisma.vPSPlan.findFirst.mockResolvedValue({
      id: 'plan-1',
      name: 'Linux Only VPS',
      price: new Prisma.Decimal(499.0),
      currency: 'INR',
      supportedOS: ['Ubuntu 22.04'],
      isActive: true,
    });

    await expect(
      service.createOrder('u-1', 'plan-1', 'Windows Server 2022'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should pay with wallet and provision VPS successfully', async () => {
    const mockOrder = {
      id: 'ord-1',
      userId: 'u-1',
      orderNumber: 'IC-ORD-999',
      planId: 'plan-1',
      planName: 'Windows VPS Pro',
      operatingSystem: 'Windows Server 2022',
      amount: new Prisma.Decimal(999.0),
      currency: 'INR',
      status: 'PENDING',
      plan: {
        id: 'plan-1',
        currency: 'INR',
        isActive: true,
        supportedOS: ['Windows Server 2022'],
        cpuCores: 4,
        ramGb: 8,
        storageGb: 80,
      },
    };
    mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
    mockPrisma.providerInventory.findFirst.mockResolvedValue({
      id: 'inv-1',
      status: 'AVAILABLE',
      ipAddress: '192.168.1.100',
    });
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 'w-1',
      userId: 'u-1',
      currency: 'INR',
      balance: new Prisma.Decimal(2000.0),
    });
    mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.wallet.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.payment.create.mockResolvedValue({
      id: 'pay-1',
      amount: new Prisma.Decimal(999.0),
      status: 'CAPTURED',
    });
    mockPrisma.walletTransaction.create.mockResolvedValue({
      id: 'tx-1',
      type: 'DEBIT',
    });

    mockProvisioningService.provisionOrder.mockResolvedValue({
      job: { id: 'job-1', status: 'COMPLETED' },
      vps: { id: 'vps-1', ipAddress: '192.168.1.100', status: 'ACTIVE' },
    });

    const result = await service.payWithWallet('u-1', 'ord-1');

    expect(result.message).toBe(
      'Payment successful and VPS provisioning completed',
    );
    expect(result.payment.status).toBe('CAPTURED');
    expect(result.order.orderNumber).toBe('IC-ORD-999');
    expect((result as any).provisioning?.vps?.ipAddress).toBe('192.168.1.100');
    expect(mockProvisioningService.provisionOrder).toHaveBeenCalledWith('ord-1');
  });

  it('should reject payment if wallet balance is insufficient', async () => {
    const mockOrder = {
      id: 'ord-1',
      userId: 'u-1',
      orderNumber: 'IC-ORD-999',
      planId: 'plan-1',
      planName: 'Windows VPS Pro',
      operatingSystem: 'Windows Server 2022',
      amount: new Prisma.Decimal(999.0),
      currency: 'INR',
      status: 'PENDING',
      plan: {
        id: 'plan-1',
        currency: 'INR',
        isActive: true,
        supportedOS: ['Windows Server 2022'],
        cpuCores: 4,
        ramGb: 8,
        storageGb: 80,
      },
    };
    mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
    mockPrisma.providerInventory.findFirst.mockResolvedValue({
      id: 'inv-1',
      status: 'AVAILABLE',
      ipAddress: '192.168.1.100',
    });
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 'w-1',
      userId: 'u-1',
      currency: 'INR',
      balance: new Prisma.Decimal(100.0),
    });
    mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.payWithWallet('u-1', 'ord-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should retain wallet debit and mark order PROVISIONING when provisioning outcome is uncertain or times out', async () => {
    const mockOrder = {
      id: 'ord-uncertain',
      userId: 'u-1',
      orderNumber: 'IC-ORD-UNCERTAIN',
      planId: 'plan-1',
      planName: 'Windows VPS Pro',
      operatingSystem: 'Windows Server 2022',
      amount: new Prisma.Decimal(999.0),
      currency: 'INR',
      status: 'PENDING',
      plan: {
        id: 'plan-1',
        currency: 'INR',
        isActive: true,
        supportedOS: ['Windows Server 2022'],
        cpuCores: 4,
        ramGb: 8,
        storageGb: 80,
      },
    };
    mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
    mockPrisma.providerInventory.findFirst.mockResolvedValue({
      id: 'inv-1',
      status: 'AVAILABLE',
      ipAddress: '192.168.1.100',
    });
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 'w-1',
      userId: 'u-1',
      currency: 'INR',
      balance: new Prisma.Decimal(2000.0),
    });
    mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.wallet.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.payment.create.mockResolvedValue({
      id: 'pay-uncertain',
      amount: new Prisma.Decimal(999.0),
      status: 'CAPTURED',
    });

    // Remote provider call times out
    mockProvisioningService.provisionOrder.mockRejectedValue(
      new Error('Gateway timeout from provider upstream API'),
    );

    const result = await service.payWithWallet('u-1', 'ord-uncertain');

    // Crucial: wallet debit is RETAINED, order status is PROVISIONING, requiresReconciliation is true!
    expect(result.status).toBe('PROVISIONING');
    expect(result.requiresReconciliation).toBe(true);
    expect(result.payment.status).toBe('CAPTURED');
    expect(result.wallet.balance.toString()).toBe('1001'); // 2000 - 999
    expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord-uncertain', status: 'PAID' },
      data: { status: 'PROVISIONING' },
    });
    // Ensure automatic refund was NOT executed!
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });

  it('should attach remote VPS to order instead of refunding if provider created VPS before response timed out', async () => {
    const mockOrder = {
      id: 'ord-timeout-vps',
      userId: 'u-1',
      orderNumber: 'IC-ORDER-TIMEOUT-VPS',
      status: 'PROVISIONING',
      plan: { name: 'Windows VPS' },
      vpsInstance: null,
      payments: [
        {
          id: 'pay-1',
          status: 'CAPTURED',
          provider: 'WALLET',
          amount: new Prisma.Decimal(999.0),
        },
      ],
      provisioningJobs: [{ id: 'job-1', idempotencyKey: 'vps-provision:ord-timeout-vps' }],
    };
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder);

    // Provider search finds that remote VPS was indeed created
    const foundRemoteVps = {
      id: 'vps-remote-1',
      orderId: 'ord-timeout-vps',
      ipAddress: '103.20.50.1',
      status: 'ACTIVE',
    };
    mockPrisma.vPSInstance.findFirst.mockResolvedValue(foundRemoteVps);

    const result = await service.reconcileOrder('ord-timeout-vps');

    expect(result.status).toBe('ACTIVE');
    expect(result.message).toContain('attached to order successfully. No refund necessary');
    expect((result as any).vps?.ipAddress).toBe('103.20.50.1');

    // Verify order was marked ACTIVE
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'ord-timeout-vps' },
      data: { status: 'ACTIVE' },
    });
    // Verify NO refund was created!
    expect(mockPrisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('should atomically refund wallet during reconciliation ONLY when confirmed that no VPS was created', async () => {
    const mockOrder = {
      id: 'ord-confirmed-failed',
      userId: 'u-1',
      orderNumber: 'IC-CONFIRMED-FAILED',
      status: 'PROVISIONING',
      plan: { name: 'Windows VPS' },
      vpsInstance: null,
      payments: [
        {
          id: 'pay-failed',
          status: 'CAPTURED',
          provider: 'WALLET',
          amount: new Prisma.Decimal(999.0),
        },
      ],
      provisioningJobs: [{ id: 'job-failed' }],
    };
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
    // Confirmed: NO VPS exists in remote provider or database
    mockPrisma.vPSInstance.findFirst.mockResolvedValue(null);
    mockPrisma.walletTransaction.findFirst.mockResolvedValue(null);
    mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue({
      id: 'w-1',
      userId: 'u-1',
      balance: new Prisma.Decimal(1001.0),
    });
    mockPrisma.wallet.update.mockResolvedValue({
      id: 'w-1',
      balance: new Prisma.Decimal(2000.0),
    });

    const result = await service.reconcileOrder('ord-confirmed-failed');

    expect(result.status).toBe('REQUIRES_MANUAL_REVIEW');
    expect(result.message).toContain('No refund has been issued');
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
    expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
    expect(mockPrisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('should handle duplicate refund requests idempotently without double-crediting', async () => {
    const mockOrder = {
      id: 'ord-already-refunded',
      userId: 'u-1',
      orderNumber: 'IC-ALREADY-REFUNDED',
      status: 'FAILED',
      plan: { name: 'Windows VPS' },
      vpsInstance: null,
      payments: [
        {
          id: 'pay-refunded',
          status: 'REFUNDED',
          provider: 'WALLET',
          amount: new Prisma.Decimal(999.0),
        },
      ],
      provisioningJobs: [],
    };
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
    mockPrisma.vPSInstance.findFirst.mockResolvedValue(null);

    // Existing refund transaction found in DB
    mockPrisma.walletTransaction.findFirst.mockResolvedValue({
      id: 'tx-refund-existing',
      type: 'REFUND',
    });

    const result = await service.reconcileOrder('ord-already-refunded');

    expect(result.status).toBe('REQUIRES_MANUAL_REVIEW');
    expect(result.message).toContain('No refund has been issued');
    // Reconciliation must not credit the wallet without provider verification.
    expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
    expect(mockPrisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('should get customer orders list', async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      {
        id: 'ord-1',
        orderNumber: 'IC-123',
        amount: new Prisma.Decimal(999.0),
        status: 'ACTIVE',
        plan: { name: 'Windows VPS Pro' },
        vpsInstance: { ipAddress: '10.0.0.1', status: 'ACTIVE' },
        payments: [{ id: 'p-1', status: 'CAPTURED', provider: 'WALLET' }],
      },
    ]);

    const result = await service.getOrders('u-1');
    expect(result.total).toBe(1);
    expect(result.orders[0].orderNumber).toBe('IC-123');
  });
});
