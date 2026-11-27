import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SmartVpsOrderService } from './smartvps-order.service.js';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string; role: string };
}

@Controller('smartvps/orders')
@UseGuards(JwtAuthGuard)
export class SmartVpsOrderController {
  constructor(private readonly orders: SmartVpsOrderService) {}

  @Post('create')
  create(@Req() req: AuthenticatedRequest, @Body() body: { ramGb: number }) {
    return this.orders.createOrder(req.user.sub, Number(body?.ramGb));
  }

  @Post('verify')
  verify(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    return this.orders.verifyPayment(
      req.user.sub,
      body?.razorpay_order_id,
      body?.razorpay_payment_id,
      body?.razorpay_signature,
    );
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.orders.getMyOrders(req.user.sub);
  }
}
