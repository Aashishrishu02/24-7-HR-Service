import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';
import { AdminSettingsService } from './admin-settings.service.js';
import { RenewalService } from './renewal.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { RenewalSchedulerService } from './renewal-scheduler.service.js';
import { UpdateRenewalSettingsDto } from './dto/update-settings.dto.js';

@Controller('admin/vps')
@UseGuards(AdminAuthGuard)
export class RenewalAdminController {
  constructor(
    private readonly adminSettings: AdminSettingsService,
    private readonly renewalService: RenewalService,
    private readonly lifecycleService: LifecycleService,
    private readonly schedulerService: RenewalSchedulerService,
  ) {}

  // ==========================================
  // SETTINGS
  // ==========================================

  @Get('renewal/settings')
  getSettings() {
    return this.adminSettings.getSettings();
  }

  @Put('renewal/settings')
  updateSettings(@Body() dto: UpdateRenewalSettingsDto) {
    return this.adminSettings.updateSettings(dto);
  }

  // ==========================================
  // RENEWALS
  // ==========================================

  @Get('renewal/upcoming')
  getUpcomingRenewals() {
    return this.renewalService.getUpcomingRenewals();
  }

  @Get('renewal/history')
  getRenewalHistory(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.renewalService.getRenewalHistory(
      status,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Get('renewal/insufficient-balance')
  getInsufficientBalanceCases() {
    return this.renewalService.getInsufficientBalanceCases();
  }

  @Post('renewal/trigger')
  triggerRenewalCycle() {
    return this.renewalService.processAutoRenewals();
  }

  @Post('renewal/:id/retry')
  retryRenewal(@Param('id', ParseUUIDPipe) id: string) {
    return this.renewalService.retryRenewal(id);
  }

  // ==========================================
  // LIFECYCLE
  // ==========================================

  @Get('lifecycle/suspended')
  getSuspendedInstances() {
    return this.lifecycleService.getSuspendedInstances();
  }

  @Get('lifecycle/termination-pending')
  getTerminationPendingInstances() {
    return this.lifecycleService.getTerminationPendingInstances();
  }

  @Post('lifecycle/trigger')
  triggerLifecycleCycle() {
    return this.lifecycleService.processLifecycle();
  }

  @Post('lifecycle/scheduler/trigger')
  triggerFullScheduler() {
    return this.schedulerService.runScheduledCycle();
  }

  @Post('lifecycle/:id/retry-suspend')
  retrySuspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycleService.retryLifecycleAction(id, 'SUSPEND');
  }

  @Post('lifecycle/:id/retry-terminate')
  retryTerminate(@Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycleService.retryLifecycleAction(id, 'TERMINATE');
  }
}
