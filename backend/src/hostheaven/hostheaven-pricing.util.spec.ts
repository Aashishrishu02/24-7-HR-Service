import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  calculateSellingPrice,
  calculateProviderCost,
  calculatePricingBreakdown,
  calculateDurationMonths,
  validateResourceRate,
  profitMarginToMarkup,
  markupToProfitMargin,
  HOURS_PER_MONTH,
  VERIFIED_HOSTHEAVEN_DURATIONS,
  isSlotIpItem,
  assertNotMixedPricing,
} from './hostheaven-pricing.util.js';

describe('HostHeaven Pricing Utility — Final Billing Accuracy Correction', () => {
  describe('HOURS_PER_MONTH & calculateDurationMonths', () => {
    it('verifies standard billing constant is 720 hours per 30-day month', () => {
      expect(HOURS_PER_MONTH).toBe(720);
    });

    it('verifies VERIFIED_HOSTHEAVEN_DURATIONS dictionary is frozen and accurate', () => {
      expect(VERIFIED_HOSTHEAVEN_DURATIONS[30]).toBe(1);
      expect(VERIFIED_HOSTHEAVEN_DURATIONS[90]).toBe(3);
      expect(VERIFIED_HOSTHEAVEN_DURATIONS[180]).toBe(6);
      expect(VERIFIED_HOSTHEAVEN_DURATIONS[365]).toBe(12);
      expect(Object.isFrozen(VERIFIED_HOSTHEAVEN_DURATIONS)).toBe(true);
    });

    it('correctly maps verified plan duration days to billing months', () => {
      expect(calculateDurationMonths(30)).toBe(1);
      expect(calculateDurationMonths(90)).toBe(3);
      expect(calculateDurationMonths(180)).toBe(6);
      expect(calculateDurationMonths(365)).toBe(12);
    });

    it('strictly rejects unsupported durations with a clear BadRequestException', () => {
      expect(() => calculateDurationMonths(60)).toThrow(
        new BadRequestException(
          'Unsupported duration: 60 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
        ),
      );
      expect(() => calculateDurationMonths(15)).toThrow(
        'Unsupported duration: 15 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
      expect(() => calculateDurationMonths(45)).toThrow(
        'Unsupported duration: 45 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
      expect(() => calculateDurationMonths(100)).toThrow(
        'Unsupported duration: 100 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
      expect(() => calculateDurationMonths(360)).toThrow(
        'Unsupported duration: 360 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
      expect(() => calculateDurationMonths(400)).toThrow(
        'Unsupported duration: 400 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
      expect(() => calculateDurationMonths(0)).toThrow(
        'Unsupported duration: 0 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
      expect(() => calculateDurationMonths(-30)).toThrow(
        'Unsupported duration: -30 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
    });

    it('strictly rejects non-numeric or non-finite duration inputs with BadRequestException', () => {
      expect(() => calculateDurationMonths(NaN)).toThrow(
        'Plan duration must be a valid finite number of days. Received: NaN',
      );
      expect(() => calculateDurationMonths(Infinity)).toThrow(
        'Plan duration must be a valid finite number of days. Received: Infinity',
      );
      expect(() => calculateDurationMonths(-Infinity)).toThrow(
        'Plan duration must be a valid finite number of days. Received: -Infinity',
      );
      expect(() => calculateDurationMonths(null as any)).toThrow(
        'Plan duration must be a valid finite number of days. Received: null',
      );
      expect(() => calculateDurationMonths(undefined as any)).toThrow(
        'Plan duration must be a valid finite number of days. Received: undefined',
      );
      expect(() => calculateDurationMonths('30' as any)).toThrow(
        'Plan duration must be a valid finite number of days. Received: 30',
      );
    });
  });

  describe('validateResourceRate — Decimal Input Validation & No Silent Zero Coercion', () => {
    it('accepts valid finite non-negative numbers, strings, and Prisma.Decimal instances', () => {
      expect(validateResourceRate(0.1954).toNumber()).toBe(0.1954);
      expect(validateResourceRate(0).toNumber()).toBe(0);
      expect(validateResourceRate('0.6251').toNumber()).toBe(0.6251);
      expect(validateResourceRate('0').toNumber()).toBe(0);
      expect(validateResourceRate(new Prisma.Decimal('0.2')).toNumber()).toBe(0.2);
    });

    it('rejects null and undefined instead of silently converting them to zero', () => {
      expect(() => validateResourceRate(null)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => validateResourceRate(undefined)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
    });

    it('rejects NaN, Infinity and -Infinity', () => {
      expect(() => validateResourceRate(NaN)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => validateResourceRate(Infinity)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => validateResourceRate(-Infinity)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
    });

    it('rejects negative numbers and negative strings', () => {
      expect(() => validateResourceRate(-0.1)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => validateResourceRate('-0.001')).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
    });

    it('rejects non-numeric strings and invalid object types', () => {
      expect(() => validateResourceRate('abc')).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => validateResourceRate('')).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => validateResourceRate('   ')).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => validateResourceRate({} as any)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
    });
  });

  describe('calculateProviderCost — Verified Hourly Rates Conversion Across Durations', () => {
    it('converts Shared VPS fractional hourly rates (0.1, 0.1954, 0.2, 0.4) to exact monthly cost (₹644.69)', () => {
      // Rates:
      // CPU: 0.1 ₹/hr
      // RAM: 0.1954 ₹/hr
      // Disk: 0.2 ₹/hr
      // BW: 0.4 ₹/hr
      // Sum: 0.8954 ₹/hr * 720 hrs = 644.688 -> ₹644.69 (Matches HostHeaven live order VM 17319!)
      const monthlyCost = calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 30);
      expect(monthlyCost).toBe(644.69);
    });

    it('converts Dedicated VPS fractional hourly rates (0.6251, 0.7264, 0.2724, 0.1816) to exact monthly cost (₹1,299.96)', () => {
      // Rates:
      // CPU: 0.6251 ₹/hr
      // RAM: 0.7264 ₹/hr
      // Disk: 0.2724 ₹/hr
      // BW: 0.1816 ₹/hr
      // Sum: 1.8055 ₹/hr * 720 hrs = 1299.96 -> ₹1,299.96 (Matches HostHeaven live order VM 18092!)
      const monthlyCost = calculateProviderCost(0.6251, 0.7264, 0.2724, 0.1816, 30);
      expect(monthlyCost).toBe(1299.96);
    });

    it('converts Slot IP 1 GB bundled rate (0.4861 ₹/hr) to exact ₹349.99 entry price', () => {
      // 0.4861 * 720 = 349.992 -> ₹349.99
      const cost = calculateProviderCost(0, 0.4861, 0, 0, 30);
      expect(cost).toBe(349.99);
    });

    it('supports 30-day, 90-day, 180-day and 365-day durations matching HostHeaven billing API', () => {
      // Shared rates: 0.8954 ₹/hr -> ₹644.69/mo
      // 30 days (1 mo): ₹644.69
      expect(calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 30)).toBe(644.69);

      // 90 days (3 mo): 644.69 * 3 = ₹1,934.07 (Matches HostHeaven calculate-renewal API!)
      expect(calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 90)).toBe(1934.07);

      // 180 days (6 mo): 644.69 * 6 = ₹3,868.14 (Matches HostHeaven calculate-renewal API!)
      expect(calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 180)).toBe(3868.14);

      // 365 days (12 mo): 644.69 * 12 = ₹7,736.28 (Matches HostHeaven calculate-renewal API!)
      expect(calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 365)).toBe(7736.28);
    });

    it('supports Dedicated VPS multi-month durations matching HostHeaven billing API', () => {
      // Dedicated rates: 1.8055 ₹/hr -> ₹1,299.96/mo
      // 30 days: ₹1,299.96
      expect(calculateProviderCost(0.6251, 0.7264, 0.2724, 0.1816, 30)).toBe(1299.96);

      // 90 days: 1299.96 * 3 = ₹3,899.88 (Matches HostHeaven calculate-renewal API!)
      expect(calculateProviderCost(0.6251, 0.7264, 0.2724, 0.1816, 90)).toBe(3899.88);

      // 180 days: 1299.96 * 6 = ₹7,799.76 (Matches HostHeaven calculate-renewal API!)
      expect(calculateProviderCost(0.6251, 0.7264, 0.2724, 0.1816, 180)).toBe(7799.76);

      // 365 days: 1299.96 * 12 = ₹15,599.52 (Matches HostHeaven calculate-renewal API!)
      expect(calculateProviderCost(0.6251, 0.7264, 0.2724, 0.1816, 365)).toBe(15599.52);
    });

    it('rejects unsupported durations in calculateProviderCost', () => {
      expect(() => calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 60)).toThrow(
        'Unsupported duration: 60 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
      expect(() => calculateProviderCost(0.1, 0.1954, 0.2, 0.4, 45)).toThrow(
        'Unsupported duration: 45 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
    });

    it('rejects negative, null, undefined, or NaN resource prices in calculateProviderCost', () => {
      expect(() => calculateProviderCost(-0.1, 0.1954, 0.2, 0.4, 30)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => calculateProviderCost(0.1, -0.1954, 0.2, 0.4, 30)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => calculateProviderCost(0.1, 0.1954, -0.2, 0.4, 30)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => calculateProviderCost(0.1, 0.1954, 0.2, -0.4, 30)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => calculateProviderCost(null as any, 0.1954, 0.2, 0.4, 30)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => calculateProviderCost(0.1, undefined as any, 0.2, 0.4, 30)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => calculateProviderCost(NaN, 0.1954, 0.2, 0.4, 30)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => calculateProviderCost(0.1, 'invalid', 0.2, 0.4, 30)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
    });
  });

  describe('calculatePricingBreakdown — Exact Parity with calculateProviderCost', () => {
    it('produces complete pricing breakdown with original rates, monthly cost, selling price and gross profit', () => {
      const breakdown = calculatePricingBreakdown(0.1, 0.1954, 0.2, 0.4, 30, 20);

      expect(breakdown.billingUnit).toBe('INR_PER_HOUR');
      expect(breakdown.rates.cpu).toBe(0.1);
      expect(breakdown.rates.ram).toBe(0.1954);
      expect(breakdown.rates.disk).toBe(0.2);
      expect(breakdown.rates.bandwidth).toBe(0.4);
      expect(breakdown.totalHourlyRate).toBe(0.8954);
      expect(breakdown.hoursPerMonth).toBe(720);
      expect(breakdown.monthlyProviderCost).toBe(644.69);
      expect(breakdown.totalProviderCost).toBe(644.69);
      expect(breakdown.profitMarginPercent).toBe(20);
      expect(breakdown.customerSellingPrice).toBe(805.86);
      expect(breakdown.grossProfit).toBe(161.17);
      expect(breakdown.formula).toContain('0.8954 ₹/hr × 720 hrs/mo');
    });

    it('maintains exact parity with calculateProviderCost across 30, 90, 180, and 365 days', () => {
      const cpu = 0.6251;
      const ram = 0.7264;
      const disk = 0.2724;
      const bw = 0.1816;

      for (const days of [30, 90, 180, 365]) {
        const directCost = calculateProviderCost(cpu, ram, disk, bw, days);
        const breakdown = calculatePricingBreakdown(cpu, ram, disk, bw, days, 20);

        expect(breakdown.totalProviderCost).toBe(directCost);
        expect(breakdown.monthlyProviderCost).toBe(1299.96);
        expect(breakdown.durationDays).toBe(days);
        expect(breakdown.durationMonths).toBe(calculateDurationMonths(days));
      }
    });

    it('rejects unsupported durations in calculatePricingBreakdown', () => {
      expect(() => calculatePricingBreakdown(0.1, 0.1954, 0.2, 0.4, 60, 20)).toThrow(
        'Unsupported duration: 60 days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.',
      );
    });

    it('rejects invalid rate inputs in calculatePricingBreakdown', () => {
      expect(() => calculatePricingBreakdown(null as any, 0.1954, 0.2, 0.4, 30, 20)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
      expect(() => calculatePricingBreakdown(-0.1, 0.1954, 0.2, 0.4, 30, 20)).toThrow(
        'Resource prices must be valid, finite, non-negative decimal values',
      );
    });
  });

  describe('calculateSellingPrice — 20% Gross Profit Margin Rule', () => {
    it('calculates 20% gross profit margin according to sellingPrice = providerCost / (1 - 0.20)', () => {
      // Examples:
      // Provider cost ₹1,000 → Customer price ₹1,250
      expect(calculateSellingPrice(1000, 20)).toBe(1250);

      // Provider cost ₹2,000 → Customer price ₹2,500
      expect(calculateSellingPrice(2000, 20)).toBe(2500);

      // Provider cost ₹4,000 → Customer price ₹5,000
      expect(calculateSellingPrice(4000, 20)).toBe(5000);
    });

    it('calculates exact selling price for Shared VPS provider cost (₹644.69 -> ₹805.86)', () => {
      // 644.69 / 0.80 = 805.8625 -> ₹805.86
      expect(calculateSellingPrice(644.69, 20)).toBe(805.86);
    });

    it('calculates exact selling price for Dedicated VPS provider cost (₹1,299.96 -> ₹1,624.95)', () => {
      // 1299.96 / 0.80 = 1624.95
      expect(calculateSellingPrice(1299.96, 20)).toBe(1624.95);
    });

    it('calculates exact selling price for Slot IP 1 GB provider cost (₹350.00 -> ₹437.50)', () => {
      // 350 / 0.80 = 437.50
      expect(calculateSellingPrice(350, 20)).toBe(437.5);
    });

    it('rounds customer prices to 2 decimal places in INR', () => {
      expect(calculateSellingPrice(333.33, 20)).toBe(416.66);
      expect(calculateSellingPrice(777.77, 20)).toBe(972.21);
      expect(calculateSellingPrice(1234.56, 20)).toBe(1543.2);
    });

    it('supports custom margin values between 0% and 80%', () => {
      expect(calculateSellingPrice(1000, 0)).toBe(1000);
      expect(calculateSellingPrice(1000, 10)).toBe(1111.11);
      expect(calculateSellingPrice(1000, 50)).toBe(2000);
      expect(calculateSellingPrice(1000, 80)).toBe(5000);
    });

    it('returns 0 for zero provider cost', () => {
      expect(calculateSellingPrice(0, 20)).toBe(0);
      expect(calculateSellingPrice('0', 20)).toBe(0);
    });

    it('rejects margins outside 0% to 80%', () => {
      expect(() => calculateSellingPrice(1000, -1)).toThrow('Profit margin must be between 0% and 80%');
      expect(() => calculateSellingPrice(1000, 81)).toThrow('Profit margin must be between 0% and 80%');
      expect(() => calculateSellingPrice(1000, NaN)).toThrow('Profit margin must be between 0% and 80%');
      expect(() => calculateSellingPrice(1000, Infinity)).toThrow('Profit margin must be between 0% and 80%');
    });

    it('rejects invalid or negative provider costs', () => {
      expect(() => calculateSellingPrice(-100, 20)).toThrow('Provider cost must be a non-negative number');
      expect(() => calculateSellingPrice(NaN, 20)).toThrow('Provider cost must be a non-negative number');
      expect(() => calculateSellingPrice(Infinity, 20)).toThrow('Provider cost must be a non-negative number');
      expect(() => calculateSellingPrice(null as any, 20)).toThrow('Provider cost must be a non-negative number');
      expect(() => calculateSellingPrice(undefined as any, 20)).toThrow('Provider cost must be a non-negative number');
      expect(() => calculateSellingPrice('invalid', 20)).toThrow('Provider cost must be a non-negative number');
    });
  });

  describe('Legacy Markup <-> Profit Margin Equivalences', () => {
    it('verifies that 25% markup is mathematically equivalent to 20% gross profit margin', () => {
      const cost = 1000;
      const priceViaMarkup = cost * (1 + 25 / 100);
      const priceViaMargin = calculateSellingPrice(cost, 20);

      expect(priceViaMarkup).toBe(priceViaMargin);
      expect(priceViaMargin).toBe(1250);
    });

    it('converts profit margin to equivalent markup correctly', () => {
      expect(profitMarginToMarkup(20)).toBe(25);
      expect(profitMarginToMarkup(0)).toBe(0);
      expect(profitMarginToMarkup(50)).toBe(100);
    });

    it('converts markup to equivalent profit margin correctly', () => {
      expect(markupToProfitMargin(25)).toBe(20);
      expect(markupToProfitMargin(0)).toBe(0);
      expect(markupToProfitMargin(100)).toBe(50);
    });

    it('rejects invalid margins or markups', () => {
      expect(() => profitMarginToMarkup(-5)).toThrow('Profit margin must be between 0% and 99.9%');
      expect(() => profitMarginToMarkup(100)).toThrow('Profit margin must be between 0% and 99.9%');
      expect(() => markupToProfitMargin(-1)).toThrow('Markup must be non-negative');
    });
  });

  describe('Slot IP Isolation & assertNotMixedPricing', () => {
    it('accurately identifies Slot IP items by name or label', () => {
      expect(isSlotIpItem({ label: 'Slot IP CPU' })).toBe(true);
      expect(isSlotIpItem({ name: 'Slot IP 1 GB' })).toBe(true);
      expect(isSlotIpItem({ label: 'Slot IP 20 GB' })).toBe(true);
      expect(isSlotIpItem({ name: 'Slot IP 2 TB' })).toBe(true);
      expect(isSlotIpItem({ label: 'slot ip ram' })).toBe(true);
      expect(isSlotIpItem({ label: '2 Core' })).toBe(false);
      expect(isSlotIpItem({ label: '4 GB' })).toBe(false);
      expect(isSlotIpItem({ name: '20 GB NVME' })).toBe(false);
      expect(isSlotIpItem({ label: '2 TB' })).toBe(false);
      expect(isSlotIpItem(null)).toBe(false);
      expect(isSlotIpItem(undefined)).toBe(false);
    });

    it('passes validation when all selected resources are Pure Standard', () => {
      expect(() =>
        assertNotMixedPricing(
          { label: '2 Core' },
          { label: '4 GB' },
          { label: '20 GB NVME' },
          { label: '2 TB' },
        ),
      ).not.toThrow();
    });

    it('passes validation when all selected resources are Pure Slot IP', () => {
      expect(() =>
        assertNotMixedPricing(
          { label: 'Slot IP CPU' },
          { label: 'Slot IP 1 GB' },
          { label: 'Slot IP 20 GB' },
          { label: 'Slot IP 2 TB' },
        ),
      ).not.toThrow();
    });

    it('strictly throws BadRequestException when mixing Standard CPU with Slot IP RAM (the ₹1,067.49 culprit)', () => {
      expect(() =>
        assertNotMixedPricing(
          { label: '2 Core' },
          { label: 'Slot IP 1 GB' },
          { label: '20 GB NVME' },
          { label: '2 TB' },
        ),
      ).toThrow(BadRequestException);
    });

    it('strictly throws BadRequestException when mixing Slot IP CPU with Standard RAM (the ₹715.86 culprit)', () => {
      expect(() =>
        assertNotMixedPricing(
          { label: 'Slot IP CPU' },
          { label: '4 GB' },
          { label: '20 GB NVME' },
          { label: '2 TB' },
        ),
      ).toThrow(BadRequestException);
    });

    it('strictly throws BadRequestException when mixing Slot IP RAM with Standard Disk & Bandwidth (the ₹977.49 culprit)', () => {
      expect(() =>
        assertNotMixedPricing(
          { label: 'Slot IP CPU' },
          { label: 'Slot IP 1 GB' },
          { label: '20 GB NVME' },
          { label: '2 TB' },
        ),
      ).toThrow(BadRequestException);
    });
  });
});
