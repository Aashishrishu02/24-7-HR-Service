import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HostHeavenService } from './hostheaven.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import {
  calculateSellingPrice,
  calculatePricingBreakdown,
  calculateDurationMonths,
  HOURS_PER_MONTH,
  isSlotIpItem,
  assertNotMixedPricing,
} from './hostheaven-pricing.util.js';
import {
  HostHeavenZone,
  HostHeavenIso,
  HostHeavenPricingItem,
  HostHeavenCompletePricing,
} from './hostheaven.types.js';

export interface DirectBillingOption {
  months: number;
  durationDays: number;
  providerCost: number;
  customerPrice: number;
  grossProfit: number;
  label: string;
}

export interface DirectHostHeavenService {
  id: string;
  name: string;
  productType: 'VPS_HOSTING';
  tier: 'SHARED' | 'DEDICATED';
  category: 'Linux VPS' | 'Windows VPS' | 'Cloud VPS';
  description: string;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  bandwidthGb: number;
  price: number;
  monthlyPrice: number;
  currency: 'INR';
  billingInterval: 'month';
  durationDays: number;
  zone: {
    id: string;
    name: string;
    location?: string;
  };
  location: string;
  operatingSystems: Array<{
    id: string;
    name: string;
    osType: string;
  }>;
  supportedOS: string[];
  billingOptions: DirectBillingOption[];
  providerConfig: {
    zoneId: string;
    zoneIsoId: string;
    planType: 'SHARED' | 'DEDICATED';
    cpuPriceId: string;
    ramPriceId: string;
    diskPriceId: string;
    bandwidthPriceId: string;
  };
  isHostHeaven: true;
  isActive: true;
}

export type PublicDirectBillingOption = Omit<
  DirectBillingOption,
  'providerCost' | 'grossProfit'
>;

export type PublicDirectHostHeavenService = Omit<
  DirectHostHeavenService,
  'billingOptions'
> & {
  billingOptions: PublicDirectBillingOption[];
};

export interface DirectCatalogueResponse {
  services: PublicDirectHostHeavenService[];
  total: number;
  currency: 'INR';
  lastSyncedAt: string;
  isStale: boolean;
  activeZonesCount: number;
}

export interface ValidatedHostHeavenConfig {
  serviceId: string;
  serviceName: string;
  planType: 'SHARED' | 'DEDICATED';
  zoneId: string;
  zoneName: string;
  zoneIsoId: string;
  isoName: string;
  cpuPriceId: string;
  ramPriceId: string;
  diskPriceId: string;
  bandwidthPriceId: string;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  bandwidthGb: number;
  months: number;
  monthlyProviderCost: number;
  totalProviderCost: number;
  marginPercent: number;
  customerSellingPrice: number;
  grossProfit: number;
}

@Injectable()
export class HostHeavenDirectCatalogueService {
  private readonly logger = new Logger(HostHeavenDirectCatalogueService.name);

  // In-memory cache
  private cachedServices: DirectHostHeavenService[] | null = null;
  private cachedZones: HostHeavenZone[] = [];
  private cachedIsosMap = new Map<string, HostHeavenIso[]>();
  private cachedPricing: HostHeavenCompletePricing | null = null;
  private lastCacheTime = 0;
  private isCacheStale = false;
  private isRefreshing = false;
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly hostheavenService: HostHeavenService,
    private readonly adminSettingsService: AdminSettingsService,
  ) {}

  /**
   * Returns live HostHeaven VPS services with the current admin-configured gross margin applied.
   * Uses in-memory cache with automatic TTL refresh and graceful fallback on upstream outage.
   */
  async getLiveServices(forceRefresh = false): Promise<DirectCatalogueResponse> {
    const now = Date.now();
    const isExpired = now - this.lastCacheTime > this.cacheTtlMs;

    if (!this.cachedServices || isExpired || forceRefresh) {
      try {
        await this.refreshLiveCatalogue();
        this.isCacheStale = false;
      } catch (err: any) {
        this.logger.error(`Live catalogue refresh failed: ${err.message || err}`);
        if (this.cachedServices && this.cachedServices.length > 0) {
          this.isCacheStale = true;
          this.logger.warn('Serving last known valid HostHeaven catalogue in stale mode');
        } else {
          throw new ServiceUnavailableException(
            `HostHeaven service catalogue is currently unavailable: ${err.message || 'Upstream provider error'}`,
          );
        }
      }
    }

    const settings = await this.adminSettingsService.getSettings();
    const currentMargin = settings.hostHeavenProfitMarginPercent ?? 20;

    // Recalculate selling price if margin setting changed since cache creation
    const recalculatedServices = (this.cachedServices || []).map((svc) =>
      this.recalculateServiceMargin(svc, currentMargin),
    );

    // Keep provider costs and profit calculations internal; expose only customer prices.
    const services: PublicDirectHostHeavenService[] = recalculatedServices.map(
      ({ billingOptions, ...service }) => ({
        ...service,
        billingOptions: billingOptions.map(
          ({ providerCost, grossProfit, ...option }) => option,
        ),
      }),
    );

    return {
      services,
      total: services.length,
      currency: 'INR',
      lastSyncedAt: new Date(this.lastCacheTime).toISOString(),
      isStale: this.isCacheStale,
      activeZonesCount: this.cachedZones.length,
    };
  }

  /**
   * Refreshes catalogue directly from live HostHeaven API
   */
  async refreshLiveCatalogue(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;

    try {
      this.logger.log('Fetching live zones, ISOs, and modular pricing from HostHeaven...');

      // 1. Fetch live zones
      const zones = await this.hostheavenService.getZones();

      this.logger.log(
        `Direct catalogue received ${Array.isArray(zones) ? zones.length : 'invalid'} zones`,
      );
      if (Array.isArray(zones)) {
        this.logger.log(
          `Direct catalogue zone statuses: ${JSON.stringify(
            zones.map((z) => ({
              id: z.id,
              status: z.status,
              isAvailable: z.isAvailable,
            })),
          )}`,
        );
      }

      if (!Array.isArray(zones) || zones.length === 0) {
        throw new Error('HostHeaven API returned an empty zones list');
      }

      const activeZones = zones.filter((z) => {
        const name = (z.name || (z as any).zoneName || '').toLowerCase();
        if (
          name.includes('coming soon') ||
          name.includes('inactive') ||
          name.includes('disabled') ||
          name.includes('maintenance')
        ) {
          return false;
        }
        if (z.status) {
          const s = z.status.toUpperCase();
          return s === 'ACTIVE' || s === 'AVAILABLE';
        }
        return z.isAvailable !== false;
      });

      if (activeZones.length === 0) {
        throw new Error('No active HostHeaven zones currently available');
      }

      // 2. Fetch ISO templates for active zones in parallel
      const isosMap = new Map<string, HostHeavenIso[]>();
      await Promise.all(
        activeZones.map(async (zone) => {
          try {
            const isos = await this.hostheavenService.getZoneIsos(zone.id);
            isosMap.set(zone.id, Array.isArray(isos) ? isos : []);
          } catch (err) {
            this.logger.warn(`Could not fetch ISOs for zone ${zone.id}: ${err}`);
            isosMap.set(zone.id, []);
          }
        }),
      );

      // 3. Fetch modular resource pricing
      const pricing = await this.hostheavenService.getCompletePricing();

      // 4. Read current profit margin
      const settings = await this.adminSettingsService.getSettings();
      const margin = settings.hostHeavenProfitMarginPercent ?? 20;

      // 5. Generate purchasable configurations directly from upstream options
      const services = this.generateDirectServices(activeZones, isosMap, pricing, margin);

      this.cachedServices = services;
      this.cachedZones = activeZones;
      this.cachedIsosMap = isosMap;
      this.cachedPricing = pricing;
      this.lastCacheTime = Date.now();

      this.logger.log(`Live catalogue refreshed: ${services.length} purchasable services across ${activeZones.length} zones`);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Determines valid, purchasable VPS configurations directly from HostHeaven pricing matrices.
   * Never invents arbitrary combinations: strictly pairs real CPU, RAM, Disk, BW items.
   */
  private generateDirectServices(
    zones: HostHeavenZone[],
    isosMap: Map<string, HostHeavenIso[]>,
    pricing: HostHeavenCompletePricing,
    marginPercent: number,
  ): DirectHostHeavenService[] {
    const services: DirectHostHeavenService[] = [];

    for (const zone of zones) {
      const zoneIsos = isosMap.get(zone.id) || [];
      const primaryIso = zoneIsos[0];
      const operatingSystems = zoneIsos.map((iso) => ({
        id: iso.id,
        name: iso.isoName,
        osType: iso.osType || (/windows|win server/i.test(iso.isoName) ? 'WINDOWS' : 'LINUX'),
      }));
      const supportedOS = operatingSystems.map((o) => o.name);
      if (supportedOS.length === 0) {
        supportedOS.push('Ubuntu 22.04 LTS', 'Debian 12');
      }

      // 1. Standard Shared Cloud VPS tier (Pure Standard resources ONLY - never mixed with Slot IP)
      const standardCpu = pricing.shared.cpu.filter((c) => !isSlotIpItem(c));
      const standardRam = pricing.shared.ram.filter((r) => !isSlotIpItem(r));
      const standardDisk = pricing.shared.disk.filter((d) => !isSlotIpItem(d));
      const standardBw = pricing.shared.bandwidth.filter((b) => !isSlotIpItem(b));

      const standardServices = this.buildTierServices(
        'SHARED',
        zone,
        primaryIso?.id || 'default-iso',
        operatingSystems,
        supportedOS,
        standardCpu,
        standardRam,
        standardDisk,
        standardBw,
        marginPercent,
        false,
      );

      // 2. Slot IP Bundled Cloud VPS tier (Pure Slot IP resources ONLY - never mixed with Standard)
      const slotIpCpu = pricing.shared.cpu.filter((c) => isSlotIpItem(c));
      const slotIpRam = pricing.shared.ram.filter((r) => isSlotIpItem(r));
      const slotIpDisk = pricing.shared.disk.filter((d) => isSlotIpItem(d));
      const slotIpBw = pricing.shared.bandwidth.filter((b) => isSlotIpItem(b));

      const slotIpServices =
        slotIpCpu.length > 0 && slotIpRam.length > 0 && slotIpDisk.length > 0 && slotIpBw.length > 0
          ? this.buildTierServices(
              'SHARED',
              zone,
              primaryIso?.id || 'default-iso',
              operatingSystems,
              supportedOS,
              slotIpCpu,
              slotIpRam,
              slotIpDisk,
              slotIpBw,
              marginPercent,
              true,
            )
          : [];

      // 3. Dedicated Cloud VPS tier
      const dedicatedServices = this.buildTierServices(
        'DEDICATED',
        zone,
        primaryIso?.id || 'default-iso',
        operatingSystems,
        supportedOS,
        pricing.dedicated.cpu,
        pricing.dedicated.ram,
        pricing.dedicated.disk,
        pricing.dedicated.bandwidth,
        marginPercent,
        false,
      );

      services.push(...standardServices, ...slotIpServices, ...dedicatedServices);
    }

    return services;
  }

  /**
   * Builds purchasable services for a specific tier (SHARED or DEDICATED)
   */
  private buildTierServices(
    tier: 'SHARED' | 'DEDICATED',
    zone: HostHeavenZone,
    defaultIsoId: string,
    operatingSystems: Array<{ id: string; name: string; osType: string }>,
    supportedOS: string[],
    cpuOptions: HostHeavenPricingItem[],
    ramOptions: HostHeavenPricingItem[],
    diskOptions: HostHeavenPricingItem[],
    bwOptions: HostHeavenPricingItem[],
    marginPercent: number,
    isSlotIp: boolean = false,
  ): DirectHostHeavenService[] {
    const result: DirectHostHeavenService[] = [];

    if (!cpuOptions?.length || !ramOptions?.length || !diskOptions?.length || !bwOptions?.length) {
      return result;
    }

    const defaultBw = bwOptions[0];
    const bwGb = (defaultBw as any).bandwidthGb ?? defaultBw.bandwidth ?? 1000;

    for (const cpu of cpuOptions) {
      const cores = cpu.cores || (cpu as any).cpu || 1;

      // Realistic cloud pairings: 1x to 4x of cores
      const matchingRams = ramOptions.filter((r: any) => {
        const ram = r.ram ?? (r.ramMb ? Math.round(r.ramMb / 1000) : 1);
        return ram >= Math.max(1, Math.floor(cores / 2)) && ram <= Math.max(2, cores * 4);
      });

      const selectedRams = matchingRams.length > 0 ? matchingRams : [ramOptions[0]];

      for (const ram of selectedRams) {
        const ramGb = (ram as any).ram ?? ((ram as any).ramMb ? Math.round((ram as any).ramMb / 1000) : 1);

        // Standard proportional storage
        const targetDisk = Math.max(20, Math.min(320, cores * 20));
        const selectedDisk =
          diskOptions.find((d: any) => ((d.diskGb ?? d.disk) || 0) >= targetDisk) || diskOptions[0];
        const storageGb = (selectedDisk as any).diskGb ?? selectedDisk.disk ?? 20;

        // Strictly verify that resources are not mixed
        assertNotMixedPricing(cpu, ram, selectedDisk, defaultBw);

        // Validate that rates are valid finite numbers >= 0
        const isRateValid =
          typeof cpu.price === 'number' &&
          Number.isFinite(cpu.price) &&
          cpu.price >= 0 &&
          typeof ram.price === 'number' &&
          Number.isFinite(ram.price) &&
          ram.price >= 0 &&
          typeof selectedDisk.price === 'number' &&
          Number.isFinite(selectedDisk.price) &&
          selectedDisk.price >= 0 &&
          typeof defaultBw.price === 'number' &&
          Number.isFinite(defaultBw.price) &&
          defaultBw.price >= 0;

        if (!isRateValid) {
          continue; // Skip invalid pricing items without crashing
        }

        const breakdown = calculatePricingBreakdown(
          cpu.price,
          ram.price,
          selectedDisk.price,
          defaultBw.price,
          30,
          marginPercent,
        );

        if (breakdown.monthlyProviderCost <= 0) {
          continue; // Must have non-zero provider cost
        }

        const id = isSlotIp
          ? `hh:SLOT_IP:${zone.id}:${cpu.id}:${ram.id}:${selectedDisk.id}:${defaultBw.id}`
          : `hh:${tier}:${zone.id}:${cpu.id}:${ram.id}:${selectedDisk.id}:${defaultBw.id}`;
        const tierLabel = isSlotIp
          ? 'Slot IP Cloud VPS'
          : tier === 'DEDICATED'
          ? 'Dedicated Cloud VPS'
          : 'Standard Cloud VPS';
        const name = `${tierLabel} ${cores} vCPU - ${ramGb} GB RAM`;
        const hasWindows = operatingSystems.some((o) => o.osType === 'WINDOWS');
        const category = hasWindows ? 'Windows VPS' : 'Cloud VPS';
        const description = isSlotIp
          ? `Slot IP high performance cloud VPS located in ${zone.name || 'India'} with dedicated slot IPv4 address.`
          : `High performance ${tier.toLowerCase()} cloud VPS located in ${zone.name || 'India'} with 99.9% uptime SLA.`;

        // Multi-month options: 1, 3, 6, 12 months
        const durations = [
          { months: 1, days: 30, label: '1 Month' },
          { months: 3, days: 90, label: '3 Months' },
          { months: 6, days: 180, label: '6 Months' },
          { months: 12, days: 365, label: '12 Months' },
        ];

        const billingOptions: DirectBillingOption[] = durations.map((d) => {
          const multProviderCost = Math.round(breakdown.monthlyProviderCost * d.months * 100) / 100;
          const multCustomerPrice = calculateSellingPrice(multProviderCost, marginPercent);
          const multGrossProfit = Math.round((multCustomerPrice - multProviderCost) * 100) / 100;
          return {
            months: d.months,
            durationDays: d.days,
            providerCost: multProviderCost,
            customerPrice: multCustomerPrice,
            grossProfit: multGrossProfit,
            label: d.label,
          };
        });

        result.push({
          id,
          name,
          productType: 'VPS_HOSTING',
          tier,
          category,
          description: `High performance ${tier.toLowerCase()} cloud VPS located in ${zone.name || 'India'} with 99.9% uptime SLA.`,
          cpuCores: cores,
          ramGb,
          storageGb,
          bandwidthGb: bwGb,
          price: breakdown.customerSellingPrice,
          monthlyPrice: breakdown.customerSellingPrice,
          currency: 'INR',
          billingInterval: 'month',
          durationDays: 30,
          zone: {
            id: zone.id,
            name: zone.name || 'India Cloud Zone',
            location: zone.location || zone.name || 'India',
          },
          location: zone.name || 'India',
          operatingSystems,
          supportedOS,
          billingOptions,
          providerConfig: {
            zoneId: zone.id,
            zoneIsoId: defaultIsoId,
            planType: tier,
            cpuPriceId: cpu.id,
            ramPriceId: ram.id,
            diskPriceId: selectedDisk.id,
            bandwidthPriceId: defaultBw.id,
          },
          isHostHeaven: true,
          isActive: true,
        });
      }
    }

    return result;
  }

  /**
   * Recalculates selling prices for a service if margin changes
   */
  private recalculateServiceMargin(
    service: DirectHostHeavenService,
    marginPercent: number,
  ): DirectHostHeavenService {
    const updatedBillingOptions = service.billingOptions.map((opt) => {
      const customerPrice = calculateSellingPrice(opt.providerCost, marginPercent);
      const grossProfit = Math.round((customerPrice - opt.providerCost) * 100) / 100;
      return {
        ...opt,
        customerPrice,
        grossProfit,
      };
    });

    const primaryOption = updatedBillingOptions[0];

    return {
      ...service,
      price: primaryOption.customerPrice,
      monthlyPrice: primaryOption.customerPrice,
      billingOptions: updatedBillingOptions,
    };
  }

  /**
   * Validates a selected provider configuration at checkout time.
   * Re-queries or verifies rates upstream, applies current margin, and returns authoritative price.
   * Client-submitted prices are NEVER accepted.
   */
  async validateConfiguration(params: {
    zoneId: string;
    zoneIsoId: string;
    planType: 'SHARED' | 'DEDICATED';
    cpuPriceId: string;
    ramPriceId: string;
    diskPriceId: string;
    bandwidthPriceId: string;
    months?: number;
  }): Promise<ValidatedHostHeavenConfig> {
    const { zoneId, zoneIsoId, planType, cpuPriceId, ramPriceId, diskPriceId, bandwidthPriceId } = params;
    const months = params.months && [1, 3, 6, 12].includes(params.months) ? params.months : 1;

    // Ensure cache has fresh or available data
    if (!this.cachedPricing || !this.cachedZones.length) {
      await this.getLiveServices();
    }

    // 1. Validate Zone
    const zone = this.cachedZones.find((z) => z.id === zoneId);
    if (!zone) {
      throw new BadRequestException(`HostHeaven zone '${zoneId}' is not currently available or active`);
    }
    const zoneName = (zone.name || (zone as any).zoneName || '').toLowerCase();
    if (zoneName.includes('coming soon')) {
      throw new BadRequestException(`Datacenter zone '${zone.name}' is currently marked Coming Soon and is not ready for deployment.`);
    }

    // 2. Validate ISO for that zone
    const zoneIsos = this.cachedIsosMap.get(zoneId) || [];
    const iso = zoneIsos.find((i) => i.id === zoneIsoId);
    const isoName = iso?.isoName || 'Ubuntu 22.04 LTS';

    // 3. Validate resource items from tier catalogue
    const tierPricing = planType === 'DEDICATED' ? this.cachedPricing?.dedicated : this.cachedPricing?.shared;
    if (!tierPricing) {
      throw new BadRequestException(`Invalid HostHeaven tier '${planType}'`);
    }

    const cpuItem = tierPricing.cpu.find((c) => String(c.id) === String(cpuPriceId));
    const ramItem = tierPricing.ram.find((r) => String(r.id) === String(ramPriceId));
    const diskItem = tierPricing.disk.find((d) => String(d.id) === String(diskPriceId));
    const bwItem = tierPricing.bandwidth.find((b) => String(b.id) === String(bandwidthPriceId));

    if (!cpuItem || !ramItem || !diskItem || !bwItem) {
      throw new BadRequestException(
        'Selected resource configuration is not currently available in the HostHeaven pricing catalogue',
      );
    }

    // STRICT ISOLATION GUARD: Standard and Slot IP resources must NEVER be mixed!
    assertNotMixedPricing(cpuItem, ramItem, diskItem, bwItem);

    // 4. Calculate Authoritative Monthly Provider Cost
    const breakdown = calculatePricingBreakdown(
      cpuItem.price,
      ramItem.price,
      diskItem.price,
      bwItem.price,
      30,
      20, // baseline
    );

    const monthlyProviderCost = breakdown.monthlyProviderCost;
    const totalProviderCost = Math.round(monthlyProviderCost * months * 100) / 100;

    // 5. Get current margin setting
    const settings = await this.adminSettingsService.getSettings();
    const marginPercent = settings.hostHeavenProfitMarginPercent ?? 20;

    // 6. Calculate selling price server-side
    const customerSellingPrice = calculateSellingPrice(totalProviderCost, marginPercent);
    const grossProfit = Math.round((customerSellingPrice - totalProviderCost) * 100) / 100;

    const cores = cpuItem.cores || (cpuItem as any).cpu || 1;
    const ramGb = (ramItem as any).ram ?? ((ramItem as any).ramMb ? Math.round((ramItem as any).ramMb / 1000) : 1);
    const storageGb = (diskItem as any).diskGb ?? diskItem.disk ?? 20;
    const bandwidthGb = (bwItem as any).bandwidthGb ?? bwItem.bandwidth ?? 1000;

    const isSlotIp = isSlotIpItem(cpuItem);
    const serviceId = `hh:${isSlotIp ? 'SLOT_IP' : planType}:${zoneId}:${cpuPriceId}:${ramPriceId}:${diskPriceId}:${bandwidthPriceId}`;
    const serviceName = `${isSlotIp ? 'Slot IP Cloud VPS' : planType === 'DEDICATED' ? 'Dedicated Cloud VPS' : 'Standard Cloud VPS'} ${cores} vCPU - ${ramGb} GB RAM`;

    return {
      serviceId,
      serviceName,
      planType,
      zoneId,
      zoneName: zone.name || 'India Cloud Zone',
      zoneIsoId,
      isoName,
      cpuPriceId,
      ramPriceId,
      diskPriceId,
      bandwidthPriceId,
      cpuCores: cores,
      ramGb,
      storageGb,
      bandwidthGb,
      months,
      monthlyProviderCost,
      totalProviderCost,
      marginPercent,
      customerSellingPrice,
      grossProfit,
    };
  }
}
