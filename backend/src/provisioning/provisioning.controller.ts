
import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';
import { ProvisioningService } from './provisioning.service.js';

@Controller('admin/provisioning')
@UseGuards(AdminAuthGuard)
export class ProvisioningController {
  constructor(
    private readonly provisioningService: ProvisioningService,
  ) {}

  @Get('jobs')
  findAllJobs() {
    return this.provisioningService.findAllJobs();
  }

  @Get('jobs/:id')
  findJobById(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.provisioningService.findJobById(id);
  }

  @Post('jobs/:id/reconcile')
  reconcileJob(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.provisioningService.reconcileJob(id);
  }
}
