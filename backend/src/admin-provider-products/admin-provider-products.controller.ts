
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
import { AdminProviderProductsService } from './admin-provider-products.service.js';

import { CreateProviderProductDto } from './dto/create-provider-product.dto.js';
import { UpdateProviderProductDto } from './dto/update-provider-product.dto.js';
import { UpdateProviderProductStatusDto } from './dto/update-provider-product-status.dto.js';

@Controller('admin/provider-products')
@UseGuards(AdminAuthGuard)
export class AdminProviderProductsController {
  constructor(
    private readonly service: AdminProviderProductsService,
  ) {}

  @Get()
  findAll(
    @Query('providerId') providerId?: string,
    @Query('productType') productType?: string,
    @Query('active') active?: string,
  ) {
    return this.service.findAll(
      providerId,
      productType,
      active,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProviderProductDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderProductDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderProductStatusDto,
  ) {
    return this.service.updateStatus(id, dto.isActive);
  }
}
