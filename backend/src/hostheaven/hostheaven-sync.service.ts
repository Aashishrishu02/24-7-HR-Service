import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { HostHeavenService } from './hostheaven.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import {
  calculateSellingPrice,
  calculateProviderCost,
  calculatePricingBreakdown,
  calculateDurationMonths,
  HostHeavenPricingBreakdown,
  isSlotIpItem,
  assertNotMixedPricing,
} from './hostheaven-pricing.util.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  HostHeavenZone,
  HostHeavenIso,
  HostHeavenPricingItem,
  HostHeavenCompletePricing,
} from './hostheaven.types.js';

export interface SyncStats {
  totalZones: number;
  activeZones: number;
  inactiveZones: number;
  totalIsos: number;
  configurationsFound: number;
  newConfigsCreated: number;
  existingConfigsUpdated: number;
  verifiedConfigsCount: number;
  unverifiedConfigsCount: number;
  walletBalance?: number;
  walletCurrency?: string;
  lastSyncedAt: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  stats?: SyncStats;
  error?: string;
}

@Injectable()
export class HostHeavenSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HostHeavenSyncService.name);
  private isSyncInProgress = false;
  private syncTimer: NodeJS.Timeout | null = null;
  private readonly defaultIntervalMs = 6 * 60 * 60 * 1000; // 6 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly hostheavenService: HostHeavenService,
    private readonly adminSettingsService: AdminSettingsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      setTimeout(() => {
        this.runScheduledSync().catch((err) =>
          this.logger.error(`Initial catalogue sync failed: ${err.message}`),
        );
      }, 20000);

      this.syncTimer = setInterval(() => {
        this.runScheduledSync().catch((err) =>
          this.logger.error(`Periodic catalogue sync failed: ${err.message}`),
        );
      }, this.defaultIntervalMs);
    }
  }

  onModuleDestroy() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async runScheduledSync() {
    return this.syncCatalogue();
  }

  /**
   * Returns current synchronization status and latest snapshot from SystemSetting
   */
  async getSyncStatus() {
    const keys = [
      'HOSTHEAVEN_SYNC_STATUS',
      'HOSTHEAVEN_LAST_SYNC_AT',
      'HOSTHEAVEN_SYNC_ERROR',
      'HOSTHEAVEN_SYNC_STATS',
      'HOSTHEAVEN_RAW_CATALOGUE',
    ];

    const settings = await this.prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });

    const map = new Map(settings.map((s) => [s.key, s.value]));

    let stats: SyncStats | null = null;
    if (map.has('HOSTHEAVEN_SYNC_STATS')) {
      try {
        stats = JSON.parse(map.get('HOSTHEAVEN_SYNC_STATS')!);
      } catch {
        stats = null;
      }
    }

    let rawCatalogue: any = null;
    if (map.has('HOSTHEAVEN_RAW_CATALOGUE')) {
      try {
        rawCatalogue = JSON.parse(map.get('HOSTHEAVEN_RAW_CATALOGUE')!);
      } catch {
        rawCatalogue = null;
      }
    }

    return {
      status: map.get('HOSTHEAVEN_SYNC_STATUS') || 'NEVER_RUN',
      lastSyncedAt: map.get('HOSTHEAVEN_LAST_SYNC_AT') || null,
      error: map.get('HOSTHEAVEN_SYNC_ERROR') || null,
      isSyncInProgress: this.isSyncInProgress,
      stats,
      rawCatalogue,
    };
  }

  /**
   * Synchronizes HostHeaven zones, OS, and pricing catalogues automatically.
   * Concurrency-safe: duplicate concurrent jobs are rejected.
   */
  async syncCatalogue(): Promise<SyncResult> {
    if (this.isSyncInProgress) {
      this.logger.warn('Catalogue synchronization already in progress. Rejecting concurrent sync.');
      return {
        success: false,
        message: 'A catalogue synchronization job is already running.',
      };
    }

    this.isSyncInProgress = true;
    const nowIso = new Date().toISOString();

    try {
      this.logger.log('Starting HostHeaven catalogue synchronization...');
      await this.saveSetting('HOSTHEAVEN_SYNC_STATUS', 'IN_PROGRESS', 'Sync in progress');
      await this.saveSetting('HOSTHEAVEN_SYNC_ERROR', '', 'Cleared error');

      // 1. Fetch live zones
      let zones: HostHeavenZone[] = [];
      try {
        zones = await this.hostheavenService.getZones();
      } catch (err: any) {
        throw new Error(`Failed to fetch HostHeaven zones: ${err.message || err}`);
      }

      if (!Array.isArray(zones) || zones.length === 0) {
        throw new Error('HostHeaven API returned an empty or invalid zones catalogue');
      }

      const activeZones = zones.filter((z) => {
        if (z.status) {
          const s = z.status.toUpperCase();
          return s === 'ACTIVE' || s === 'AVAILABLE';
        }
        return z.isAvailable !== false;
      });
      const inactiveZones = zones.filter((z) => !activeZones.includes(z));

      this.logger.log(`Zones fetched: ${zones.length} total (${activeZones.length} active, ${inactiveZones.length} inactive)`);

      // 2. Fetch zone-specific ISOs for active zones
      const zoneIsosMap = new Map<string, HostHeavenIso[]>();
      let allIsosCount = 0;

      for (const zone of activeZones) {
        try {
          const isos = await this.hostheavenService.getZoneIsos(zone.id);
          zoneIsosMap.set(zone.id, isos || []);
          allIsosCount += (isos || []).length;
        } catch (isoErr) {
          this.logger.warn(`Could not fetch ISOs for active zone ${zone.id}: ${isoErr}`);
          zoneIsosMap.set(zone.id, []);
        }
      }

      // 3. Fetch resource pricing catalogue (Shared + Dedicated)
      let pricing: HostHeavenCompletePricing;
      try {
        pricing = await this.hostheavenService.getCompletePricing();
      } catch (priceErr: any) {
        throw new Error(`Failed to fetch pricing catalogues: ${priceErr.message || priceErr}`);
      }

      // Fetch live provider wallet balance
      let wallet: any = null;
      try {
        wallet = await this.hostheavenService.getWalletBalance();
      } catch (walletErr: any) {
        this.logger.warn(`Could not fetch HostHeaven wallet balance during sync: ${walletErr.message || walletErr}`);
      }

      // Cache raw snapshot for admin panel instant inspection
      await this.saveSetting(
        'HOSTHEAVEN_RAW_CATALOGUE',
        JSON.stringify({
          syncedAt: nowIso,
          zones,
          zoneIsos: Object.fromEntries(zoneIsosMap.entries()),
          pricing,
          wallet,
        }),
        'Latest raw catalogue snapshot from HostHeaven API',
      );

      // 4. Mark mappings in inactive zones as inactive
      for (const inactZone of inactiveZones) {
        await this.prisma.hostHeavenPlanMapping.updateMany({
          where: { zoneId: String(inactZone.id), isActive: true },
          data: { isActive: false },
        });

        // Also de-activate corresponding VPSPlans
        const inactMappings = await this.prisma.hostHeavenPlanMapping.findMany({
          where: { zoneId: String(inactZone.id) },
          select: { planId: true },
        });

        if (inactMappings.length > 0) {
          const planIds = inactMappings.map((m) => m.planId);
          await this.prisma.vPSPlan.updateMany({
            where: { id: { in: planIds }, isActive: true },
            data: { isActive: false },
          });
        }
      }

      // 5. Generate and synchronize standard configurations for active zones
      const settings = await this.adminSettingsService.getSettings();
      const margin = settings.hostHeavenProfitMarginPercent ?? 20;

      let newConfigsCreated = 0;
      let existingConfigsUpdated = 0;
      let totalConfigsFound = 0;

      for (const zone of activeZones) {
        const zoneIsos = zoneIsosMap.get(zone.id) || [];
        const primaryIso = zoneIsos[0];
        const supportedOSList = zoneIsos.map((i) => i.isoName).filter(Boolean);
        const fallbackOSList = supportedOSList.length > 0 ? supportedOSList : ['Ubuntu 22.04 LTS', 'Debian 12'];

        // 1. Synchronize STANDARD SHARED tier configurations (Strictly Standard items)
        const standardCpu = pricing.shared.cpu.filter((c) => !isSlotIpItem(c));
        const standardRam = pricing.shared.ram.filter((r) => !isSlotIpItem(r));
        const standardDisk = pricing.shared.disk.filter((d) => !isSlotIpItem(d));
        const standardBw = pricing.shared.bandwidth.filter((b) => !isSlotIpItem(b));

        const standardConfigs = this.matchConfigurations(
          'SHARED',
          zone,
          primaryIso,
          fallbackOSList,
          standardCpu,
          standardRam,
          standardDisk,
          standardBw,
          margin,
          false,
        );

        // 2. Synchronize SLOT IP SHARED tier configurations (Strictly Slot IP items)
        const slotIpCpu = pricing.shared.cpu.filter((c) => isSlotIpItem(c));
        const slotIpRam = pricing.shared.ram.filter((r) => isSlotIpItem(r));
        const slotIpDisk = pricing.shared.disk.filter((d) => isSlotIpItem(d));
        const slotIpBw = pricing.shared.bandwidth.filter((b) => isSlotIpItem(b));

        const slotIpConfigs =
          slotIpCpu.length > 0 && slotIpRam.length > 0 && slotIpDisk.length > 0 && slotIpBw.length > 0
            ? this.matchConfigurations(
                'SHARED',
                zone,
                primaryIso,
                fallbackOSList,
                slotIpCpu,
                slotIpRam,
                slotIpDisk,
                slotIpBw,
                margin,
                true,
              )
            : [];

        // 3. Synchronize DEDICATED tier configurations
        const dedicatedConfigs = this.matchConfigurations(
          'DEDICATED',
          zone,
          primaryIso,
          fallbackOSList,
          pricing.dedicated.cpu,
          pricing.dedicated.ram,
          pricing.dedicated.disk,
          pricing.dedicated.bandwidth,
          margin,
          false,
        );

        const allZoneConfigs = [...standardConfigs, ...slotIpConfigs, ...dedicatedConfigs];
        totalConfigsFound += allZoneConfigs.length;

        for (const cfg of allZoneConfigs) {
          const res = await this.upsertSyncedConfiguration(cfg, margin);
          if (res === 'CREATED') newConfigsCreated++;
          if (res === 'UPDATED') existingConfigsUpdated++;
        }
      }

      // 5.5 Deactivate any previously synced mixed configurations in the database
      try {
        const existingMappings = await this.prisma.hostHeavenPlanMapping.findMany({
          where: { isActive: true },
        });
        for (const m of existingMappings) {
          const isMixed =
            isSlotIpItem({ name: m.cpuName ?? undefined, label: m.cpuPricingId }) !==
              isSlotIpItem({ name: m.ramName ?? undefined, label: m.ramPricingId }) ||
            isSlotIpItem({ name: m.ramName ?? undefined, label: m.ramPricingId }) !==
              isSlotIpItem({ name: m.diskName ?? undefined, label: m.diskPricingId }) ||
            isSlotIpItem({ name: m.diskName ?? undefined, label: m.diskPricingId }) !==
              isSlotIpItem({ name: m.bandwidthName ?? undefined, label: m.bandwidthPricingId });

          if (isMixed) {
            await this.prisma.hostHeavenPlanMapping.update({
              where: { id: m.id },
              data: { isActive: false, isCostVerified: false },
            });
            await this.prisma.vPSPlan.update({
              where: { id: m.planId },
              data: { isActive: false },
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Could not run mixed configuration cleanup: ${err}`);
      }

      // 6. Gather counts for summary stats
      const [verifiedCount, unverifiedCount] = await Promise.all([
        this.prisma.hostHeavenPlanMapping.count({ where: { isCostVerified: true } }),
        this.prisma.hostHeavenPlanMapping.count({ where: { isCostVerified: false } }),
      ]);

      const stats: SyncStats = {
        totalZones: zones.length,
        activeZones: activeZones.length,
        inactiveZones: inactiveZones.length,
        totalIsos: allIsosCount,
        configurationsFound: totalConfigsFound,
        newConfigsCreated,
        existingConfigsUpdated,
        verifiedConfigsCount: verifiedCount,
        unverifiedConfigsCount: unverifiedCount,
        walletBalance: wallet?.balance !== undefined ? Number(wallet.balance) : undefined,
        walletCurrency: wallet?.currency || 'INR',
        lastSyncedAt: nowIso,
      };

      await this.saveSetting('HOSTHEAVEN_SYNC_STATUS', 'SUCCESS', 'Sync succeeded');
      await this.saveSetting('HOSTHEAVEN_LAST_SYNC_AT', nowIso, 'Last sync timestamp');
      await this.saveSetting('HOSTHEAVEN_SYNC_STATS', JSON.stringify(stats), 'Sync statistics');

      this.logger.log(`Catalogue sync completed successfully: ${newConfigsCreated} new, ${existingConfigsUpdated} updated.`);

      return {
        success: true,
        message: `Catalogue synchronized successfully (${activeZones.length} active zones, ${totalConfigsFound} configurations).`,
        stats,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      this.logger.error(`HostHeaven catalogue synchronization failed: ${errMsg}`);

      await this.saveSetting('HOSTHEAVEN_SYNC_STATUS', 'FAILED', 'Sync failed');
      await this.saveSetting('HOSTHEAVEN_SYNC_ERROR', errMsg, 'Sync error details');

      return {
        success: false,
        message: `Catalogue synchronization failed: ${errMsg}`,
        error: errMsg,
      };
    } finally {
      this.isSyncInProgress = false;
    }
  }

  /**
   * Helper that identifies balanced VPS combinations from modular pricing catalogues
   */
  private matchConfigurations(
    planType: 'SHARED' | 'DEDICATED',
    zone: HostHeavenZone,
    primaryIso: HostHeavenIso | undefined,
    supportedOS: string[],
    cpuOptions: HostHeavenPricingItem[],
    ramOptions: HostHeavenPricingItem[],
    diskOptions: HostHeavenPricingItem[],
    bwOptions: HostHeavenPricingItem[],
    marginPercent: number = 20,
    isSlotIp: boolean = false,
  ) {
    const configs: Array<{
      externalConfigId: string;
      planType: 'SHARED' | 'DEDICATED';
      planName: string;
      zoneId: string;
      zoneName: string;
      zoneIsoId: string;
      isoName: string;
      supportedOS: string[];
      cpuCores: number;
      ramGb: number;
      storageGb: number;
      bandwidthGb: number;
      cpuItem: HostHeavenPricingItem;
      ramItem: HostHeavenPricingItem;
      diskItem: HostHeavenPricingItem;
      bwItem: HostHeavenPricingItem;
      pricingBreakdown: HostHeavenPricingBreakdown;
      isVerified: boolean;
    }> = [];

    if (!cpuOptions?.length || !ramOptions?.length || !diskOptions?.length || !bwOptions?.length) {
      return configs;
    }

    const defaultBw = bwOptions[0];

    for (const cpu of cpuOptions) {
      const cores = cpu.cores || (cpu as any).cpu || 1;

      // Find suitable RAM options: standard cloud pairing (1x to 4x of cores)
      const matchingRams = ramOptions.filter((r: any) => {
        const ram = r.ram ?? (r.ramMb ? Math.round(r.ramMb / 1000) : 1);
        return ram >= Math.max(1, Math.floor(cores / 2)) && ram <= Math.max(2, cores * 4);
      });

      const selectedRams = matchingRams.length > 0 ? matchingRams : [ramOptions[0]];

      for (const ram of selectedRams) {
        const ramGb = (ram as any).ram ?? ((ram as any).ramMb ? Math.round((ram as any).ramMb / 1000) : 1);

        // Find standard storage matching spec
        const targetDisk = Math.max(20, Math.min(320, cores * 20));
        let selectedDisk =
          diskOptions.find((d: any) => ((d.diskGb ?? d.disk) || 0) >= targetDisk) || diskOptions[0];
        const storageGb = (selectedDisk as any).diskGb ?? selectedDisk.disk ?? 20;
        const bwGb = (defaultBw as any).bandwidthGb ?? defaultBw.bandwidth ?? 1000;

        // Strictly assert standard and slot IP resources are never mixed
        assertNotMixedPricing(cpu, ram, selectedDisk, defaultBw);

        // Strict rate validation: rates must be finite, valid non-negative numbers
        const hasValidCpu = typeof cpu.price === 'number' && Number.isFinite(cpu.price) && cpu.price >= 0;
        const hasValidRam = typeof ram.price === 'number' && Number.isFinite(ram.price) && ram.price >= 0;
        const hasValidDisk = typeof selectedDisk.price === 'number' && Number.isFinite(selectedDisk.price) && selectedDisk.price >= 0;
        const hasValidBw = typeof defaultBw.price === 'number' && Number.isFinite(defaultBw.price) && defaultBw.price >= 0;

        const isRatesValid = hasValidCpu && hasValidRam && hasValidDisk && hasValidBw;

        let pricingBreakdown: HostHeavenPricingBreakdown;
        let isVerified = false;

        if (isRatesValid) {
          pricingBreakdown = calculatePricingBreakdown(
            cpu.price,
            ram.price,
            selectedDisk.price,
            defaultBw.price,
            30,
            marginPercent,
          );
          // Verification condition:
          // Valid rates, non-zero total rate, cores > 0, ramGb > 0, storageGb > 0
          isVerified =
            (pricingBreakdown.totalHourlyRate ?? 0) > 0 &&
            pricingBreakdown.monthlyProviderCost > 0 &&
            cores > 0 &&
            ramGb > 0 &&
            storageGb > 0;
        } else {
          pricingBreakdown = {
            rates: {
              cpu: typeof cpu.price === 'number' ? cpu.price : 0,
              ram: typeof ram.price === 'number' ? ram.price : 0,
              disk: typeof selectedDisk.price === 'number' ? selectedDisk.price : 0,
              bandwidth: typeof defaultBw.price === 'number' ? defaultBw.price : 0,
            },
            billingUnit: 'INR_PER_HOUR',
            pricingSource: 'CALCULATED_HOURLY',
            totalHourlyRate: 0,
            hoursPerMonth: 720,
            durationDays: 30,
            durationMonths: 1,
            monthlyProviderCost: 0,
            totalProviderCost: 0,
            profitMarginPercent: marginPercent,
            customerSellingPrice: 0,
            grossProfit: 0,
            formula: 'Resource rates invalid, missing, or negative',
          };
          isVerified = false;
        }

        const tierName = isSlotIp
          ? 'Slot IP Cloud VPS'
          : planType === 'DEDICATED'
          ? 'Dedicated Cloud VPS'
          : 'Standard Cloud VPS';
        const planName = `${tierName} ${cores} vCPU - ${ramGb} GB RAM (${zone.name || 'India'})`;

        const externalConfigId = isSlotIp
          ? `hh:SLOT_IP:${zone.id}:${cpu.id}:${ram.id}:${selectedDisk.id}:${defaultBw.id}`
          : `hh:${planType}:${zone.id}:${cpu.id}:${ram.id}:${selectedDisk.id}:${defaultBw.id}`;

        configs.push({
          externalConfigId,
          planType,
          planName,
          zoneId: zone.id,
          zoneName: zone.name || 'Cloud Zone',
          zoneIsoId: primaryIso?.id || 'default-iso',
          isoName: primaryIso?.isoName || 'Ubuntu 22.04 LTS',
          supportedOS,
          cpuCores: cores,
          ramGb,
          storageGb,
          bandwidthGb: bwGb,
          cpuItem: cpu,
          ramItem: ram,
          diskItem: selectedDisk,
          bwItem: defaultBw,
          pricingBreakdown,
          isVerified,
        });
      }
    }

    return configs;
  }

  /**
   * Upserts a synchronized configuration into VPSPlan and HostHeavenPlanMapping without duplicating.
   * Verified configurations are automatically published.
   * Unverified configurations (missing or zero pricing) remain ESTIMATED and unpublished.
   */
  private async upsertSyncedConfiguration(
    cfg: {
      externalConfigId: string;
      planType: 'SHARED' | 'DEDICATED';
      planName: string;
      zoneId: string;
      zoneName: string;
      zoneIsoId: string;
      isoName: string;
      supportedOS: string[];
      cpuCores: number;
      ramGb: number;
      storageGb: number;
      bandwidthGb: number;
      cpuItem: HostHeavenPricingItem;
      ramItem: HostHeavenPricingItem;
      diskItem: HostHeavenPricingItem;
      bwItem: HostHeavenPricingItem;
      pricingBreakdown: HostHeavenPricingBreakdown;
      isVerified: boolean;
    },
    marginPercent: number,
  ): Promise<'CREATED' | 'UPDATED'> {
    const existing = await this.prisma.hostHeavenPlanMapping.findUnique({
      where: { externalConfigId: cfg.externalConfigId },
      include: { plan: true },
    });

    const isVerified = cfg.isVerified;
    const providerCost = cfg.pricingBreakdown.monthlyProviderCost;
    const sellingPrice = cfg.pricingBreakdown.customerSellingPrice;

    if (existing) {
      // If existing configuration was verified, but incoming sync is unverified, preserve verified status & existing cost
      const shouldPreserveExistingVerified = existing.isCostVerified && !isVerified;
      const finalVerified = shouldPreserveExistingVerified ? existing.isCostVerified : isVerified;
      const finalProviderCost = shouldPreserveExistingVerified ? Number(existing.providerCost) : providerCost;
      const finalSellingPrice = shouldPreserveExistingVerified ? Number(existing.plan.price) : sellingPrice;
      const finalPricingDetails = shouldPreserveExistingVerified ? (existing.pricingDetails as any) : cfg.pricingBreakdown;

      // Mapping exists: update metadata, verified status, and rates
      await this.prisma.$transaction([
        this.prisma.hostHeavenPlanMapping.update({
          where: { id: existing.id },
          data: {
            zoneName: cfg.zoneName,
            zoneIsoId: cfg.zoneIsoId,
            isoName: cfg.isoName,
            cpuName: cfg.cpuItem.label || `${cfg.cpuCores} vCPU`,
            ramName: cfg.ramItem.label || `${cfg.ramGb} GB RAM`,
            diskName: cfg.diskItem.label || `${cfg.storageGb} GB NVMe`,
            bandwidthName: cfg.bwItem.label || `${cfg.bandwidthGb} GB BW`,
            providerCost: new Prisma.Decimal(finalProviderCost.toFixed(2)),
            pricingDetails: finalPricingDetails as any,
            isCostVerified: finalVerified,
            costStatus: finalVerified ? 'VERIFIED' : 'ESTIMATED',
            isActive: finalVerified,
            lastSyncedAt: new Date(),
          },
        }),
        this.prisma.vPSPlan.update({
          where: { id: existing.planId },
          data: {
            supportedOS: cfg.supportedOS,
            price: new Prisma.Decimal(finalSellingPrice.toFixed(2)),
            isActive: finalVerified,
          },
        }),
      ]);

      return 'UPDATED';
    }

    // New configuration:
    // If verified by valid hourly rates and specs: automatically publish and verify!
    // If unverified (e.g. missing or zero price): keep ESTIMATED and hidden (isActive: false)
    await this.prisma.$transaction(async (tx) => {
      const plan = await tx.vPSPlan.create({
        data: {
          name: cfg.planName,
          productType: 'VPS_HOSTING',
          description: `High performance ${cfg.planType.toLowerCase()} cloud VPS located in ${cfg.zoneName}`,
          cpuCores: cfg.cpuCores,
          ramGb: cfg.ramGb,
          storageGb: cfg.storageGb,
          bandwidthGb: cfg.bandwidthGb,
          price: new Prisma.Decimal(sellingPrice.toFixed(2)),
          currency: 'INR',
          durationDays: 30,
          supportedOS: cfg.supportedOS,
          isActive: isVerified, // Published automatically if verified!
          sortOrder: cfg.cpuCores * 10 + cfg.ramGb,
        },
      });

      await tx.hostHeavenPlanMapping.create({
        data: {
          planId: plan.id,
          externalConfigId: cfg.externalConfigId,
          zoneId: cfg.zoneId,
          zoneName: cfg.zoneName,
          zoneIsoId: cfg.zoneIsoId,
          isoName: cfg.isoName,
          planType: cfg.planType,
          cpuPricingId: cfg.cpuItem.id,
          cpuName: cfg.cpuItem.label || `${cfg.cpuCores} vCPU`,
          ramPricingId: cfg.ramItem.id,
          ramName: cfg.ramItem.label || `${cfg.ramGb} GB RAM`,
          diskPricingId: cfg.diskItem.id,
          diskName: cfg.diskItem.label || `${cfg.storageGb} GB NVMe`,
          bandwidthPricingId: cfg.bwItem.id,
          bandwidthName: cfg.bwItem.label || `${cfg.bandwidthGb} GB BW`,
          providerCost: new Prisma.Decimal(providerCost.toFixed(2)),
          currency: 'INR',
          pricingDetails: cfg.pricingBreakdown as any,
          isCostVerified: isVerified,
          costStatus: isVerified ? 'VERIFIED' : 'ESTIMATED',
          isActive: isVerified, // Visible on customer site if verified!
          lastSyncedAt: new Date(),
        },
      });
    });

    return 'CREATED';
  }

  /**
   * Admin confirms the exact provider cost (in INR) after verifying contract/billing cadence.
   * Flips isCostVerified = true, costStatus = 'VERIFIED', and activates the plan.
   */
  async confirmProviderCost(mappingId: string, confirmedCost: number) {
    if (typeof confirmedCost !== 'number' || isNaN(confirmedCost) || confirmedCost <= 0) {
      throw new BadRequestException('Confirmed provider cost in INR must be greater than zero');
    }

    const mapping = await this.prisma.hostHeavenPlanMapping.findUnique({
      where: { id: mappingId },
      include: { plan: true },
    });

    if (!mapping) {
      throw new NotFoundException('HostHeaven plan mapping not found');
    }

    const settings = await this.adminSettingsService.getSettings();
    const margin = settings.hostHeavenProfitMarginPercent ?? 20;
    const finalSellingPrice = calculateSellingPrice(confirmedCost, margin);

    return this.prisma.$transaction(async (tx) => {
      const updatedMapping = await tx.hostHeavenPlanMapping.update({
        where: { id: mappingId },
        data: {
          providerCost: new Prisma.Decimal(confirmedCost.toFixed(2)),
          isCostVerified: true,
          costStatus: 'VERIFIED',
          isActive: true, // Now verified and published!
          pricingDetails: {
            ...((mapping.pricingDetails as any) || {}),
            manualConfirmedCost: confirmedCost,
            confirmedAt: new Date().toISOString(),
          },
        },
      });

      const updatedPlan = await tx.vPSPlan.update({
        where: { id: mapping.planId },
        data: {
          price: new Prisma.Decimal(finalSellingPrice.toFixed(2)),
          isActive: true, // Visible on customer catalogue
        },
      });

      const grossProfit = Math.round((finalSellingPrice - confirmedCost) * 100) / 100;

      return {
        mapping: updatedMapping,
        plan: updatedPlan,
        providerCost: confirmedCost,
        profitMarginPercent: margin,
        customerSellingPrice: finalSellingPrice,
        grossProfit,
        status: 'VERIFIED',
      };
    });
  }

  /**
   * Toggles activation status for a mapping
   */
  async toggleMappingStatus(mappingId: string, isActive: boolean) {
    const mapping = await this.prisma.hostHeavenPlanMapping.findUnique({
      where: { id: mappingId },
      include: { plan: true },
    });

    if (!mapping) {
      throw new NotFoundException('HostHeaven plan mapping not found');
    }

    // Safety: If activating, ensure provider cost has been verified!
    if (isActive && !mapping.isCostVerified) {
      throw new BadRequestException(
        'Cannot activate an unverified configuration. Please confirm the provider cost first.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedMapping = await tx.hostHeavenPlanMapping.update({
        where: { id: mappingId },
        data: { isActive },
      });

      await tx.vPSPlan.update({
        where: { id: mapping.planId },
        data: { isActive },
      });

      return updatedMapping;
    });
  }

  private async saveSetting(key: string, value: string, description?: string) {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, description },
      update: { value, description },
    });
  }
}
