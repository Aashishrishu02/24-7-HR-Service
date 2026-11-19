import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HostHeavenService } from './hostheaven.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('HostHeavenService', () => {
  let service: HostHeavenService;
  let configService: ConfigService;
  let prismaService: PrismaService;

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'VPS_MODE') return 'REAL';
        if (key === 'HOSTHEAVEN_BASE_URL') return 'https://api.hostheaven.example';
        if (key === 'HOSTHEAVEN_EMAIL') return 'reseller@247hrservice.com';
        if (key === 'HOSTHEAVEN_PASSWORD') return 'SecurePass123!';
        if (key === 'HOSTHEAVEN_RESELLER_DOMAIN') return '247hrservice.com';
        return null;
      }),
    } as unknown as ConfigService;

    prismaService = {
      provider: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    service = new HostHeavenService(configService, prismaService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & Token Management', () => {
    it('should obtain JWT token via /api/login and attach Bearer header', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, options: any) => {
        if (url.endsWith('/api/login')) {
          expect(options.method).toBe('POST');
          const body = JSON.parse(options.body);
          expect(body.email).toBe('reseller@247hrservice.com');
          expect(body.password).toBe('SecurePass123!');
          expect(options.headers['X-Reseller-Domain']).toBe('247hrservice.com');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'jwt-token-abc-123', expiresIn: 3600 })),
            json: () => Promise.resolve({ token: 'jwt-token-abc-123', expiresIn: 3600 }),
          });
        }
        if (url.endsWith('/api/wallet')) {
          expect(options.headers['Authorization']).toBe('Bearer jwt-token-abc-123');
          expect(options.headers['X-Reseller-Domain']).toBe('247hrservice.com');
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ id: 'w-1', balance: 15400.5, currency: 'INR' })),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      globalThis.fetch = mockFetch;

      const wallet = await service.getWalletBalance();
      expect(wallet.balance).toBe(15400.5);
      expect(wallet.currency).toBe('INR');

      // Second call should reuse cached token without hitting /api/login again
      await service.getWalletBalance();
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 login + 2 wallet requests
    });

    it('should refresh token on 401 Unauthorized', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          callCount++;
          const token = `token-v${callCount}`;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token })),
            json: () => Promise.resolve({ token }),
          });
        }
        if (url.endsWith('/api/wallet')) {
          if (callCount === 1) {
            // First attempt with token-v1 returns 401
            return Promise.resolve({
              ok: false,
              status: 401,
              text: () => Promise.resolve(JSON.stringify({ message: 'Token expired' })),
            });
          }
          // Second attempt with refreshed token-v2 succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ id: 'w-1', balance: 8000, currency: 'INR' })),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      globalThis.fetch = mockFetch;

      const wallet = await service.getWalletBalance();
      expect(wallet.balance).toBe(8000);
      expect(callCount).toBe(2); // Two logins occurred
    });
  });

  describe('testConnection', () => {
    it('should safely return connection verification with wallet balance and no secrets', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 'secret-token' })),
            json: () => Promise.resolve({ token: 'secret-token' }),
          });
        }
        if (url.endsWith('/api/wallet')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ id: 'wallet-hh-99', balance: 25000, currency: 'INR' })),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const result = await service.testConnection();
      expect(result.success).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.wallet.balance).toBe(25000);
      expect(result.wallet.currency).toBe('INR');
      expect((result as any).token).toBeUndefined();
      expect((result as any).password).toBeUndefined();
    });

    it('should fail cleanly when credentials are not configured', async () => {
      const noCredsConfig = {
        get: vi.fn(() => null),
      } as unknown as ConfigService;

      const noCredsService = new HostHeavenService(noCredsConfig, prismaService);
      const result = await noCredsService.testConnection();
      expect(result.success).toBe(false);
      expect(result.connected).toBe(false);
      expect(result.message).toContain('credentials not configured');
    });
  });

  describe('Live Catalogue APIs', () => {
    it('should query /api/users/zones', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 't-1' })),
            json: () => Promise.resolve({ token: 't-1' }),
          });
        }
        if (url.endsWith('/api/users/zones')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify([
              { id: 'zone-delhi', name: 'Delhi NCR', location: 'Delhi', isAvailable: true },
              { id: 'zone-mumbai', name: 'Mumbai', location: 'Mumbai', isAvailable: true },
            ])),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const zones = await service.getZones();
      expect(zones).toHaveLength(2);
      expect(zones[0].name).toBe('Delhi NCR');
    });

    it('should query /api/users/zones/{zoneId}/isos', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 't-1' })),
            json: () => Promise.resolve({ token: 't-1' }),
          });
        }
        if (url.includes('/api/users/zones/zone-delhi/isos')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify([
              { id: 'iso-u22', isoName: 'Ubuntu 22.04 LTS', osType: 'LINUX' },
              { id: 'iso-w22', isoName: 'Windows Server 2022', osType: 'WINDOWS' },
            ])),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const isos = await service.getZoneIsos('zone-delhi');
      expect(isos).toHaveLength(2);
      expect(isos[0].osType).toBe('LINUX');
      expect(isos[1].osType).toBe('WINDOWS');
    });

    it('should query pricing for shared and dedicated resources', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 't-1' })),
            json: () => Promise.resolve({ token: 't-1' }),
          });
        }
        if (url.includes('/api/pricing/shared/cpu')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify([
              { id: 'cpu-2', label: '2 Cores', cores: 2, price: 300 },
            ])),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const cpuPricing = await service.getPricing('shared', 'cpu');
      expect(cpuPricing).toHaveLength(1);
      expect(cpuPricing[0].cores).toBe(2);
      expect(cpuPricing[0].price).toBe(300);
    });
  });

  describe('Actual VM Provisioning', () => {
    it('should post to /api/users/vms/create with useWalletBalance: true', async () => {
      let sentPayload: any = null;
      let targetGateway: string = '';

      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 't-1' })),
            json: () => Promise.resolve({ token: 't-1' }),
          });
        }
        if (url.includes('/api/users/vms/create')) {
          const u = new URL(url);
          targetGateway = u.searchParams.get('gateway') || '';
          sentPayload = JSON.parse(options.body);
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve(JSON.stringify({
              status: 'COMPLETED',
              paymentId: 'hh-pay-501',
              orderId: 'hh-ord-501',
              groupId: 'hh-grp-501',
              vms: [
                {
                  id: 'vm-99',
                  vmId: 'vm-99',
                  ipAddress: '103.174.102.50',
                  hostname: 'vps-vm-99',
                  status: 'RUNNING',
                },
              ],
            })),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const result = await service.createVm({
        zoneId: 'zone-delhi',
        zoneIsoId: 'iso-u22',
        planType: 'SHARED',
        cpuPriceId: 'cpu-2',
        ramPriceId: 'ram-4',
        diskPriceId: 'disk-50',
        bandwidthPriceId: 'bw-1000',
        months: 1,
        quantity: 1,
        useWalletBalance: true,
        gateway: 'WALLET',
      });

      expect(targetGateway).toBe('WALLET');
      expect(sentPayload.useWalletBalance).toBe(true);
      expect(sentPayload.zoneId).toBe('zone-delhi');
      expect(sentPayload.cpuPriceId).toBe('cpu-2');
      expect(result.status).toBe('COMPLETED');
      expect(result.vms?.[0].ipAddress).toBe('103.174.102.50');
    });
  });

  describe('Orders, VM Details & Lock Status', () => {
    it('should query VM details and lock status', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 't-1' })),
            json: () => Promise.resolve({ token: 't-1' }),
          });
        }
        if (url.includes('/api/users/orders/vm-99/details')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              vmId: 'vm-99',
              proxmoxVmid: 105,
              vmName: 'vps-vm-99',
              ipAddress: '103.174.102.50',
              status: 'RUNNING',
            })),
          });
        }
        if (url.includes('/api/vms/vm-99/lock-status')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              vmId: 'vm-99',
              isLocked: false,
              status: 'UNLOCKED',
              message: 'Server is running normally',
            })),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const details = await service.getVmDetails('vm-99');
      expect(details.ipAddress).toBe('103.174.102.50');
      expect(details.proxmoxVmid).toBe(105);

      const lock = await service.getVmLockStatus('vm-99');
      expect(lock.isLocked).toBe(false);
      expect(lock.status).toBe('UNLOCKED');
    });
  });

  describe('VPS Controls, Metrics & Storage', () => {
    it('should execute power control start/stop', async () => {
      let controlAction = '';
      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 't-1' })),
            json: () => Promise.resolve({ token: 't-1' }),
          });
        }
        if (url.includes('/control')) {
          const u = new URL(url);
          controlAction = u.searchParams.get('action') || '';
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ status: 'OK', message: 'Action executed' })),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const res = await service.controlVm('u-1', 'vm-99', 'reboot');
      expect(controlAction).toBe('reboot');
      expect(res.success).toBe(true);
    });

    it('should fetch metrics and storage info', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 't-1' })),
            json: () => Promise.resolve({ token: 't-1' }),
          });
        }
        if (url.includes('/metrics')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              vmId: 'vm-99',
              timeframe: 'hour',
              cpu: { usagePercent: 18 },
              ram: { totalMb: 4096, usedMb: 1536, usagePercent: 37.5 },
              network: { rxBytes: 1000, txBytes: 500 },
              disk: { readBytes: 200, writeBytes: 100 },
            })),
          });
        }
        if (url.includes('/storage')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              vmId: 'vm-99',
              drives: [
                { mountPoint: '/', fsType: 'ext4', totalGb: 50, usedGb: 12, freeGb: 38, usagePercentage: 24 },
              ],
            })),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const metrics = await service.getVmMetrics('vm-99', 'hour');
      expect(metrics.cpu.usagePercent).toBe(18);
      expect(metrics.ram.usedMb).toBe(1536);

      const storage = await service.getVmStorage('vm-99');
      expect(storage.drives).toHaveLength(1);
      expect(storage.drives[0].usagePercentage).toBe(24);
    });
  });

  describe('Renewal Integration', () => {
    it('should calculate renewal and execute renewal', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        if (url.endsWith('/api/login')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ token: 't-1' })),
            json: () => Promise.resolve({ token: 't-1' }),
          });
        }
        if (url.includes('/calculate-renewal')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({
              originalAmount: 850,
              discountAmount: 50,
              payableAmount: 800,
              couponStatus: 'APPLIED',
              isSpecChange: false,
            })),
          });
        }
        if (url.includes('/upgrade-renew')) {
          const body = JSON.parse(options.body);
          expect(body.useWalletBalance).toBe(true);
          expect(body.monthsToAdd).toBe(1);
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ status: 'SUCCESS' })),
          });
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const calc = await service.calculateRenewal({
        vmId: 'vm-99',
        monthsToAdd: 1,
        couponCode: 'SAVE50',
      });
      expect(calc.payableAmount).toBe(800);
      expect(calc.couponStatus).toBe('APPLIED');

      const renewRes = await service.renewVm('vm-99', 1);
      expect(renewRes.success).toBe(true);
      expect(renewRes.monthsAdded).toBe(1);
    });
  });
});
