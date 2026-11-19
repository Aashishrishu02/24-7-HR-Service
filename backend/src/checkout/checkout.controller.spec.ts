import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckoutController } from './checkout.controller.js';
import { ForbiddenException } from '@nestjs/common';

describe('CheckoutController', () => {
  let controller: CheckoutController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      createOrder: vi.fn(),
      payWithWallet: vi.fn(),
      getOrders: vi.fn(),
      refundOrder: vi.fn(),
      reconcileOrder: vi.fn(),
    };
    controller = new CheckoutController(mockService);
  });

  it('should delegate createOrder to checkoutService with req.user.sub', async () => {
    mockService.createOrder.mockResolvedValue({ id: 'ord-1' });
    const req: any = { user: { sub: 'user-123' } };

    const result = await controller.createOrder(req, {
      planId: 'plan-1',
      operatingSystem: 'Ubuntu 22.04',
    });
    expect(result).toEqual({ id: 'ord-1' });
    expect(mockService.createOrder).toHaveBeenCalledWith(
      'user-123',
      'plan-1',
      'Ubuntu 22.04',
    );
  });

  it('should delegate payWithWallet to checkoutService', async () => {
    mockService.payWithWallet.mockResolvedValue({ message: 'Success' });
    const req: any = { user: { sub: 'user-123' } };

    const result = await controller.payWithWallet(req, 'ord-1');
    expect(result).toEqual({ message: 'Success' });
    expect(mockService.payWithWallet).toHaveBeenCalledWith('user-123', 'ord-1');
  });

  it('should delegate getOrders to checkoutService', async () => {
    mockService.getOrders.mockResolvedValue({ orders: [] });
    const req: any = { user: { sub: 'user-123' } };

    const result = await controller.getOrders(req);
    expect(result).toEqual({ orders: [] });
    expect(mockService.getOrders).toHaveBeenCalledWith('user-123');
  });

  it('should reject refundOrder if user is not ADMIN with ForbiddenException', async () => {
    const req: any = { user: { sub: 'user-customer', role: 'CUSTOMER' } };

    await expect(controller.refundOrder(req, 'ord-uuid-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockService.refundOrder).not.toHaveBeenCalled();
  });

  it('should allow refundOrder if user is ADMIN and delegate to checkoutService.refundOrder', async () => {
    mockService.refundOrder.mockResolvedValue({ status: 'REFUNDED' });
    const req: any = { user: { sub: 'admin-1', role: 'ADMIN' } };

    const result = await controller.refundOrder(req, 'ord-uuid-1');
    expect(result).toEqual({ status: 'REFUNDED' });
    expect(mockService.refundOrder).toHaveBeenCalledWith('ord-uuid-1', 'admin-1');
  });

  it('should reject reconcileOrder if user is not ADMIN with ForbiddenException', async () => {
    const req: any = { user: { sub: 'user-customer', role: 'CUSTOMER' } };

    await expect(controller.reconcileOrder(req, 'ord-uuid-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockService.reconcileOrder).not.toHaveBeenCalled();
  });

  it('should allow reconcileOrder if user is ADMIN and delegate to checkoutService.reconcileOrder', async () => {
    mockService.reconcileOrder.mockResolvedValue({ status: 'ACTIVE' });
    const req: any = { user: { sub: 'admin-1', role: 'ADMIN' } };

    const result = await controller.reconcileOrder(req, 'ord-uuid-1');
    expect(result).toEqual({ status: 'ACTIVE' });
    expect(mockService.reconcileOrder).toHaveBeenCalledWith('ord-uuid-1');
  });
});
