import { Module } from '@nestjs/common';
import { NexaVpsService } from './nexavps.service.js';
import { DedicatedIpSyncService } from './dedicated-ip-sync.service.js';

@Module({
  providers: [NexaVpsService, DedicatedIpSyncService],
  exports: [NexaVpsService, DedicatedIpSyncService],
})
export class NexaVpsModule {}
