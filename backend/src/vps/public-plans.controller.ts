
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('plans')
export class PublicPlansController {
  constructor(private readonly prisma: PrismaService) {}

  // Public customer catalogue: return active VPS plans only
  @Get()
  async findActivePlans() {
    const plans = await this.prisma.vPSPlan.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        name: true,
        productType: true,
        description: true,
        cpuCores: true,
        ramGb: true,
        storageGb: true,
        bandwidthGb: true,
        price: true,
        currency: true,
        durationDays: true,
        supportedOS: true,
        isActive: true,
        sortOrder: true,
      },
    });

    return {
      plans,
      total: plans.length,
    };
  }
}
