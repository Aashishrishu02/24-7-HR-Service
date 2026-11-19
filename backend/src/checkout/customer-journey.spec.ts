import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletService } from '../wallet/wallet.service.js';
import { CheckoutService } from './checkout.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { createHmac } from 'node:crypto';

describe('Customer Journey E2E Flow', () => {
  let walletService: WalletService;
  let checkoutService: CheckoutService;
  let mockPrisma: any;
  let mockConfig: any;
  let mockInventoryAllocator: any;
  let mockProvisioningService: any;

  // In-memory simulated state for the user
  let inMemoryWallet: any;
  let inMemoryTransactions: any[];
  let inMemoryPayments: any[];
  let inMemoryOrders: any[];
  let inMemoryInventory: any[];
  let inMemoryVps: any[];

  beforeEach(() => {
    inMemoryWallet = {
      id: 'wallet-e2e-1',
      userId: 'customer-1',
      balance: new Prisma.Decimal('0.00'),
      currency: 'INR',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryTransactions = [];
    inMemoryPayments = [];
    inMemoryOrders = [];
    inMemoryInventory = [
      {
        id: 'inv-1',
        status: 'AVAILABLE',
        ipAddress: '103.152.112.50',
        hostname: 'vps-host-01',
        providerId: 'provider-1',
        cpuCores: 4,
        ramGb: 8,
        storageGb: 80,
        currency: 'INR',
        provider: { isActive: true, priority: 1, code: 'SMARTVPS' },
      },
    ];
    inMemoryVps = [];

    mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'customer-1',
          name: 'Ashish Kumar',
          email: 'customer@example.com',
          isActive: true,
        }),
      },
      wallet: {
        upsert: vi.fn().mockImplementation(async () => ({ ...inMemoryWallet })),
        findUnique: vi.fn().mockImplementation(async () => ({ ...inMemoryWallet })),
        findUniqueOrThrow: vi.fn().mockImplementation(async () => ({ ...inMemoryWallet })),
        update: vi.fn().mockImplementation(async ({ data }: any) => {
          if (data.balance?.increment) {
            inMemoryWallet.balance = inMemoryWallet.balance.add(data.balance.increment);
          } else if (data.balance?.decrement) {
            inMemoryWallet.balance = inMemoryWallet.balance.sub(data.balance.decrement);
          }
          return inMemoryWallet;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
          if (where.balance?.gte && inMemoryWallet.balance.lt(where.balance.gte)) {
            return { count: 0 };
          }
          if (data.balance?.decrement) {
            inMemoryWallet.balance = inMemoryWallet.balance.sub(data.balance.decrement);
          }
          return { count: 1 };
        }),
      },
      walletTransaction: {
        findFirst: vi.fn().mockImplementation(async () => null),
        findMany: vi.fn().mockImplementation(async () => inMemoryTransactions),
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const tx = { id: `tx-${inMemoryTransactions.length + 1}`, ...data, createdAt: new Date() };
          inMemoryTransactions.unshift(tx);
          return tx;
        }),
      },
      payment: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const p = { id: `pay-${inMemoryPayments.length + 1}`, ...data, createdAt: new Date() };
          inMemoryPayments.push(p);
          return p;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          return inMemoryPayments.find(
            (p) => p.userId === where.userId && p.razorpayOrderId === where.razorpayOrderId,
          ) || null;
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return inMemoryPayments.find((p) => p.id === where.id) || null;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const p = inMemoryPayments.find((x) => x.id === where.id && x.status === where.status);
          if (p) {
            Object.assign(p, data);
            return { count: 1 };
          }
          return { count: 0 };
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const p = inMemoryPayments.find((x) => x.id === where.id);
          if (p) Object.assign(p, data);
          return p;
        }),
      },
      vPSPlan: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'plan-vps-pro',
          name: 'Windows VPS Pro',
          productType: 'VPS_HOSTING',
          price: new Prisma.Decimal('999.00'),
          currency: 'INR',
          supportedOS: ['Windows Server 2022', 'Ubuntu 22.04'],
          durationDays: 30,
          cpuCores: 4,
          ramGb: 8,
          storageGb: 80,
          isActive: true,
        }),
      },
      order: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const ord = { id: `ord-${inMemoryOrders.length + 1}`, ...data, createdAt: new Date() };
          inMemoryOrders.push(ord);
          return ord;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          const ord = inMemoryOrders.find((o) => o.id === where.id && o.userId === where.userId);
          if (ord) {
            ord.plan = {
              id: 'plan-vps-pro',
              currency: 'INR',
              isActive: true,
              supportedOS: ['Windows Server 2022'],
              cpuCores: 4,
              ramGb: 8,
              storageGb: 80,
            };
          }
          return ord || null;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const ord = inMemoryOrders.find((o) => o.id === where.id && o.status === where.status);
          if (ord) {
            Object.assign(ord, data);
            return { count: 1 };
          }
          return { count: 0 };
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const ord = inMemoryOrders.find((o) => o.id === where.id);
          if (ord) Object.assign(ord, data);
          return ord;
        }),
        findMany: vi.fn().mockImplementation(async () => {
          return inMemoryOrders.map((o) => ({
            ...o,
            vpsInstance: inMemoryVps.find((v) => v.orderId === o.id) || null,
            payments: inMemoryPayments.filter((p) => p.orderId === o.id),
          }));
        }),
      },
      providerInventory: {
        findFirst: vi.fn().mockImplementation(async () => inMemoryInventory[0]),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    const keySecret = 'secret_test_key_123';
    mockConfig = {
      get: vi.fn((key: string) => {
        if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_123';
        if (key === 'RAZORPAY_KEY_SECRET') return keySecret;
        return null;
      }),
    };

    mockInventoryAllocator = {
      reserveForOrder: vi.fn().mockImplementation(async () => inMemoryInventory[0]),
    };

    mockProvisioningService = {
      provisionOrder: vi.fn().mockImplementation(async (orderId: string) => {
        const vps = {
          id: 'vps-inst-1',
          orderId,
          userId: 'customer-1',
          ipAddress: '103.152.112.50',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        };
        inMemoryVps.push(vps);
        const ord = inMemoryOrders.find((o) => o.id === orderId);
        if (ord) ord.status = 'ACTIVE';
        return {
          job: { id: 'job-1', status: 'COMPLETED' },
          vps,
        };
      }),
    };

    walletService = new WalletService(mockPrisma, mockConfig);
    (walletService as any).razorpay = {
      orders: {
        create: vi.fn().mockResolvedValue({ id: 'order_test_rzp_123' }),
      },
      payments: {
        fetch: vi.fn().mockResolvedValue({
          id: 'pay_test_rzp_456',
          order_id: 'order_test_rzp_123',
          status: 'captured',
          amount: 200000,
          currency: 'INR',
        }),
      },
    };

    checkoutService = new CheckoutService(mockPrisma, mockInventoryAllocator, mockProvisioningService);
  });

  it('completes the entire customer journey successfully', async () => {
    const userId = 'customer-1';
    const keySecret = 'secret_test_key_123';

    // Step 1: Initial wallet balance is 0
    const initialWallet = await walletService.getWallet(userId);
    expect(initialWallet.balance.toString()).toBe('0');

    // Step 2: Attempting to buy a ₹999 plan with 0 balance fails
    const initialOrder = await checkoutService.createOrder(userId, 'plan-vps-pro', 'Windows Server 2022');
    await expect(checkoutService.payWithWallet(userId, initialOrder.order.id)).rejects.toThrow(
      'Insufficient wallet balance. Please add money to your wallet.',
    );

    // Step 3: Customer adds funds (Top-up ₹2,000)
    const topupRes = await walletService.createTopup(userId, 2000);
    expect(topupRes.amount).toBe(200000); // 2000 INR in paise

    // Step 4: Verify topup with valid Razorpay HMAC SHA-256 signature and credit wallet
    const paymentId = 'pay_test_rzp_456';
    const validSignature = createHmac('sha256', keySecret)
      .update(`${topupRes.razorpayOrderId}|${paymentId}`)
      .digest('hex');

    const verifyRes = await walletService.verifyTopup(
      userId,
      topupRes.razorpayOrderId,
      paymentId,
      validSignature,
    );
    expect(verifyRes.message).toBe('Wallet credited successfully');
    expect(verifyRes.balance.toString()).toBe('2000');

    // Verify transaction history has CREDIT
    const txListAfterTopup = await walletService.getTransactions(userId);
    expect(txListAfterTopup.transactions.length).toBe(1);
    expect(txListAfterTopup.transactions[0].type).toBe('CREDIT');
    expect(txListAfterTopup.transactions[0].amount.toString()).toBe('2000');

    // Step 5: Checkout plan with sufficient balance
    const checkoutOrder = await checkoutService.createOrder(userId, 'plan-vps-pro', 'Windows Server 2022');
    expect(checkoutOrder.order.status).toBe('PENDING');

    // Step 6: Pay with wallet
    const payResult = await checkoutService.payWithWallet(userId, checkoutOrder.order.id);
    expect(payResult.message).toBe('Payment successful and VPS provisioning completed');
    expect(payResult.payment.status).toBe('CAPTURED');
    expect(payResult.wallet.balance.toString()).toBe('1001'); // 2000 - 999 // 2000 - 999
    expect((payResult as any).provisioning?.vps?.ipAddress).toBe('103.152.112.50');
    expect((payResult as any).provisioning?.vps?.status).toBe('ACTIVE');

    // Step 7: Check wallet balance and transactions after order
    const updatedWallet = await walletService.getWallet(userId);
    expect(updatedWallet.balance.toString()).toBe('1001');

    const txListFinal = await walletService.getTransactions(userId);
    expect(txListFinal.transactions.length).toBe(2);
    expect(txListFinal.transactions[0].type).toBe('DEBIT');
    expect(txListFinal.transactions[0].amount.toString()).toBe('999');
    expect(txListFinal.transactions[1].type).toBe('CREDIT');

    // Step 8: Check Orders list
    const customerOrders = await checkoutService.getOrders(userId);
    expect(customerOrders.total).toBe(2);
    const activeOrder: any = customerOrders.orders.find((o: any) => o.id === checkoutOrder.order.id);
    expect(activeOrder?.status).toBe('ACTIVE');
    expect(activeOrder?.vpsInstance?.ipAddress).toBe('103.152.112.50');
    expect(activeOrder?.vpsInstance?.status).toBe('ACTIVE');
  });
});
