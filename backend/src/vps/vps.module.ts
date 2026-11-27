import { Module, forwardRef } from '@nestjs/common';
import { VpsService } from './vps.service.js';
import { VpsController } from './vps.controller.js';
import { PublicPlansController } from './public-plans.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RenewalModule } from '../renewal/renewal.module.js';
import { HostHeavenModule } from '../hostheaven/hostheaven.module.js';
import { NexaVpsModule } from '../nexavps/nexavps.module.js';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { SmartVpsAdminController } from './smartvps-admin.controller.js';
import { SmartVpsOrderController } from './smartvps-order.controller.js';
import { SmartVpsOrderService } from './smartvps-order.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AdminAuthModule,
    forwardRef(() => RenewalModule),
    forwardRef(() => HostHeavenModule),
    NexaVpsModule,
  ],
  controllers: [
    VpsController,
    PublicPlansController,
    SmartVpsAdminController,
    SmartVpsOrderController,
  ],
  providers: [VpsService, SmartVpsOrderService],
  exports: [VpsService, SmartVpsOrderService],
})
export class VpsModule {}
