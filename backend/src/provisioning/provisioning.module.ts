
import { Module } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';

import { InventoryAllocatorService } from './inventory-allocator.service.js';
import { ProvisioningService } from './provisioning.service.js';
import { ProvisioningController } from './provisioning.controller.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [ProvisioningController],
  providers: [
    InventoryAllocatorService,
    ProvisioningService,
  ],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
