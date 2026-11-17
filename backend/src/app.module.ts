
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EmailModule } from './email/email.module.js';
import { VpsModule } from './vps/vps.module.js';
import { AdminAuthModule } from './admin-auth/admin-auth.module.js';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module.js';
import { AdminCustomersModule } from './admin-customers/admin-customers.module.js';
import { AdminVpsModule } from './admin-vps/admin-vps.module.js';
import { AdminPlansModule } from './admin-plans/admin-plans.module.js';
import { AdminProvidersModule } from './admin-providers/admin-providers.module.js';
import { AdminInventoryModule } from './admin-inventory/admin-inventory.module.js';
import { AdminProviderProductsModule } from './admin-provider-products/admin-provider-products.module.js';
import { AdminPlanProviderMappingsModule } from './admin-plan-provider-mappings/admin-plan-provider-mappings.module.js';
import { ProvisioningModule } from './provisioning/provisioning.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    EmailModule,
    VpsModule,
    AdminAuthModule,
    AdminDashboardModule,
    AdminCustomersModule,
    AdminProviderProductsModule,
    AdminVpsModule,
    AdminPlansModule,
    AdminProvidersModule,
    AdminInventoryModule,
    AdminPlanProviderMappingsModule,
    ProvisioningModule,
  ],
  
})
export class AppModule {}
