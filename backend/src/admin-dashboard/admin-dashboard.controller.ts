import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard)
export class AdminDashboardController {
  constructor(
    private readonly adminDashboardService: AdminDashboardService,
  ) {}

  @Get('stats')
  async getStats() {
    return this.adminDashboardService.getStats();
  }

  @Get('payments')
  async getPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('purpose') purpose?: string,
    @Query('search') search?: string,
  ) {
    return this.adminDashboardService.getPayments(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      status,
      purpose,
      search,
    );
  }
}
