import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res({ passthrough: true }) response: Response) {
    const checkedAt = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      response.status(200);
      return {
        status: 'ok',
        service: 'backend',
        database: 'connected',
        checkedAt,
      };
    } catch {
      response.status(503);
      return {
        status: 'degraded',
        service: 'backend',
        database: 'disconnected',
        checkedAt,
      };
    }
  }
}
