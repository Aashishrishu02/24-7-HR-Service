
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';

import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';
import { AdminProvidersService } from './admin-providers.service.js';

import { CreateProviderDto } from './dto/create-provider.dto.js';
import { UpdateProviderDto } from './dto/update-provider.dto.js';
import { UpdateProviderStatusDto } from './dto/update-provider-status.dto.js';

@Controller('admin/providers')
@UseGuards(AdminAuthGuard)
export class AdminProvidersController {
  constructor(
    private readonly adminProvidersService: AdminProvidersService,
  ) {}

  @Get()
  findAll() {
    return this.adminProvidersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProvidersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProviderDto) {
    return this.adminProvidersService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.adminProvidersService.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderStatusDto,
  ) {
    return this.adminProvidersService.updateStatus(
      id,
      dto.isActive,
    );
  }
}
