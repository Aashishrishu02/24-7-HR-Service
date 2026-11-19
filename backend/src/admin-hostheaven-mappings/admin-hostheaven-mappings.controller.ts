import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard.js';
import { AdminHostHeavenMappingsService } from './admin-hostheaven-mappings.service.js';
import { CreateHostHeavenMappingDto } from './dto/create-hostheaven-mapping.dto.js';
import { UpdateHostHeavenMappingDto } from './dto/update-hostheaven-mapping.dto.js';
import { CalculateHostHeavenPriceDto } from './dto/calculate-price.dto.js';

@Controller('admin/hostheaven/mappings')
@UseGuards(AdminAuthGuard)
export class AdminHostHeavenMappingsController {
  constructor(
    private readonly mappingsService: AdminHostHeavenMappingsService,
  ) {}

  @Get()
  async findAll(
    @Query('planId') planId?: string,
    @Query('isActive') isActive?: string,
    @Query('isCostVerified') isCostVerified?: string,
  ) {
    return this.mappingsService.findAll(planId, isActive, isCostVerified);
  }

  @Post('sync')
  async syncNow() {
    return this.mappingsService.syncNow();
  }

  @Get('sync/status')
  async getSyncStatus() {
    return this.mappingsService.getSyncStatus();
  }

  @Post(':id/confirm-cost')
  async confirmCost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('providerCost') providerCost: number,
  ) {
    return this.mappingsService.confirmCost(id, Number(providerCost));
  }

  @Post('calculate-price')
  async calculatePrice(@Body() dto: CalculateHostHeavenPriceDto) {
    return this.mappingsService.calculatePricing(dto);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.mappingsService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateHostHeavenMappingDto) {
    return this.mappingsService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHostHeavenMappingDto,
  ) {
    return this.mappingsService.update(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.mappingsService.updateStatus(id, Boolean(isActive));
  }

  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.mappingsService.delete(id);
  }
}
