import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletController } from './wallet.controller.js';

describe('WalletController', () => {
  let controller: WalletController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getWallet: vi.fn(),
      getTransactions: vi.fn(),
      createTopup: vi.fn(),
      verifyTopup: vi.fn(),
    };
    controller = new WalletController(mockService);
  });

  it('should delegate getWallet to walletService with req.user.sub', async () => {
    mockService.getWallet.mockResolvedValue({ balance: 500 });
    const req: any = { user: { sub: 'user-123' } };

    const result = await controller.getWallet(req);
    expect(result).toEqual({ balance: 500 });
    expect(mockService.getWallet).toHaveBeenCalledWith('user-123');
  });

  it('should delegate getTransactions with limit and cursor', async () => {
    mockService.getTransactions.mockResolvedValue({ transactions: [] });
    const req: any = { user: { sub: 'user-123' } };

    await controller.getTransactions(req, 20, 'cursor-abc');
    expect(mockService.getTransactions).toHaveBeenCalledWith(
      'user-123',
      20,
      'cursor-abc',
    );
  });

  it('should delegate createTopup', async () => {
    mockService.createTopup.mockResolvedValue({ razorpayOrderId: 'ord_123' });
    const req: any = { user: { sub: 'user-123' } };

    const result = await controller.createTopup(req, { amount: 500 });
    expect(result.razorpayOrderId).toBe('ord_123');
    expect(mockService.createTopup).toHaveBeenCalledWith('user-123', 500);
  });

  it('should delegate verifyTopup', async () => {
    mockService.verifyTopup.mockResolvedValue({ message: 'Success' });
    const req: any = { user: { sub: 'user-123' } };

    const result = await controller.verifyTopup(req, {
      razorpay_order_id: 'ord_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig_1',
    });
    expect(result.message).toBe('Success');
    expect(mockService.verifyTopup).toHaveBeenCalledWith(
      'user-123',
      'ord_1',
      'pay_1',
      'sig_1',
    );
  });
});
