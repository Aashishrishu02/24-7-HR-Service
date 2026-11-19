import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HostHeavenService } from './hostheaven.service.js';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

describe('HostHeaven Integration — Provider API Specification Contract Tests (Mocked Upstream)', () => {
  let service: HostHeavenService;
  let configService: ConfigService;
  let prismaService: PrismaService;

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'VPS_MODE') return 'REAL';
        if (key === 'HOSTHEAVEN_BASE_URL') return 'https://backend.hostheaven.in';
        if (key === 'HOSTHEAVEN_EMAIL') return 'reseller@247hrservice.com';
        if (key === 'HOSTHEAVEN_PASSWORD') return 'StrictPassword123!';
        if (key === 'HOSTHEAVEN_RESELLER_DOMAIN') return '247hrservice.com';
        return null;
      }),
    } as unknown as ConfigService;

    prismaService = {
      provider: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      vPSInstance: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as PrismaService;

    service = new HostHeavenService(configService, prismaService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Live Provider Connection & Security', () => {
    it('enforces JWT authentication and X-Reseller-Domain on login', async () => {
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        if (url.endsWith('/api/login')) {
          capturedHeaders = opts.headers;
          capturedBody = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'hh_jwt_live_secure_token', expiresIn: 3600 })),
            json: () => Promise.resolve({ token: 'hh_jwt_live_secure_token', expiresIn: 3600 }),
          });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      const token = await service.getBearerToken();
      expect(token).toBe('hh_jwt_live_secure_token');
      expect(capturedHeaders['X-Reseller-Domain']).toBe('247hrservice.com');
      expect(capturedHeaders['Content-Type']).toBe('application/json');
      expect(capturedBody.email).toBe('reseller@247hrservice.com');
      expect(capturedBody.password).toBe('StrictPassword123!');
    });

    it('retrieves provider wallet balance and never exposes secrets in testConnection', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'hh_jwt_token', expiresIn: 3600 })),
            json: () => Promise.resolve({ token: 'hh_jwt_token', expiresIn: 3600 }),
          });
        }
        if (url.endsWith('/api/wallet')) {
          expect(opts.headers['Authorization']).toBe('Bearer hh_jwt_token');
          expect(opts.headers['X-Reseller-Domain']).toBe('247hrservice.com');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ id: 'hh-reseller-wallet', balance: 45000.75, currency: 'INR' })),
          });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      const result = await service.testConnection();
      expect(result.success).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.wallet.balance).toBe(45000.75);
      expect(result.wallet.currency).toBe('INR');

      // Crucial: check that zero passwords, secrets, or JWT tokens are present in result
      const resultString = JSON.stringify(result);
      expect(resultString).not.toContain('StrictPassword123!');
      expect(resultString).not.toContain('hh_jwt_token');
      expect((result as any).token).toBeUndefined();
      expect((result as any).password).toBeUndefined();
    });

    it('in REAL mode without credentials, returns connected: false and exact error without mock fallback', async () => {
      const emptyConfig = {
        get: vi.fn((key: string) => {
          if (key === 'VPS_MODE') return 'REAL';
          return null;
        }),
      } as unknown as ConfigService;

      const unconfiguredService = new HostHeavenService(emptyConfig, prismaService);
      const testResult = await unconfiguredService.testConnection();

      expect(testResult.success).toBe(false);
      expect(testResult.connected).toBe(false);
      expect(testResult.message).toContain('credentials not configured');
      expect(testResult.wallet.balance).toBe(0);
    });

    it('in REAL mode, catalogue query does NOT silently substitute mock data when upstream fails', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'hh_jwt_token' })),
            json: () => Promise.resolve({ token: 'hh_jwt_token' }),
          });
        }
        if (url.endsWith('/api/users/zones')) {
          return Promise.resolve({
            ok: false,
            status: 502,
            text: () => Promise.resolve(JSON.stringify({ message: 'Bad Gateway from HostHeaven upstream' })),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });

      await expect(service.getZones()).rejects.toThrow('Bad Gateway from HostHeaven upstream');
    });
  });

  describe('2. Documented Live Catalogue Endpoints', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'token-catalog' })),
            json: () => Promise.resolve({ token: 'token-catalog' }),
          });
        }
        if (url.endsWith('/api/users/zones')) {
          expect(opts.headers['X-Reseller-Domain']).toBe('247hrservice.com');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify([
              { id: 'zone-delhi', name: 'Delhi NCR', location: 'Delhi', country: 'India', isAvailable: true },
              { id: 'zone-mumbai', name: 'Mumbai', location: 'Mumbai', country: 'India', isAvailable: true },
            ])),
          });
        }
        if (url.includes('/api/users/zones/zone-delhi/isos')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify([
              { id: 'iso-u22', isoName: 'Ubuntu 22.04 LTS', osType: 'LINUX', isDefault: true },
              { id: 'iso-win22', isoName: 'Windows Server 2022 Standard', osType: 'WINDOWS', isDefault: false },
            ])),
          });
        }
        if (url.includes('/api/pricing/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify([
              { id: 'item-1', label: '1 Unit', price: 100 },
            ])),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
    });

    it('fetches zones directly from /api/users/zones', async () => {
      const zones = await service.getZones();
      expect(zones).toHaveLength(2);
      expect(zones[0].id).toBe('zone-delhi');
      expect(zones[1].id).toBe('zone-mumbai');
    });

    it('fetches ISO templates from /api/users/zones/{zoneId}/isos', async () => {
      const isos = await service.getZoneIsos('zone-delhi');
      expect(isos).toHaveLength(2);
      expect(isos[0].isoName).toBe('Ubuntu 22.04 LTS');
      expect(isos[1].osType).toBe('WINDOWS');
    });

    it('fetches complete pricing matrix across shared and dedicated tiers', async () => {
      const matrix = await service.getCompletePricing();
      expect(matrix.shared.cpu).toBeDefined();
      expect(matrix.shared.ram).toBeDefined();
      expect(matrix.shared.disk).toBeDefined();
      expect(matrix.shared.bandwidth).toBeDefined();
      expect(matrix.dedicated.cpu).toBeDefined();
      expect(matrix.dedicated.ram).toBeDefined();
      expect(matrix.dedicated.disk).toBeDefined();
      expect(matrix.dedicated.bandwidth).toBeDefined();
    });
  });

  describe('3. VM Provisioning, Lifecycle Controls & Diagnostics', () => {
    it('executes createVm with useWalletBalance: true and stores real provider VM info', async () => {
      let postedBody: any = null;
      let requestedUrl = '';

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'token-vm' })),
            json: () => Promise.resolve({ token: 'token-vm' }),
          });
        }
        if (url.includes('/api/users/vms/create')) {
          requestedUrl = url;
          postedBody = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve(JSON.stringify({
              status: 'COMPLETED',
              paymentId: 'hh-pay-live-001',
              orderId: 'hh-ord-live-001',
              groupId: 'hh-grp-live-001',
              vms: [
                {
                  id: 'vm-live-888',
                  vmId: 'vm-live-888',
                  ipAddress: '103.174.102.88',
                  hostname: 'vps-hostheaven-888',
                  status: 'RUNNING',
                },
              ],
              message: 'VM created successfully',
            })),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const createResult = await service.createVm({
        zoneId: 'zone-delhi',
        zoneIsoId: 'iso-u22',
        planType: 'SHARED',
        cpuPriceId: 'cpu-2',
        ramPriceId: 'ram-4',
        diskPriceId: 'disk-80',
        bandwidthPriceId: 'bw-1000',
        months: 1,
        quantity: 1,
        useWalletBalance: true,
        gateway: 'WALLET',
      });

      expect(requestedUrl).toContain('gateway=WALLET');
      expect(postedBody.useWalletBalance).toBe(true);
      expect(postedBody.zoneId).toBe('zone-delhi');
      expect(createResult.status).toBe('COMPLETED');
      expect(createResult.vms?.[0].vmId).toBe('vm-live-888');
      expect(createResult.vms?.[0].ipAddress).toBe('103.174.102.88');
    });

    it('executes power operations, password update, and rebuild', async () => {
      let capturedActions: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'token-vm' })),
            json: () => Promise.resolve({ token: 'token-vm' }),
          });
        }
        if (url.includes('/control')) {
          const u = new URL(url);
          capturedActions.push(u.searchParams.get('action') || '');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ status: 'OK', message: 'Action queued' })),
          });
        }
        if (url.includes('/rebuild')) {
          expect(url).toContain('isoId=iso-win22');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ status: 'OK', message: 'VM rebuild initiated' })),
          });
        }
        if (url.includes('/password')) {
          const body = JSON.parse(opts.body);
          expect(body.password).toBe('NewAdminPass123!');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ status: 'OK', message: 'Password updated' })),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      // Test power actions
      await service.controlVm('u-1', 'vm-live-888', 'start');
      await service.controlVm('u-1', 'vm-live-888', 'stop');
      await service.controlVm('u-1', 'vm-live-888', 'reboot');
      expect(capturedActions).toEqual(['start', 'stop', 'reboot']);

      // Test rebuild
      const rebuildRes = await service.rebuildVm('u-1', 'vm-live-888', 'iso-win22');
      expect(rebuildRes.success).toBe(true);

      // Test password change
      const passRes = await service.changeVmPassword('u-1', 'vm-live-888', 'NewAdminPass123!');
      expect(passRes.success).toBe(true);
    });

    it('queries metrics, storage and lock-status correctly', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'token-diag' })),
            json: () => Promise.resolve({ token: 'token-diag' }),
          });
        }
        if (url.includes('/metrics')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              vmId: 'vm-888',
              timeframe: 'hour',
              cpu: { usagePercent: 12.5 },
              ram: { totalMb: 4096, usedMb: 2048, usagePercent: 50.0 },
              network: { rxBytes: 1048576, txBytes: 524288 },
              disk: { readBytes: 20480, writeBytes: 40960 },
            })),
          });
        }
        if (url.includes('/storage')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              vmId: 'vm-888',
              drives: [
                { mountPoint: '/', fsType: 'ext4', totalGb: 80, usedGb: 15, freeGb: 65, usagePercentage: 18.75 },
              ],
            })),
          });
        }
        if (url.includes('/lock-status')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              vmId: 'vm-888',
              isLocked: false,
              status: 'UNLOCKED',
              message: 'VM is operational',
            })),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const metrics = await service.getVmMetrics('vm-888', 'hour');
      expect(metrics.cpu.usagePercent).toBe(12.5);
      expect(metrics.ram.usagePercent).toBe(50.0);

      const storage = await service.getVmStorage('vm-888');
      expect(storage.drives[0].freeGb).toBe(65);

      const lock = await service.getVmLockStatus('vm-888');
      expect(lock.isLocked).toBe(false);
      expect(lock.status).toBe('UNLOCKED');
    });
  });

  describe('4. Phase 3 Renewal Integration Contract', () => {
    it('calculates renewal and calls /api/vms/renew/{vmId}/upgrade-renew with useWalletBalance: true', async () => {
      let renewalBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'token-renew' })),
            json: () => Promise.resolve({ token: 'token-renew' }),
          });
        }
        if (url.includes('/calculate-renewal')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              originalAmount: 999,
              discountAmount: 100,
              payableAmount: 899,
              couponStatus: 'APPLIED',
              isSpecChange: false,
            })),
          });
        }
        if (url.includes('/upgrade-renew')) {
          renewalBody = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ status: 'SUCCESS' })),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const calc = await service.calculateRenewal({
        vmId: 'vm-888',
        monthsToAdd: 1,
        couponCode: 'RENEW100',
      });
      expect(calc.payableAmount).toBe(899);

      const renewRes = await service.renewVm('vm-888', 1);
      expect(renewRes.success).toBe(true);
      expect(renewRes.monthsAdded).toBe(1);
      expect(renewalBody.useWalletBalance).toBe(true);
      expect(renewalBody.vmId).toBe('vm-888');
    });
  });
});
