import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SupportService } from './support.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ReplyTicketDto } from './dto/reply-ticket.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UserRole } from '../generated/prisma/client.js';

@Controller('support/tickets')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('eligibility')
  async getEligibility(@Req() req: any) {
    const userId = req.user.sub || req.user.id;
    return this.supportService.getUserEligibleServers(userId);
  }

  @Post()
  async createTicket(@Req() req: any, @Body() dto: CreateTicketDto) {
    const userId = req.user.sub || req.user.id;
    const email = req.user.email || '';
    const name = req.user.name || email.split('@')[0];
    return this.supportService.createTicket(userId, email, name, dto);
  }

  @Get()
  async getMyTickets(@Req() req: any) {
    const userId = req.user.sub || req.user.id;
    return this.supportService.getUserTickets(userId);
  }

  @Get(':id')
  async getTicketDetails(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub || req.user.id;
    return this.supportService.getTicketById(id, userId, false);
  }

  @Post(':id/reply')
  async replyTicket(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    const userId = req.user.sub || req.user.id;
    const email = req.user.email || '';
    const name = req.user.name || email.split('@')[0];
    return this.supportService.replyTicket(
      id,
      userId,
      UserRole.CUSTOMER,
      name,
      dto.message,
      false,
    );
  }

  @Patch(':id/close')
  async closeTicket(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub || req.user.id;
    return this.supportService.closeTicket(id, userId, false);
  }
}
