import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';
import { calculateSellingPrice } from '../hostheaven/hostheaven-pricing.util.js';

@Controller('plans')
export class PublicPlansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminSettingsService: AdminSettingsService,
  ) {}

  /**
   * Public customer catalogue: returns active VPS plans only with server-calculated monthly selling prices in INR.
   * - Applies 20% gross profit margin exactly once to provider monthly cost.
   * - Never returns raw hourly rates (0.1, 0.1954, 0.2, 0.4) or internal provider costs.
   * - Provides consistent monthly pricing (monthlyPrice and price in INR) for all customer displays.
   */
  @Get()
  async findActivePlans() {
    const [plans, settings] = await Promise.all([
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

    return {
      plans: sanitizedPlans,
      total: sanitizedPlans.length,
    };
  }
}
