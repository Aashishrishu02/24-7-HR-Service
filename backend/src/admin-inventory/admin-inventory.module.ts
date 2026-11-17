
import { Module } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AdminInventoryController } from './admin-inventory.controller.js';
import { AdminInventoryService } from './admin-inventory.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminInventoryController],
  providers: [AdminInventoryService],
})
export class AdminInventoryModule {}
