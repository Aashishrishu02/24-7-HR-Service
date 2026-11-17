
import { Module } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AdminProvidersController } from './admin-providers.controller.js';
import { AdminProvidersService } from './admin-providers.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminProvidersController],
  providers: [AdminProvidersService],
})
export class AdminProvidersModule {}
