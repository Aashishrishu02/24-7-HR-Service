
import { Module } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';

import { AdminPlanProviderMappingsController } from './admin-plan-provider-mappings.controller.js';
import { AdminPlanProviderMappingsService } from './admin-plan-provider-mappings.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminPlanProviderMappingsController],
  providers: [AdminPlanProviderMappingsService],
})
export class AdminPlanProviderMappingsModule {}
