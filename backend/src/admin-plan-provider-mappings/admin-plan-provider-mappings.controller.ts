
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';

import { AdminPlanProviderMappingsService } from './admin-plan-provider-mappings.service.js';

import { CreatePlanProviderMappingDto } from './dto/create-plan-provider-mapping.dto.js';
import { UpdatePlanProviderMappingDto } from './dto/update-plan-provider-mapping.dto.js';

@Controller('admin/plan-provider-mappings')
@UseGuards(AdminAuthGuard)
export class AdminPlanProviderMappingsController {
  constructor(
    private readonly service: AdminPlanProviderMappingsService,
  ) {}

  // GET all mappings with optional filters
  @Get()
  findAll(
    @Query('planId') planId?: string,
    @Query('providerId') providerId?: string,
    @Query('enabled') enabled?: string,
  ) {
    return this.service.findAll(planId, providerId, enabled);
  }

  // GET mapping by ID
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(id);
  }

  // CREATE mapping
  @Post()
  create(
    @Body() dto: CreatePlanProviderMappingDto,
  ) {
    return this.service.create(dto);
  }

  // UPDATE mapping
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanProviderMappingDto,
  ) {
    return this.service.update(id, dto);
  }
}
