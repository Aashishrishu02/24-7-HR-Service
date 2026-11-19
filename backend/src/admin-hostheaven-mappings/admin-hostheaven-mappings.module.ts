import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HostHeavenModule } from '../hostheaven/hostheaven.module.js';
import { RenewalModule } from '../renewal/renewal.module.js';
import { AdminHostHeavenMappingsController } from './admin-hostheaven-mappings.controller.js';
import { AdminHostHeavenMappingsService } from './admin-hostheaven-mappings.service.js';

@Module({
  imports: [AdminAuthModule, PrismaModule, HostHeavenModule, RenewalModule],
  controllers: [AdminHostHeavenMappingsController],
  providers: [AdminHostHeavenMappingsService],
  exports: [AdminHostHeavenMappingsService],
})
export class AdminHostHeavenMappingsModule {}
