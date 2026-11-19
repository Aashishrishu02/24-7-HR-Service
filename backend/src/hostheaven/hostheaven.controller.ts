
import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { HostHeavenService } from './hostheaven.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';

interface AuthenticatedUserRequest extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
  };
}

@Controller()
export class HostHeavenController {
  constructor(
    private readonly hostheavenService: HostHeavenService,
    private readonly prisma: PrismaService,
  ) {}

  // ==========================================
  // ADMIN ENDPOINTS
  // ==========================================

  @Get('admin/hostheaven/connection-test')
  @UseGuards(AdminAuthGuard)
  async adminConnectionTest() {
    return this.hostheavenService.testConnection();
  }

  @Get('admin/hostheaven/catalogue')
  @UseGuards(AdminAuthGuard)
  async adminCatalogue() {
    const [zones, pricing, wallet] = await Promise.all([
      this.hostheavenService.getZones(),
      this.hostheavenService.getCompletePricing(),
      this.hostheavenService.getWalletBalance(),
    ]);

    return {
      zones,
      pricing,
      wallet,
    };
  }

  @Get('admin/hostheaven/orders')
  @UseGuards(AdminAuthGuard)
  async adminOrders() {
    return this.hostheavenService.getOrderOverview();
  }

  @Get('admin/hostheaven/zones/:zoneId/isos')
  @UseGuards(AdminAuthGuard)
  async adminZoneIsos(@Param('zoneId') zoneId: string) {
    return this.hostheavenService.getZoneIsos(zoneId);
  }

  // ==========================================
  // CUSTOMER CATALOGUE ENDPOINTS
  // ==========================================

  @Get('hostheaven/zones')
  @UseGuards(JwtAuthGuard)
  async getZones() {
    return this.hostheavenService.getZones();
  }

  @Get('hostheaven/zones/:zoneId/isos')
  @UseGuards(JwtAuthGuard)
  async getZoneIsos(@Param('zoneId') zoneId: string) {
    return this.hostheavenService.getZoneIsos(zoneId);
  }

  // Raw HostHeaven pricing is intentionally not exposed to customers.
  // Customers will receive only 24/7 selling prices through the plan catalogue.

  // ==========================================
  // CUSTOMER VPS CONTROLS & DIAGNOSTICS
  // ==========================================

  private async findOwnedVps(vpsId: string, userId: string) {
    const vps = await this.prisma.vPSInstance.findFirst({
      where: {
        id: vpsId,
        userId,
      },
    });

    if (!vps) {
      throw new NotFoundException('VPS server not found or not owned by user');
    }

    return vps;
  }

  @Get('hostheaven/vms/:vpsId/details')
  @UseGuards(JwtAuthGuard)
  async getVmDetails(
    @Param('vpsId') vpsId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;
    return this.hostheavenService.getVmDetails(targetId);
  }

  @Get('hostheaven/vms/:vpsId/lock-status')
  @UseGuards(JwtAuthGuard)
  async getVmLockStatus(
    @Param('vpsId') vpsId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;
    return this.hostheavenService.getVmLockStatus(targetId);
  }

  @Get('hostheaven/vms/:vpsId/metrics')
  @UseGuards(JwtAuthGuard)
  async getVmMetrics(
    @Param('vpsId') vpsId: string,
    @Query('timeframe') timeframe: 'hour' | 'day' | 'week',
    @Req() req: AuthenticatedUserRequest,
  ) {
    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;
    return this.hostheavenService.getVmMetrics(targetId, timeframe || 'hour');
  }

  @Get('hostheaven/vms/:vpsId/storage')
  @UseGuards(JwtAuthGuard)
  async getVmStorage(
    @Param('vpsId') vpsId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;
    return this.hostheavenService.getVmStorage(targetId);
  }

  @Post('hostheaven/vms/:vpsId/control')
  @UseGuards(JwtAuthGuard)
  async controlVm(
    @Param('vpsId') vpsId: string,
    @Body() body: { action: string },
    @Req() req: AuthenticatedUserRequest,
  ) {
    if (!body?.action) {
      throw new BadRequestException('Action is required (e.g. start, stop, reboot)');
    }

    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;

    const result = await this.hostheavenService.controlVm(
      req.user.sub,
      targetId,
      body.action,
    );

    const normalized = body.action.toLowerCase();

    if (normalized === 'start') {
      await this.prisma.vPSInstance.update({
        where: { id: vps.id },
        data: { status: 'RUNNING' },
      });
    } else if (normalized === 'stop' || normalized === 'hibernate') {
      await this.prisma.vPSInstance.update({
        where: { id: vps.id },
        data: { status: 'STOPPED' },
      });
    }

    return result;
  }

  @Post('hostheaven/vms/:vpsId/rebuild')
  @UseGuards(JwtAuthGuard)
  async rebuildVm(
    @Param('vpsId') vpsId: string,
    @Body() body: { isoId: string },
    @Req() req: AuthenticatedUserRequest,
  ) {
    if (!body?.isoId) {
      throw new BadRequestException('isoId is required for VM rebuild');
    }

    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;

    return this.hostheavenService.rebuildVm(
      req.user.sub,
      targetId,
      body.isoId,
    );
  }

  @Put('hostheaven/vms/:vpsId/password')
  @UseGuards(JwtAuthGuard)
  async changeVmPassword(
    @Param('vpsId') vpsId: string,
    @Body() body: { password: string },
    @Req() req: AuthenticatedUserRequest,
  ) {
    if (!body?.password || body.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;

    return this.hostheavenService.changeVmPassword(
      req.user.sub,
      targetId,
      body.password,
    );
  }

  @Get('hostheaven/vms/:vpsId/upgrade-pricing')
  @UseGuards(JwtAuthGuard)
  async getUpgradePricing(
    @Param('vpsId') vpsId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;
    return this.hostheavenService.getUpgradePricing(targetId);
  }

  @Post('hostheaven/vms/:vpsId/calculate-renewal')
  @UseGuards(JwtAuthGuard)
  async calculateRenewal(
    @Param('vpsId') vpsId: string,
    @Body()
    body: {
      monthsToAdd?: number;
      cpuPriceId?: string;
      ramPriceId?: string;
      diskPriceId?: string;
      bandwidthPriceId?: string;
      couponCode?: string;
    },
    @Req() req: AuthenticatedUserRequest,
  ) {
    const vps = await this.findOwnedVps(vpsId, req.user.sub);
    const targetId = vps.providerVpsId || vps.id;

    return this.hostheavenService.calculateRenewal({
      vmId: targetId,
      monthsToAdd: body.monthsToAdd || 1,
      cpuPriceId: body.cpuPriceId,
      ramPriceId: body.ramPriceId,
      diskPriceId: body.diskPriceId,
      bandwidthPriceId: body.bandwidthPriceId,
      couponCode: body.couponCode,
    });
  }
}
