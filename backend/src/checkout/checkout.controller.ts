import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CheckoutService } from './checkout.service.js';
import { CreateCheckoutOrderDto } from './dto/create-checkout-order.dto.js';
import { VerifyVpsPaymentDto } from './dto/verify-vps-payment.dto.js';
import { DirectHostHeavenCheckoutDto } from '../hostheaven/dto/direct-checkout.dto.js';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
  };
}

@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('orders')
  async createOrder(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCheckoutOrderDto,
  ) {
    return this.checkoutService.createOrder(
      req.user.sub,
      dto.planId,
      dto.operatingSystem,
    );
  }

  @Post('orders/:orderId/razorpay/create')
  async createRazorpayOrder(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.checkoutService.createRazorpayOrder(
      req.user.sub,
      orderId,
    );
  }

  @Post('orders/:orderId/razorpay/verify')
  async verifyRazorpayPayment(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: VerifyVpsPaymentDto,
  ) {
    return this.checkoutService.verifyRazorpayPayment(
      req.user.sub,
      orderId,
      dto,
    );
  }

  @Post('hostheaven/checkout')
  async directHostHeavenCheckout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DirectHostHeavenCheckoutDto,
  ) {
    return this.checkoutService.checkoutDirectHostHeaven(req.user.sub, dto);
  }

  @Post('orders/:orderId/pay-wallet')
  async payWithWallet(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.checkoutService.payWithWallet(req.user.sub, orderId);
  }

  @Get('orders')
  async getOrders(@Req() req: AuthenticatedRequest) {
    return this.checkoutService.getOrders(req.user.sub);
  }

  @Post('orders/:orderId/refund')
  async refundOrder(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only authorized administrators can process manual order refunds',
      );
    }
    return this.checkoutService.refundOrder(orderId, req.user.sub);
  }

  @Post('orders/:orderId/reconcile')
  async reconcileOrder(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only authorized administrators can reconcile orders',
      );
    }
    return this.checkoutService.reconcileOrder(orderId);
  }
}
