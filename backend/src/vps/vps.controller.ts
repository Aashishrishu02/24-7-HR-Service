
import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Body,
  UseGuards,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { VpsService } from './vps.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RenewalService } from '../renewal/renewal.service.js';
import { UpdateAutoRenewDto } from '../renewal/dto/update-auto-renew.dto.js';
import { HostHeavenService } from '../hostheaven/hostheaven.service.js';
import { VerifyVpsPaymentDto } from '../checkout/dto/verify-vps-payment.dto.js';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
  };
}

@Controller('vps')
@UseGuards(JwtAuthGuard)
export class VpsController {
  constructor(
    private readonly vpsService: VpsService,
    private readonly prisma: PrismaService,
    private readonly renewalService: RenewalService,
    private readonly hostheavenService: HostHeavenService,
  ) {}

  // Get logged-in customer's VPS list
  @Get()
  async getMyVps(@Req() req: AuthenticatedRequest) {
    return this.prisma.vPSInstance.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get available provider IP stock
  @Get('ip-stock')
  async getIpStock() {
    return this.vpsService.getIpStock();
  }

  // Get OS templates for an owned VPS
  @Get(':id/templates')
  async getOsTemplates(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const vps = await this.findOwnedVps(id, req.user.sub);
    return this.vpsService.getOsTemplate(vps.ipAddress);
  }

  // Purchase VPS using provider's available IP
  @Post('purchase')
  async purchaseVps(
    @Body() body: { ip: string; ram: number },
    @Req() req: AuthenticatedRequest,
  ) {
    const ip = body.ip?.trim();
    const ram = Number(body.ram);

    if (!ip || !Number.isInteger(ram) || ram <= 0) {
      throw new BadRequestException('Valid IP and RAM are required');
    }

    const existing = await this.prisma.vPSInstance.findUnique({
      where: { ipAddress: ip },
    });

    if (existing) {
      throw new BadRequestException('This IP is already registered');
    }

    // Call actual provider before saving the VPS
    const providerResult = await this.vpsService.buy(ip, ram);

    const vps = await this.prisma.vPSInstance.create({
      data: {
        userId: req.user.sub,
        provider: 'SMARTVPS',
        ipAddress: ip,
        hostname: `vps-${ip.replaceAll('.', '-')}`,
        operatingSystem: 'Ubuntu',
        ram,
        status: 'PENDING',
      },
    });

    return {
      message: 'VPS purchase request submitted',
      providerResult,
      vps,
    };
  }

  // Get VPS status
  @Get(':id/status')
  async getStatus(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const vps = await this.findOwnedVps(id, req.user.sub);
    if (vps.provider === 'HOSTHEAVEN') {
      return this.hostheavenService.getVmDetails(vps.providerVpsId || vps.id);
    }
    return this.vpsService.getStatus(vps.ipAddress);
  }

  // Start VPS
  @Post(':id/start')
  async startVps(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const vps = await this.findOwnedVps(id, req.user.sub);
    let result;
    if (vps.provider === 'HOSTHEAVEN') {
      result = await this.hostheavenService.controlVm(
        req.user.sub,
        vps.providerVpsId || vps.id,
        'start',
      );
    } else {
      result = await this.vpsService.start(vps.ipAddress);
    }

    await this.prisma.vPSInstance.update({
      where: { id: vps.id },
      data: { status: 'RUNNING' },
    });

    return { message: 'VPS start request submitted', result };
  }

  // Stop VPS
  @Post(':id/stop')
  async stopVps(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const vps = await this.findOwnedVps(id, req.user.sub);
    let result;
    if (vps.provider === 'HOSTHEAVEN') {
      result = await this.hostheavenService.controlVm(
        req.user.sub,
        vps.providerVpsId || vps.id,
        'stop',
      );
    } else {
      result = await this.vpsService.stop(vps.ipAddress);
    }

    await this.prisma.vPSInstance.update({
      where: { id: vps.id },
      data: { status: 'STOPPED' },
    });

    return { message: 'VPS stop request submitted', result };
  }

  // Change operating system
  @Post(':id/change-os')
  async changeOs(
    @Param('id') id: string,
    @Body() body: { os: string },
    @Req() req: AuthenticatedRequest,
  ) {
    if (!body.os?.trim()) {
      throw new BadRequestException('Operating system is required');
    }

    const vps = await this.findOwnedVps(id, req.user.sub);
    const result = await this.vpsService.changeOs(
      vps.ipAddress,
      body.os,
    );

    await this.prisma.vPSInstance.update({
      where: { id: vps.id },
      data: { operatingSystem: body.os },
    });

    return { message: 'OS change request submitted', result };
  }

  // Update auto-renewal consent
  @Post(':id/auto-renew')
  async updateAutoRenew(
    @Param('id') id: string,
    @Body() dto: UpdateAutoRenewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.renewalService.updateAutoRenewConsent(
      req.user.sub,
      id,
      dto.enabled,
      dto.consent,
    );
  }

  // Get VPS renewal details
  @Get(':id/renewal-details')
  async getRenewalDetails(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.renewalService.getVpsRenewalDetails(req.user.sub, id);
  }

  // Renew VPS manually via wallet
  @Post(':id/renew')
  async renewVps(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.renewalService.renewVpsManual(req.user.sub, id);
  }

  // Initiate direct VPS renewal via Razorpay
  @Post(':id/renewal/razorpay/create')
  async createRazorpayRenewal(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.renewalService.createRazorpayRenewalOrder(req.user.sub, id);
  }

  // Verify direct VPS renewal via Razorpay
  @Post(':id/renewal/razorpay/verify')
  async verifyRazorpayRenewal(
    @Param('id') id: string,
    @Body() dto: VerifyVpsPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.renewalService.verifyRazorpayRenewal(req.user.sub, id, dto);
  }

  // Verify VPS ownership
  private async findOwnedVps(id: string, userId: string) {
    const vps = await this.prisma.vPSInstance.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!vps) {
      throw new NotFoundException('VPS not found');
    }

    return vps;
  }
}
