import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostHeavenDirectCatalogueService } from './hostheaven-direct-catalogue.service.js';
import { HostHeavenService } from './hostheaven.service.js';
import { AdminSettingsService } from '../renewal/admin-settings.service.js';

describe('HostHeavenDirectCatalogueService — Direct Automatic Catalogue & 20% Margin', () => {
  let service: HostHeavenDirectCatalogueService;
  let mockHostHeavenService: any;
  let mockAdminSettingsService: any;

  const mockZones = [
    {
      id: 'zone-in-delhi',
      name: 'Delhi NCR Cloud',
      location: 'Delhi, India',
      status: 'ACTIVE',
      isAvailable: true,
    },
  ];

  const mockIsos = [
    {
      id: 'iso-u22',
      isoName: 'Ubuntu 22.04 LTS',
      osType: 'LINUX',
    },
    {
      id: 'iso-win22',
      isoName: 'Windows Server 2022',
      osType: 'WINDOWS',
    },
  ];

  // Pricing rates: 0.1, 0.1954, 0.2, 0.4 -> hourly 0.8954 -> 720h month = 644.688 -> ₹644.69
  const mockPricing = {
    shared: {
      cpu: [
        { id: 'cpu-1c', label: '1 vCPU', cores: 1, price: 0.1 },
        { id: 'cpu-slot', label: 'Slot IP CPU', cores: 2, price: 0.0 },
      ],
      ram: [
        { id: 'ram-1g', label: '1 GB RAM', ram: 1, price: 0.1954 },
        { id: 'ram-slot-1g', label: 'Slot IP 1 GB', ram: 1, price: 0.4861 },
      ],
      disk: [
        { id: 'disk-20g', label: '20 GB SSD', diskGb: 20, price: 0.2 },
        { id: 'disk-slot-20g', label: 'Slot IP 20 GB', diskGb: 20, price: 0.0 },
      ],
      bandwidth: [
        { id: 'bw-1t', label: '1 TB BW', bandwidthGb: 1000, price: 0.4 },
        { id: 'bw-slot-2t', label: 'Slot IP 2 TB', bandwidthGb: 2000, price: 0.0 },
      ],
    },
    dedicated: {
      cpu: [{ id: 'cpu-2c-ded', label: '2 Dedicated vCPU', cores: 2, price: 0.25 }],
      ram: [{ id: 'ram-4g-ded', label: '4 GB RAM', ram: 4, price: 0.5555 }],
      disk: [{ id: 'disk-50g-ded', label: '50 GB SSD', diskGb: 50, price: 0.5 }],
      bandwidth: [{ id: 'bw-2t-ded', label: '2 TB BW', bandwidthGb: 2000, price: 0.5 }],
    },
  };

  beforeEach(() => {
    mockHostHeavenService = {
      getZones: vi.fn().mockResolvedValue(mockZones),
      getZoneIsos: vi.fn().mockResolvedValue(mockIsos),
      getCompletePricing: vi.fn().mockResolvedValue(mockPricing),
    };

    mockAdminSettingsService = {
      getSettings: vi.fn().mockResolvedValue({
        hostHeavenProfitMarginPercent: 20,
      }),
    };

    service = new HostHeavenDirectCatalogueService(
      mockHostHeavenService as unknown as HostHeavenService,
      mockAdminSettingsService as unknown as AdminSettingsService,
    );
  });

  describe('1. Direct Automatic Catalogue Discovery', () => {
    it('discovers services directly from HostHeaven API without manual VPSPlan mapping', async () => {
      const response = await service.getLiveServices();

      expect(response).toBeDefined();
      expect(response.services.length).toBeGreaterThan(0);
      expect(response.total).toBe(response.services.length);
      expect(response.marginPercent).toBe(20);
      expect(response.currency).toBe('INR');
      expect(response.isStale).toBe(false);

      const firstService = response.services[0];
      expect(firstService.id).toContain('hh:');
      expect(firstService.name).toContain('1 vCPU - 1 GB RAM');
      expect(firstService.zone.id).toBe('zone-in-delhi');
      expect(firstService.supportedOS).toContain('Ubuntu 22.04 LTS');
      expect(firstService.isHostHeaven).toBe(true);
      expect(firstService.providerConfig).toBeDefined();
    });

    it('enforces 20% gross profit margin: ₹644.69 provider cost -> ₹805.86 customer price', async () => {
      const response = await service.getLiveServices();
      const sharedService = response.services.find((s) => s.tier === 'SHARED');
      expect(sharedService).toBeDefined();

      // Hourly 0.8954 * 720 = 644.688 -> 644.69
      // Customer Price = 644.69 / (1 - 0.20) = 805.8625 -> ₹805.86
      expect(sharedService!.monthlyPrice).toBe(805.86);
      expect(sharedService!.price).toBe(805.86);
    });

    it('never exposes providerCost, hourly rates, or credentials in public service objects', async () => {
      const response = await service.getLiveServices();

      for (const svc of response.services) {
        expect((svc as any).providerCost).toBeUndefined();
        expect((svc as any).totalHourlyRate).toBeUndefined();
        expect((svc as any).apiKey).toBeUndefined();
        expect((svc as any).apiSecret).toBeUndefined();
        expect((svc as any).apiUrl).toBeUndefined();
      }
    });

    it('generates multi-month billing options with 20% margin applied to all durations', async () => {
      const response = await service.getLiveServices();
      const svc = response.services[0];

      expect(svc.billingOptions).toHaveLength(4);
      const [opt1, opt3, opt6, opt12] = svc.billingOptions;

      expect(opt1.months).toBe(1);
      expect(opt1.customerPrice).toBe(805.86);

      expect(opt3.months).toBe(3);
      // 644.69 * 3 = 1934.07 -> 1934.07 / 0.8 = 2417.5875 -> 2417.59
      expect(opt3.customerPrice).toBe(2417.59);

      expect(opt6.months).toBe(6);
      // 644.69 * 6 = 3868.14 -> 3868.14 / 0.8 = 4835.175 -> 4835.18
      expect(opt6.customerPrice).toBe(4835.18);

      expect(opt12.months).toBe(12);
      // 644.69 * 12 = 7736.28 -> 7736.28 / 0.8 = 9670.35
      expect(opt12.customerPrice).toBe(9670.35);
    });
  });

  describe('2. In-Memory Caching & Graceful Upstream Fallback', () => {
    it('serves cached results on repeated calls without hitting HostHeaven API again', async () => {
      await service.getLiveServices();
      expect(mockHostHeavenService.getZones).toHaveBeenCalledTimes(1);

      await service.getLiveServices();
      expect(mockHostHeavenService.getZones).toHaveBeenCalledTimes(1);
    });

    it('falls back to last known good cache with isStale: true if upstream fails', async () => {
      // Prime the cache
      await service.getLiveServices();

      // Now simulate upstream outage on forced refresh
      mockHostHeavenService.getZones.mockRejectedValueOnce(new Error('HostHeaven API timeout'));

      const response = await service.getLiveServices(true);
      expect(response.services.length).toBeGreaterThan(0);
      expect(response.isStale).toBe(true);
    });
  });

  describe('3. Server-Side Configuration Validation at Checkout', () => {
    it('validates configuration and computes authoritative price server-side', async () => {
      const validated = await service.validateConfiguration({
        zoneId: 'zone-in-delhi',
        zoneIsoId: 'iso-u22',
        planType: 'SHARED',
        cpuPriceId: 'cpu-1c',
        ramPriceId: 'ram-1g',
        diskPriceId: 'disk-20g',
        bandwidthPriceId: 'bw-1t',
        months: 1,
      });

      expect(validated.serviceName).toContain('Cloud VPS 1 vCPU - 1 GB RAM');
      expect(validated.monthlyProviderCost).toBe(644.69);
      expect(validated.totalProviderCost).toBe(644.69);
      expect(validated.marginPercent).toBe(20);
      expect(validated.customerSellingPrice).toBe(805.86);
      expect(validated.grossProfit).toBe(161.17);
    });

    it('rejects unavailable or forged zone IDs with BadRequestException', async () => {
      await expect(
        service.validateConfiguration({
          zoneId: 'invalid-zone-id',
          zoneIsoId: 'iso-u22',
          planType: 'SHARED',
          cpuPriceId: 'cpu-1c',
          ramPriceId: 'ram-1g',
          diskPriceId: 'disk-20g',
          bandwidthPriceId: 'bw-1t',
        }),
      ).rejects.toThrow(/not currently available/);
    });

    it('rejects unavailable or forged pricing IDs with BadRequestException', async () => {
      await expect(
        service.validateConfiguration({
          zoneId: 'zone-in-delhi',
          zoneIsoId: 'iso-u22',
          planType: 'SHARED',
          cpuPriceId: 'cpu-fake-id',
          ramPriceId: 'ram-1g',
          diskPriceId: 'disk-20g',
          bandwidthPriceId: 'bw-1t',
        }),
      ).rejects.toThrow(/not currently available in the HostHeaven pricing catalogue/);
    });

    it('strictly rejects mixed Standard and Slot IP pricing selections at checkout', async () => {
      // Mixed: Standard CPU (cpu-1c) + Slot IP RAM (ram-slot-1g) -> the ₹1,067.49 culprit
      await expect(
        service.validateConfiguration({
          zoneId: 'zone-in-delhi',
          zoneIsoId: 'iso-u22',
          planType: 'SHARED',
          cpuPriceId: 'cpu-1c',
          ramPriceId: 'ram-slot-1g',
          diskPriceId: 'disk-20g',
          bandwidthPriceId: 'bw-1t',
          months: 1,
        }),
      ).rejects.toThrow(/Invalid pricing combination: Standard and Slot IP resources cannot be mixed/);

      // Mixed: Slot IP CPU (cpu-slot) + Standard RAM (ram-1g) -> the ₹715.86 culprit
      await expect(
        service.validateConfiguration({
          zoneId: 'zone-in-delhi',
          zoneIsoId: 'iso-u22',
          planType: 'SHARED',
          cpuPriceId: 'cpu-slot',
          ramPriceId: 'ram-1g',
          diskPriceId: 'disk-20g',
          bandwidthPriceId: 'bw-1t',
          months: 1,
        }),
      ).rejects.toThrow(/Invalid pricing combination: Standard and Slot IP resources cannot be mixed/);

      // Mixed: Slot IP RAM (ram-slot-1g) + Standard Disk & Bandwidth -> the ₹977.49 culprit
      await expect(
        service.validateConfiguration({
          zoneId: 'zone-in-delhi',
          zoneIsoId: 'iso-u22',
          planType: 'SHARED',
          cpuPriceId: 'cpu-slot',
          ramPriceId: 'ram-slot-1g',
          diskPriceId: 'disk-20g',
          bandwidthPriceId: 'bw-1t',
          months: 1,
        }),
      ).rejects.toThrow(/Invalid pricing combination: Standard and Slot IP resources cannot be mixed/);
    });
  });

  describe('4. Strict Isolation of Standard vs Slot IP & Prevention of Fabricated Prices', () => {
    it('generates Pure Standard (₹805.86) and Pure Slot IP (₹437.49) separately', async () => {
      const response = await service.getLiveServices();

      const standardSvc = response.services.find((s) => s.id.startsWith('hh:SHARED:'));
      expect(standardSvc).toBeDefined();
      expect(standardSvc!.name).toContain('Standard Cloud VPS');
      expect(standardSvc!.monthlyPrice).toBe(805.86);

      const slotIpSvc = response.services.find((s) => s.id.startsWith('hh:SLOT_IP:'));
      expect(slotIpSvc).toBeDefined();
      expect(slotIpSvc!.name).toContain('Slot IP Cloud VPS');
      expect(slotIpSvc!.monthlyPrice).toBe(437.49);
    });

    it('guarantees fabricated mixed prices (₹1,067.49, ₹715.86, ₹977.49) NEVER exist in services', async () => {
      const response = await service.getLiveServices();
      const allPrices = response.services.map((s) => s.monthlyPrice);

      // The 3 screenshot mixed fabricated prices must NOT be anywhere in the catalogue
      expect(allPrices).not.toContain(1067.49);
      expect(allPrices).not.toContain(715.86);
      expect(allPrices).not.toContain(977.49);
    });
  });
});
