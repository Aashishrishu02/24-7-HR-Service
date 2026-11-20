import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EmailModule } from '../email/email.module.js';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { VpsModule } from '../vps/vps.module.js';
import { HostHeavenModule } from '../hostheaven/hostheaven.module.js';
import { AdminSettingsService } from './admin-settings.service.js';
import { NotificationService } from './notification.service.js';
import { RenewalService } from './renewal.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { RenewalSchedulerService } from './renewal-scheduler.service.js';
import { RenewalAdminController } from './renewal-admin.controller.js';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    AdminAuthModule,
    forwardRef(() => VpsModule),
    forwardRef(() => HostHeavenModule),
  ],
  controllers: [RenewalAdminController],
  providers: [
    AdminSettingsService,
    NotificationService,
    RenewalService,
    LifecycleService,
    RenewalSchedulerService,
  ],
  exports: [
    RenewalService,
    LifecycleService,
    AdminSettingsService,
    NotificationService,
  ],
})
export class RenewalModule {}
