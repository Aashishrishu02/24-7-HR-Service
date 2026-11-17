
import { Module } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AdminProviderProductsController } from './admin-provider-products.controller.js';
import { AdminProviderProductsService } from './admin-provider-products.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminProviderProductsController],
  providers: [AdminProviderProductsService],
})
export class AdminProviderProductsModule {}
