import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';
import { RenewalModule } from '../renewal/renewal.module.js';
import { CheckoutModule } from '../checkout/checkout.module.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    forwardRef(() => ProvisioningModule),
    forwardRef(() => RenewalModule),
    forwardRef(() => CheckoutModule),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
