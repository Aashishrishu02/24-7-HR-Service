import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      totalCustomers,
      totalVps,
      activeVps,
      pendingVps,
      totalAdmins,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { role: 'CUSTOMER' },
      }),
      this.prisma.vPSInstance.count(),
      this.prisma.vPSInstance.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.vPSInstance.count({
        where: { status: 'PENDING' },
      }),
      this.prisma.admin.count(),
    ]);

    return {
      totalCustomers,
      totalVps,
      activeVps,
      pendingVps,
      totalAdmins,
    };
  }

  async getPayments(page = 1, limit = 20, status?: string, purpose?: string, search?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const where: any = {};
    if (status?.trim()) {
      where.status = status.trim().toUpperCase();
    }
    if (purpose?.trim()) {
      where.purpose = purpose.trim().toUpperCase();
    }
    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { razorpayPaymentId: { contains: term, mode: 'insensitive' } },
        { razorpayOrderId: { contains: term, mode: 'insensitive' } },
        { user: { is: { email: { contains: term, mode: 'insensitive' } } } },
        { user: { is: { name: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const [payments, total, totalRevenue] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          order: {
            select: { id: true, orderNumber: true, planName: true, operatingSystem: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where: { status: 'CAPTURED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      payments,
      totalRevenue: totalRevenue._sum.amount ?? 0,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }
}
