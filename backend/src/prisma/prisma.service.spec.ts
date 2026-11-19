import { describe, it, expect } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  it('should be defined', () => {
    expect(PrismaService).toBeDefined();
  });
});
