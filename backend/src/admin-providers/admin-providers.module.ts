
import { Module } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { HostHeavenModule } from '../hostheaven/hostheaven.module.js';
import { VpsModule } from '../vps/vps.module.js';
import { NexaVpsModule } from '../nexavps/nexavps.module.js';
import { AdminProvidersController } from './admin-providers.controller.js';
import { AdminProvidersService } from './admin-providers.service.js';

@Module({
  imports: [AdminAuthModule, HostHeavenModule, VpsModule, NexaVpsModule],
  controllers: [AdminProvidersController],
  providers: [AdminProvidersService],
  exports: [AdminProvidersService],
})
export class AdminProvidersModule {}
