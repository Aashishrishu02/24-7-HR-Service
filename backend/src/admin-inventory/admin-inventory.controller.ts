
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';

import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';
import { AdminInventoryService } from './admin-inventory.service.js';
import { CreateInventoryDto } from './dto/create-inventory.dto.js';
import { UpdateInventoryStatusDto } from './dto/update-inventory-status.dto.js';

@Controller('admin/inventory')
@UseGuards(AdminAuthGuard)
export class AdminInventoryController {
  constructor(
    private readonly inventoryService: AdminInventoryService,
  ) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('providerId') providerId?: string,
  ) {
    return this.inventoryService.findAll(status, providerId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInventoryDto) {
    return this.inventoryService.create(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryStatusDto,
  ) {
    return this.inventoryService.updateStatus(
      id,
      dto.status,
    );
  }
}
