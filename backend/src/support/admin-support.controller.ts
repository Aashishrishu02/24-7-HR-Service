import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SupportService } from './support.service.js';
import { ReplyTicketDto } from './dto/reply-ticket.dto.js';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto.js';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';
import { UserRole } from '../generated/prisma/client.js';

@Controller('admin/support/tickets')
@UseGuards(AdminAuthGuard)
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  async getAllTickets(@Query() query: any) {
    return this.supportService.getAdminTickets(query);
  }

  @Get(':id')
  async getTicketDetails(@Param('id') id: string) {
    return this.supportService.getTicketById(id, undefined, true);
  }

  @Post(':id/reply')
  async replyTicket(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    const admin = req.admin;
    const adminName = admin?.name || 'Support Staff';
    const adminId = admin?.id || 'admin';
    return this.supportService.replyTicket(
      id,
      adminId,
      UserRole.ADMIN,
      adminName,
      dto.message,
      true,
      dto.newStatus,
    );
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportService.updateAdminStatus(id, dto.status);
  }
}
