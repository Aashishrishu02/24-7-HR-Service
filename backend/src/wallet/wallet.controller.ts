import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WalletService } from './wallet.service.js';
import { CreateTopupDto } from './dto/create-topup.dto.js';
import { VerifyTopupDto } from './dto/verify-topup.dto.js';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
  };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWallet(req.user.sub);
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.walletService.getTransactions(
      req.user.sub,
      Math.min(Math.max(limit, 1), 100),
      cursor,
    );
  }

  @Post('topup/create')
  async createTopup(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTopupDto,
  ) {
    return this.walletService.createTopup(req.user.sub, dto.amount);
  }

  @Post('topup/verify')
  async verifyTopup(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VerifyTopupDto,
  ) {
    return this.walletService.verifyTopup(
      req.user.sub,
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );
  }
}
