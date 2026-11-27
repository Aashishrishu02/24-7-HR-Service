import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';
import { RenewalModule } from '../renewal/renewal.module.js';
import { HostHeavenModule } from '../hostheaven/hostheaven.module.js';
import { NexaVpsModule } from '../nexavps/nexavps.module.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';

@Module({
  imports: [
    AuthModule,
    ProvisioningModule,
    forwardRef(() => RenewalModule),
    forwardRef(() => HostHeavenModule),
    NexaVpsModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
