import { Module, forwardRef } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { HostHeavenModule } from '../hostheaven/hostheaven.module.js';

import { InventoryAllocatorService } from './inventory-allocator.service.js';
import { ProvisioningService } from './provisioning.service.js';
import { ProvisioningController } from './provisioning.controller.js';

@Module({
  imports: [
    AdminAuthModule,
    forwardRef(() => HostHeavenModule),
  ],
  controllers: [ProvisioningController],
  providers: [
    InventoryAllocatorService,
    ProvisioningService,
  ],
  exports: [ProvisioningService, InventoryAllocatorService],
})
export class ProvisioningModule {}
