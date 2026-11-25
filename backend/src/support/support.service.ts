import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { TicketStatus, UserRole } from '../generated/prisma/client.js';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check eligibility & get user's active VPS servers for ticket selection
   */
  async getUserEligibleServers(userId: string) {
    const servers = await this.prisma.vPSInstance.findMany({
      where: { userId },
      select: {
        id: true,
        hostname: true,
        ipAddress: true,
        status: true,
        operatingSystem: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const ordersCount = await this.prisma.order.count({
      where: { userId, status: { in: ['PAID', 'ACTIVE', 'PROVISIONING'] } },
    });

    return {
      hasPurchased: servers.length > 0 || ordersCount > 0,
      servers,
    };
  }

  /**
   * Create a new support ticket by a customer
   */
  async createTicket(
    userId: string,
    userEmail: string,
    userName: string,
    dto: CreateTicketDto,
  ) {
    // Post-purchase check: verify user has at least one active VPS or paid order
    const eligibility = await this.getUserEligibleServers(userId);
    if (!eligibility.hasPurchased) {
      throw new ForbiddenException(
        'Support tickets can only be created by customers with an active server or completed order. For general queries, please contact sales@247hrservice.com.',
      );
    }

    // If a VPS is selected, ensure it belongs to this user
    if (dto.vpsInstanceId) {
      const vps = await this.prisma.vPSInstance.findFirst({
        where: { id: dto.vpsInstanceId, userId },
      });
      if (!vps) {
        throw new BadRequestException('Selected server not found or does not belong to your account');
      }
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject.trim(),
        category: dto.category,
        priority: dto.priority,
        status: TicketStatus.OPEN,
        vpsInstanceId: dto.vpsInstanceId || null,
        orderId: dto.orderId || null,
        messages: {
          create: {
            senderId: userId,
            senderRole: UserRole.CUSTOMER,
            senderName: userName || userEmail.split('@')[0],
            message: dto.message.trim(),
          },
        },
      },
      include: {
        vpsInstance: {
          select: {
            id: true,
            hostname: true,
            ipAddress: true,
            status: true,
          },
        },
        messages: true,
      },
    });

    return ticket;
  }

  /**
   * Get all tickets for a specific customer
   */
  async getUserTickets(userId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId },
      include: {
        vpsInstance: {
          select: {
            id: true,
            hostname: true,
            ipAddress: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const counts = {
      total: tickets.length,
      open: tickets.filter((t) => t.status === TicketStatus.OPEN || t.status === TicketStatus.IN_PROGRESS).length,
      resolved: tickets.filter((t) => t.status === TicketStatus.RESOLVED || t.status === TicketStatus.CLOSED).length,
    };

    return { tickets, counts };
  }

  /**
   * Get detailed ticket thread by ID
   */
  async getTicketById(ticketId: string, userId?: string, isAdmin = false) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        vpsInstance: {
          select: {
            id: true,
            hostname: true,
            ipAddress: true,
            status: true,
            operatingSystem: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (!isAdmin && userId && ticket.userId !== userId) {
      throw new ForbiddenException('Access denied to this ticket');
    }

    return ticket;
  }

  /**
   * Add a reply to a ticket thread
   */
  async replyTicket(
    ticketId: string,
    senderId: string,
    senderRole: UserRole,
    senderName: string,
    message: string,
    isAdmin = false,
    newStatus?: TicketStatus,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (!isAdmin && ticket.userId !== senderId) {
      throw new ForbiddenException('Access denied to this ticket');
    }

    // Determine new status
    let nextStatus = newStatus || ticket.status;
    if (!newStatus) {
      if (isAdmin) {
        nextStatus = TicketStatus.AWAITING_CUSTOMER;
      } else {
        nextStatus = TicketStatus.IN_PROGRESS;
      }
    }

    const newMessage = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId,
        senderRole,
        senderName,
        message: message.trim(),
      },
    });

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: nextStatus,
        updatedAt: new Date(),
      },
    });

    return newMessage;
  }

  /**
   * Close a ticket
   */
  async closeTicket(ticketId: string, userId?: string, isAdmin = false) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (!isAdmin && userId && ticket.userId !== userId) {
      throw new ForbiddenException('Access denied to this ticket');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.CLOSED,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Admin: List all tickets across platform with filters
   */
  async getAdminTickets(query?: { status?: TicketStatus; priority?: string }) {
    const where: any = {};
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.priority) {
      where.priority = query.priority;
    }

    const [tickets, totalCount, openCount, inProgressCount, resolvedCount] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          vpsInstance: {
            select: {
              id: true,
              hostname: true,
              ipAddress: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.supportTicket.count(),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.OPEN } }),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.IN_PROGRESS } }),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.RESOLVED } }),
    ]);

    return {
      tickets,
      counts: {
        total: totalCount,
        open: openCount,
        inProgress: inProgressCount,
        resolved: resolvedCount,
      },
    };
  }

  /**
   * Admin: Update ticket status
   */
  async updateAdminStatus(ticketId: string, status: TicketStatus) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }
}
