import { Module, forwardRef } from '@nestjs/common';
import { VpsService } from './vps.service.js';
import { VpsController } from './vps.controller.js';
import { PublicPlansController } from './public-plans.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RenewalModule } from '../renewal/renewal.module.js';
import { HostHeavenModule } from '../hostheaven/hostheaven.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => RenewalModule),
    HostHeavenModule,
  ],
  controllers: [
    VpsController,
    PublicPlansController,
  ],
  providers: [VpsService],
  exports: [VpsService],
})
export class VpsModule {}
