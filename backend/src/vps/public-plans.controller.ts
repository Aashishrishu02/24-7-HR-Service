import { Controller, Get, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import { calculateSellingPrice } from '../hostheaven/hostheaven-pricing.util.js';
import { HostHeavenDirectCatalogueService } from '../hostheaven/hostheaven-direct-catalogue.service.js';

@Controller('plans')
export class PublicPlansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminSettingsService: AdminSettingsService,
    @Optional()
    private readonly directCatalogueService?: HostHeavenDirectCatalogueService,
  ) { }

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
            },
          },
        },
      }),
      this.adminSettingsService.getSettings(),
      this.directCatalogueService
        ? this.directCatalogueService.getLiveServices().catch((err) => {
            return null;
          })
        : Promise.resolve(null),
    ]);

    const margin = settings.hostHeavenProfitMarginPercent ?? 20;

    // Filter out plans whose HostHeaven mapping is inactive or not yet verified by admin
    const visiblePlans = plans.filter(
      (plan) =>
        !plan.hostHeavenMapping ||
        (plan.hostHeavenMapping.isActive && plan.hostHeavenMapping.isCostVerified),
    );

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
        tier: svc.tier === 'DEDICATED' ? 'Dedicated Cloud VPS' : 'Cloud VPS',
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
