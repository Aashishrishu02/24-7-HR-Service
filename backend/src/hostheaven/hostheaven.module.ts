import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { RenewalModule } from '../renewal/renewal.module.js';
import { CheckoutModule } from '../checkout/checkout.module.js';
import { HostHeavenService } from './hostheaven.service.js';
import { HostHeavenSyncService } from './hostheaven-sync.service.js';
import { HostHeavenDirectCatalogueService } from './hostheaven-direct-catalogue.service.js';
import { HostHeavenController } from './hostheaven.controller.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    AdminAuthModule,
    forwardRef(() => RenewalModule),
    forwardRef(() => CheckoutModule),
  ],
  controllers: [HostHeavenController],
  providers: [
    HostHeavenService,
    HostHeavenSyncService,
    HostHeavenDirectCatalogueService,
  ],
  exports: [
    HostHeavenService,
    HostHeavenSyncService,
    HostHeavenDirectCatalogueService,
  ],
})
export class HostHeavenModule {}
