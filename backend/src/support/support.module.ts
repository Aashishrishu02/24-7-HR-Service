import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { SupportService } from './support.service.js';
import { SupportController } from './support.controller.js';
import { AdminSupportController } from './admin-support.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, AdminAuthModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
