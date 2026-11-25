import { Controller, Get, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import { calculateSellingPrice, isSlotIpItem } from '../hostheaven/hostheaven-pricing.util.js';
import { HostHeavenDirectCatalogueService } from '../hostheaven/hostheaven-direct-catalogue.service.js';
import { NexaVpsService } from '../nexavps/nexavps.service.js';

@Controller('plans')
export class PublicPlansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminSettingsService: AdminSettingsService,
    @Inject(forwardRef(() => HostHeavenDirectCatalogueService))
    private readonly directCatalogueService: HostHeavenDirectCatalogueService,
    private readonly nexaVpsService: NexaVpsService,
  ) { }

  /**
   * Public, read-only customer support contact details.
   * Returns only configured contact fields.
   */
  @Get('contact-settings')
  async getPublicSupportContactSettings() {
    try {
      const settings = await this.adminSettingsService.getSupportContactSettings();

      return Object.fromEntries(
        Object.entries(settings).filter(
          ([, value]) => typeof value === 'string' && value.trim() !== '',
        ),
      );
    } catch {
      return {};
    }
  }

  /**
   * Public, read-only Nexa Dedicated IP catalogue.
   * Reads only successfully synced, active and in-stock database plans.
   * Only customer-facing prices and safe plan details are returned.
   */
  @Get('dedicated-ip-status')
  async getDedicatedIpStatus() {
    try {
      const settings = await this.adminSettingsService.getSettings();
      return { enabled: settings.dedicatedIpEnabled === true };
    } catch {
      return { enabled: false };
    }
  }

  @Get('nexa-dedicated-ips')
  async findNexaDedicatedIpPlans() {
    try {
      const settings = await this.adminSettingsService.getSettings();

      // Availability is a global customer-facing kill switch.
      if (settings.dedicatedIpEnabled !== true) {
        return { plans: [], total: 0 };
      }

      const configuredMargin = Number(settings.nexaVpsProfitMarginPercent ?? 20);
      const margin =
        Number.isFinite(configuredMargin) &&
        configuredMargin >= 0 &&
        configuredMargin <= 80
          ? configuredMargin
          : 20;

      const toCustomerPlan = (plan: {
        id: unknown;
        name: unknown;
        category?: unknown;
        tier?: unknown;
        controlMode?: unknown;
        country?: unknown;
        location?: unknown;
        duration?: unknown;
        speed?: unknown;
        supportedProtocols?: unknown;
        currency?: unknown;
        apiPrice?: unknown;
        inStock?: unknown;
      }) => {
        const planId = String(plan.id ?? '').trim();
        const providerCost = Number(plan.apiPrice);

        if (
          !planId ||
          plan.inStock !== true ||
          !Number.isFinite(providerCost) ||
          providerCost <= 0
        ) {
          return null;
        }

        const sellingPrice =
          Math.round(
            (providerCost / (1 - margin / 100) + Number.EPSILON) * 100,
          ) / 100;

        return {
          id: planId,
          name: String(plan.name || 'Dedicated IP'),
          category: typeof plan.category === 'string' ? plan.category : 'Dedicated IP',
          tier: typeof plan.tier === 'string' ? plan.tier : null,
          controlMode: typeof plan.controlMode === 'string' ? plan.controlMode : null,
          country: typeof plan.country === 'string' ? plan.country : null,
          location: typeof plan.location === 'string' ? plan.location : null,
          duration: typeof plan.duration === 'string' ? plan.duration : null,
          speed: typeof plan.speed === 'string' ? plan.speed : null,
          supportedProtocols: Array.isArray(plan.supportedProtocols)
            ? plan.supportedProtocols.filter((item): item is string => typeof item === 'string')
            : [],
          currency: typeof plan.currency === 'string' ? plan.currency : 'INR',
          price: sellingPrice,
          inStock: true,
        };
      };

      // Prefer the verified database catalogue whenever it is available.
      try {
        const provider = await this.prisma.provider.findUnique({
          where: { code: 'NEXAVPS' },
          select: { id: true },
        });

        if (provider) {
          const storedPlans = await this.prisma.dedicatedIpPlan.findMany({
            where: {
              providerId: provider.id,
              isActive: true,
              inStock: true,
            },
            orderBy: { planName: 'asc' },
            select: {
              externalPlanId: true,
              planName: true,
              categoryName: true,
              tier: true,
              tierLabel: true,
              controlMode: true,
              countryName: true,
              location: true,
              duration: true,
              speed: true,
              supportedProtocols: true,
              currency: true,
              apiPrice: true,
              inStock: true,
            },
          });

          const databasePlans = storedPlans
            .map((plan) => toCustomerPlan({
              id: plan.externalPlanId,
              name: plan.planName,
              category: plan.categoryName,
              tier: plan.tierLabel ?? plan.tier,
              controlMode: plan.controlMode,
              country: plan.countryName,
              location: plan.location,
              duration: plan.duration,
              speed: plan.speed,
              supportedProtocols: plan.supportedProtocols,
              currency: plan.currency,
              apiPrice: plan.apiPrice,
              inStock: plan.inStock,
            }))
            .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

          if (databasePlans.length > 0) {
            return { plans: databasePlans, total: databasePlans.length };
          }
        }
      } catch {
        // A pending Dedicated IP migration must not prevent the read-only live fallback.
      }

      // Temporary read-only fallback until the Dedicated IP database migration is safely applied.
      const liveResponse = await this.nexaVpsService.getPlans();

      if (!liveResponse.success || !Array.isArray(liveResponse.plans)) {
        return { plans: [], total: 0 };
      }

      const livePlans = liveResponse.plans
        .map((plan) => toCustomerPlan({
          id: plan.planId,
          name: plan.planName,
          category: plan.categoryName,
          tier: plan.tierLabel ?? plan.tier,
          controlMode: plan.controlMode,
          country: plan.countryName,
          location: plan.location,
          duration: plan.duration,
          speed: plan.speed,
          supportedProtocols: plan.supportedProtocols,
          currency: plan.currency,
          apiPrice: plan.apiPrice,
          inStock: plan.inStock,
        }))
        .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

      return { plans: livePlans, total: livePlans.length };
    } catch {
      // Do not expose provider errors, API credentials, or internal configuration publicly.
      return { plans: [], total: 0 };
    }
  }

  /**
   * Public customer catalogue: returns active VPS plans only with server-calculated monthly selling prices in INR.
   * - Dynamically incorporates live HostHeaven catalogue services with enforced 20% gross margin.
   * - Applies 20% gross profit margin exactly once to provider monthly cost.
   * - Never returns raw hourly rates (0.1, 0.1954, 0.2, 0.4) or internal provider costs.
   * - Provides consistent monthly pricing (monthlyPrice and price in INR) for all customer displays.
   */
  @Get()
  async findActivePlans() {
    const [plans, settings, directResponse] = await Promise.all([
      this.prisma.vPSPlan.findMany({
        where: {
          isActive: true,
        },
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'desc' },
        ],
        include: {
          hostHeavenMapping: {
            select: {
              id: true,
              zoneId: true,
              zoneName: true,
              zoneIsoId: true,
              isoName: true,
              planType: true,
              providerCost: true,
              isCostVerified: true,
              costStatus: true,
              isActive: true,
              cpuPricingId: true,
              cpuName: true,
              ramPricingId: true,
              ramName: true,
              diskPricingId: true,
              diskName: true,
              bandwidthPricingId: true,
              bandwidthName: true,
            },
          },
        },
      }),
      this.adminSettingsService.getSettings(),
      this.directCatalogueService.getLiveServices(),
    ]);

    const margin = settings.hostHeavenProfitMarginPercent ?? 20;

    // Filter out plans whose HostHeaven mapping is inactive, unverified, or mixes standard and Slot IP resources
    const visiblePlans = plans.filter((plan) => {
      if (!plan.hostHeavenMapping) return true;
      if (!plan.hostHeavenMapping.isActive || !plan.hostHeavenMapping.isCostVerified) return false;

      const m = plan.hostHeavenMapping;
      const isMixed =
        isSlotIpItem({ name: m.cpuName ?? undefined, label: m.cpuPricingId }) !==
          isSlotIpItem({ name: m.ramName ?? undefined, label: m.ramPricingId }) ||
        isSlotIpItem({ name: m.ramName ?? undefined, label: m.ramPricingId }) !==
          isSlotIpItem({ name: m.diskName ?? undefined, label: m.diskPricingId }) ||
        isSlotIpItem({ name: m.diskName ?? undefined, label: m.diskPricingId }) !==
          isSlotIpItem({ name: m.bandwidthName ?? undefined, label: m.bandwidthPricingId });

      return !isMixed;
    });

    const sanitizedPlans = visiblePlans.map((plan) => {
      let finalPrice = Number(plan.price);
      let location = 'India';
      let tier = plan.productType === 'LINUX_IP_VPS' ? 'Linux IP VPS' : 'Cloud VPS';
      let supportedOS = plan.supportedOS;

      if (plan.hostHeavenMapping && plan.hostHeavenMapping.isActive && plan.hostHeavenMapping.isCostVerified) {
        // Calculate customer price server-side using the 20% gross profit margin rule
        const providerCost = Number(plan.hostHeavenMapping.providerCost);
        finalPrice = calculateSellingPrice(providerCost, margin);

        if (plan.hostHeavenMapping.zoneName) {
          location = plan.hostHeavenMapping.zoneName;
        }

        if (plan.hostHeavenMapping.planType) {
          tier =
            plan.hostHeavenMapping.planType === 'DEDICATED'
              ? 'Dedicated Cloud VPS'
              : 'Standard Cloud VPS';
        }

        // If specific ISO is attached to the HostHeaven mapping, ensure it is surfaced in supportedOS
        if (
          plan.hostHeavenMapping.isoName &&
          !supportedOS.includes(plan.hostHeavenMapping.isoName)
        ) {
          supportedOS = [plan.hostHeavenMapping.isoName, ...supportedOS];
        }
      }

      return {
        id: plan.id,
        name: plan.name,
        productType: plan.productType,
        description: plan.description,
        cpuCores: plan.cpuCores,
        ramGb: plan.ramGb,
        storageGb: plan.storageGb,
        bandwidthGb: plan.bandwidthGb,
        price: finalPrice,
        monthlyPrice: finalPrice,
        currency: plan.currency || 'INR',
        durationDays: plan.durationDays || 30,
        billingInterval: 'month',
        supportedOS,
        location,
        tier,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
        isHostHeaven: Boolean(plan.hostHeavenMapping),
        providerConfig: plan.hostHeavenMapping
          ? {
              zoneId: plan.hostHeavenMapping.zoneId,
              zoneIsoId: plan.hostHeavenMapping.zoneIsoId,
              planType:
                plan.hostHeavenMapping.planType === 'DEDICATED'
                  ? 'DEDICATED'
                  : 'SHARED',
              cpuPriceId: plan.hostHeavenMapping.cpuPricingId,
              ramPriceId: plan.hostHeavenMapping.ramPricingId,
              diskPriceId: plan.hostHeavenMapping.diskPricingId,
              bandwidthPriceId: plan.hostHeavenMapping.bandwidthPricingId,
            }
          : undefined,
      };
    });

    // If live HostHeaven services are available, merge them seamlessly
    let allPlans = [...sanitizedPlans];
    if (directResponse?.services && directResponse.services.length > 0) {
      const directPlans = directResponse.services.map((svc, idx) => ({
        id: svc.id,
        name: svc.name,
        productType: svc.productType,
        description: svc.description,
        cpuCores: svc.cpuCores,
        ramGb: svc.ramGb,
        storageGb: svc.storageGb,
        bandwidthGb: svc.bandwidthGb,
        price: svc.price,
        monthlyPrice: svc.monthlyPrice,
        currency: svc.currency,
        durationDays: svc.durationDays,
        billingInterval: svc.billingInterval,
        supportedOS: svc.supportedOS,
        location: svc.location,
        tier: svc.id.includes('SLOT_IP')
          ? 'Slot IP Cloud VPS'
          : svc.tier === 'DEDICATED'
          ? 'Dedicated Cloud VPS'
          : 'Standard Cloud VPS',
        isActive: true,
        sortOrder: 10 + idx,
        isHostHeaven: true,
        providerConfig: svc.providerConfig,
        billingOptions: svc.billingOptions,
        operatingSystems: svc.operatingSystems,
      }));

      // Avoid duplicates if a plan with same ID already exists
      const existingIds = new Set(allPlans.map((p) => p.id));
      for (const dp of directPlans) {
        if (!existingIds.has(dp.id)) {
          allPlans.push(dp);
        }
      }
    }

    return {
      plans: allPlans,
      total: allPlans.length,
    };
  }
}
