import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { RenewalService } from './renewal.service.js';
import { LifecycleService } from './lifecycle.service.js';

@Injectable()
export class RenewalSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenewalSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly renewalService: RenewalService,
    private readonly lifecycleService: LifecycleService,
  ) {}

  onModuleInit() {
    this.logger.log('RenewalSchedulerService initialized. Starting background scheduler loop.');

    // Run safe initial check after 10 seconds of startup in non-test mode
    if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_BACKGROUND_JOBS !== 'true') {
      setTimeout(() => {
        this.runScheduledCycle().catch((err) =>
          this.logger.error('Error during initial scheduled renewal cycle:', err),
        );
      }, 10000);

      this.timer = setInterval(() => {
        this.runScheduledCycle().catch((err) =>
          this.logger.error('Error during periodic scheduled renewal cycle:', err),
        );
      }, this.intervalMs);
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('RenewalSchedulerService background loop stopped.');
    }
  }

  async runScheduledCycle() {
    this.logger.log('Starting automated renewal & lifecycle execution cycle...');
    const renewalSummary = await this.renewalService.processAutoRenewals();
    const lifecycleSummary = await this.lifecycleService.processLifecycle();

    this.logger.log(
      `Cycle completed. Renewals: ${JSON.stringify(renewalSummary)}, Lifecycle: ${JSON.stringify(lifecycleSummary)}`,
    );

    return {
      timestamp: new Date(),
      renewalSummary,
      lifecycleSummary,
    };
  }
}
