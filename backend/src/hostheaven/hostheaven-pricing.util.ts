import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Standard billing hours per 30-day month in HostHeaven hosting.
 * 30 days * 24 hours = 720 hours.
 * Verified against live HostHeaven production orders and renewal calculation API.
 */
export const HOURS_PER_MONTH = 720;

/**
 * Verified HostHeaven subscription durations mapped to whole billing months:
 * - 30 days -> 1 month
 * - 90 days -> 3 months
 * - 180 days -> 6 months
 * - 365 days -> 12 months
 *
 * Upstream provider confirms HostHeaven's billing engine operates strictly on monthly increments
 * (monthsToAdd: 1, 3, 6, 12). Annual subscriptions (365 days) are billed as 12 calendar months (720 hrs * 12 = 8,640 hrs).
 */
export const VERIFIED_HOSTHEAVEN_DURATIONS: Readonly<Record<number, number>> = Object.freeze({
  30: 1,
  90: 3,
  180: 6,
  365: 12,
});

export type HostHeavenPricingSource = 'AUTHORITATIVE_MONTHLY' | 'CALCULATED_HOURLY';
export type HostHeavenBillingUnit = 'INR_PER_MONTH' | 'INR_PER_HOUR';

/**
 * Checks whether a pricing catalogue item belongs to the Slot IP resource family.
 * Slot IP resources are bundled entries (e.g. "Slot IP CPU", "Slot IP 1 GB", "Slot IP 20 GB", "Slot IP 2 TB")
 * and must NEVER be mixed with standard cloud resources.
 */
export function isSlotIpItem(
  item: { label?: string; name?: string } | null | undefined,
): boolean {
  if (!item) return false;
  const label = ((item.label || item.name || '') + '').toLowerCase();
  return label.includes('slot ip') || label.includes('slot');
}

/**
 * Validates that resource selections are not mixed between Standard and Slot IP.
 * Throws BadRequestException if any mixing is detected.
 */
export function assertNotMixedPricing(
  cpu: { label?: string; name?: string } | null | undefined,
  ram: { label?: string; name?: string } | null | undefined,
  disk: { label?: string; name?: string } | null | undefined,
  bw: { label?: string; name?: string } | null | undefined,
): void {
  const isCpuSlot = isSlotIpItem(cpu);
  const isRamSlot = isSlotIpItem(ram);
  const isDiskSlot = isSlotIpItem(disk);
  const isBwSlot = isSlotIpItem(bw);

  if (isCpuSlot || isRamSlot || isDiskSlot || isBwSlot) {
    if (!(isCpuSlot && isRamSlot && isDiskSlot && isBwSlot)) {
      throw new BadRequestException(
        'Invalid pricing combination: Standard and Slot IP resources cannot be mixed. All selected resources must be either standard or Slot IP.',
      );
    }
  }
}

export interface HostHeavenResourceRates {
  cpu: number;
  ram: number;
  disk: number;
  bandwidth: number;
}

export interface HostHeavenPricingBreakdown {
  pricingSource: HostHeavenPricingSource;
  billingUnit: HostHeavenBillingUnit;
  rates?: HostHeavenResourceRates;
  totalHourlyRate?: number;
  hoursPerMonth?: number;
  durationDays: number;
  durationMonths: number;
  monthlyProviderCost: number;
  totalProviderCost: number;
  profitMarginPercent: number;
  customerSellingPrice: number;
  grossProfit: number;
  formula: string;
}

/**
 * Validates and converts an input resource rate into a valid, finite, non-negative Prisma.Decimal.
 * Rejects null, undefined, NaN, Infinity, negative values, and non-numeric strings.
 * Does NOT silently convert invalid inputs to zero.
 */
export function validateResourceRate(
  val: number | string | Prisma.Decimal | null | undefined,
  resourceName: string = 'Resource',
): Prisma.Decimal {
  if (val === null || val === undefined) {
    throw new BadRequestException(
      `${resourceName} prices must be valid, finite, non-negative decimal values`,
    );
  }

  let dec: Prisma.Decimal;
  try {
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        throw new BadRequestException(
          `${resourceName} prices must be valid, finite, non-negative decimal values`,
        );
      }
      dec = new Prisma.Decimal(val);
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed || isNaN(Number(trimmed))) {
        throw new BadRequestException(
          `${resourceName} prices must be valid, finite, non-negative decimal values`,
        );
      }
      dec = new Prisma.Decimal(trimmed);
    } else if (val instanceof Prisma.Decimal) {
      if (val.isNaN() || !val.isFinite()) {
        throw new BadRequestException(
          `${resourceName} prices must be valid, finite, non-negative decimal values`,
        );
      }
      dec = val;
    } else {
      throw new BadRequestException(
        `${resourceName} prices must be valid, finite, non-negative decimal values`,
      );
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException(
      `${resourceName} prices must be valid, finite, non-negative decimal values`,
    );
  }

  if (dec.isNaN() || dec.isNegative()) {
    throw new BadRequestException(
      `${resourceName} prices must be valid, finite, non-negative decimal values`,
    );
  }

  return dec;
}

/**
 * Maps plan duration in days to whole billing months according to verified provider billing rules:
 * - 30 days -> 1 month
 * - 90 days -> 3 months
 * - 180 days -> 6 months
 * - 365 days -> 12 months
 *
 * Removes silent rounding of unsupported durations. Rejects any duration other than
 * 30, 90, 180, and 365 days with a BadRequestException.
 */
export function calculateDurationMonths(durationDays: number): number {
  if (typeof durationDays !== 'number' || !Number.isFinite(durationDays)) {
    throw new BadRequestException(
      `Plan duration must be a valid finite number of days. Received: ${durationDays}`,
    );
  }

  const months = VERIFIED_HOSTHEAVEN_DURATIONS[durationDays];
  if (months !== undefined) {
    return months;
  }

  throw new BadRequestException(
    `Unsupported duration: ${durationDays} days. HostHeaven only supports verified durations of 30, 90, 180, and 365 days.`,
  );
}

/**
 * Calculates customer selling price based on gross profit margin on provider cost.
 *
 * Formula:
 * sellingPrice = providerCost / (1 - marginDecimal)
 * where marginDecimal = profitMarginPercent / 100
 *
 * Examples:
 * - Provider cost ₹100 with 20% margin: 100 / (1 - 0.20) = ₹125.00
 * - Provider cost ₹500 with 20% margin: 500 / (1 - 0.20) = ₹625.00
 * - Provider cost ₹644.69 with 20% margin: 644.69 / (1 - 0.20) = ₹805.86
 * - Provider cost ₹1,000 with 20% margin: 1000 / (1 - 0.20) = ₹1,250.00
 * - Provider cost ₹2,000 with 20% margin: 2000 / (1 - 0.20) = ₹2,500.00
 *
 * @param providerCost Provider cost in INR
 * @param profitMarginPercent Gross profit margin percentage (0 to 80)
 * @returns Final selling price in INR rounded to 2 decimal places using Prisma.Decimal ROUND_HALF_UP
 */
export function calculateSellingPrice(
  providerCost: number | string | Prisma.Decimal,
  profitMarginPercent: number = 20,
): number {
  if (providerCost === null || providerCost === undefined) {
    throw new BadRequestException('Provider cost must be a non-negative number');
  }

  let cost: Prisma.Decimal;
  try {
    if (typeof providerCost === 'number') {
      if (!Number.isFinite(providerCost)) {
        throw new BadRequestException('Provider cost must be a non-negative number');
      }
      cost = new Prisma.Decimal(providerCost);
    } else if (typeof providerCost === 'string') {
      const trimmed = providerCost.trim();
      if (!trimmed || isNaN(Number(trimmed))) {
        throw new BadRequestException('Provider cost must be a non-negative number');
      }
      cost = new Prisma.Decimal(trimmed);
    } else if (providerCost instanceof Prisma.Decimal) {
      if (providerCost.isNaN() || !providerCost.isFinite()) {
        throw new BadRequestException('Provider cost must be a non-negative number');
      }
      cost = providerCost;
    } else {
      throw new BadRequestException('Provider cost must be a non-negative number');
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('Provider cost must be a non-negative number');
  }

  if (cost.isNaN() || cost.isNegative()) {
    throw new BadRequestException('Provider cost must be a non-negative number');
  }

  if (
    typeof profitMarginPercent !== 'number' ||
    !Number.isFinite(profitMarginPercent) ||
    profitMarginPercent < 0 ||
    profitMarginPercent > 80
  ) {
    throw new BadRequestException('Profit margin must be between 0% and 80%');
  }

  if (cost.isZero()) {
    return 0;
  }

  const marginDec = new Prisma.Decimal(profitMarginPercent).dividedBy(100);
  const divisor = new Prisma.Decimal(1).minus(marginDec);
  const rawSellingPrice = cost.dividedBy(divisor);

  // Round to 2 decimal places half-up
  return rawSellingPrice.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Calculates provider cost for HostHeaven resources across duration using verified billing units.
 *
 * Case B: HostHeaven returns HOURLY resource rates (CPU, RAM, Disk, Bandwidth).
 * Standard monthly billing cycle = 720 hours (30 days * 24 hours).
 *
 * Total hourly rate = cpuRate + ramRate + diskRate + bandwidthRate
 * Monthly provider cost = round(totalHourlyRate * 720, 2)
 * Total provider cost = round(monthlyProviderCost * durationMonths, 2)
 *
 * Verified against HostHeaven live production orders and /api/billing/price/calculate-renewal:
 * - Shared (0.1 + 0.1954 + 0.2 + 0.4) = 0.8954 * 720 = ₹644.69
 * - Dedicated (0.6251 + 0.7264 + 0.2724 + 0.1816) = 1.8055 * 720 = ₹1,299.96
 *
 * @param cpuPrice Hourly CPU rate in INR
 * @param ramPrice Hourly RAM rate in INR
 * @param diskPrice Hourly Disk rate in INR
 * @param bandwidthPrice Hourly Bandwidth rate in INR
 * @param durationDays Plan duration in days (default: 30)
 * @returns Total provider cost rounded to 2 decimal places
 */
export function calculateProviderCost(
  cpuPrice: number | string | Prisma.Decimal,
  ramPrice: number | string | Prisma.Decimal,
  diskPrice: number | string | Prisma.Decimal,
  bandwidthPrice: number | string | Prisma.Decimal,
  durationDays: number = 30,
): number {
  const c = validateResourceRate(cpuPrice, 'Resource');
  const r = validateResourceRate(ramPrice, 'Resource');
  const d = validateResourceRate(diskPrice, 'Resource');
  const b = validateResourceRate(bandwidthPrice, 'Resource');

  const durationMonths = calculateDurationMonths(durationDays);
  const hourlyRate = c.plus(r).plus(d).plus(b);

  // Monthly cost rounded to 2 decimal places using ROUND_HALF_UP
  const monthlyCost = hourlyRate
    .times(HOURS_PER_MONTH)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const totalCost = monthlyCost
    .times(durationMonths)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return totalCost.toNumber();
}

/**
 * Case A: HostHeaven returns an authoritative monthly price directly.
 * Uses that actual monthly price directly without multiplying by 720 again.
 *
 * @param monthlyProviderPrice Authoritative monthly provider price in INR
 * @param durationDays Plan duration in days (default: 30)
 * @param profitMarginPercent Gross profit margin percentage (default: 20)
 */
export function calculateAuthoritativeMonthlyBreakdown(
  monthlyProviderPrice: number | string | Prisma.Decimal,
  durationDays: number = 30,
  profitMarginPercent: number = 20,
): HostHeavenPricingBreakdown {
  const monthlyDec = validateResourceRate(monthlyProviderPrice, 'Monthly provider');
  const durationMonths = calculateDurationMonths(durationDays);

  const monthlyProviderCost = monthlyDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  const totalProviderCostDec = monthlyDec
    .times(durationMonths)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const totalProviderCost = totalProviderCostDec.toNumber();
  const customerSellingPrice = calculateSellingPrice(totalProviderCost, profitMarginPercent);
  const grossProfit = new Prisma.Decimal(customerSellingPrice)
    .minus(totalProviderCostDec)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();

  const formula = `Authoritative monthly provider price = ₹${monthlyProviderCost.toFixed(2)}/mo × ${durationMonths} mo = ₹${totalProviderCost.toFixed(2)}`;

  return {
    pricingSource: 'AUTHORITATIVE_MONTHLY',
    billingUnit: 'INR_PER_MONTH',
    durationDays,
    durationMonths,
    monthlyProviderCost,
    totalProviderCost,
    profitMarginPercent,
    customerSellingPrice,
    grossProfit,
    formula,
  };
}

/**
 * Case B: Calculates complete pricing breakdown from hourly resource rates.
 * Total hourly rate = cpuRate + ramRate + diskRate + bandwidthRate
 * Monthly provider cost = round(totalHourlyRate * 720, 2)
 *
 * @param cpuPrice Hourly CPU rate in INR
 * @param ramPrice Hourly RAM rate in INR
 * @param diskPrice Hourly Disk rate in INR
 * @param bandwidthPrice Hourly Bandwidth rate in INR
 * @param durationDays Plan duration in days (default: 30)
 * @param profitMarginPercent Gross profit margin percentage (default: 20)
 */
export function calculatePricingBreakdown(
  cpuPrice: number | string | Prisma.Decimal,
  ramPrice: number | string | Prisma.Decimal,
  diskPrice: number | string | Prisma.Decimal,
  bandwidthPrice: number | string | Prisma.Decimal,
  durationDays: number = 30,
  profitMarginPercent: number = 20,
): HostHeavenPricingBreakdown {
  const c = validateResourceRate(cpuPrice, 'Resource');
  const r = validateResourceRate(ramPrice, 'Resource');
  const d = validateResourceRate(diskPrice, 'Resource');
  const b = validateResourceRate(bandwidthPrice, 'Resource');

  const durationMonths = calculateDurationMonths(durationDays);
  const hourlyRate = c.plus(r).plus(d).plus(b);

  const monthlyCostDec = hourlyRate
    .times(HOURS_PER_MONTH)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const totalProviderCostDec = monthlyCostDec
    .times(durationMonths)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const totalProviderCost = totalProviderCostDec.toNumber();
  const monthlyProviderCost = monthlyCostDec.toNumber();
  const customerSellingPrice = calculateSellingPrice(totalProviderCost, profitMarginPercent);
  const grossProfit = new Prisma.Decimal(customerSellingPrice)
    .minus(totalProviderCostDec)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();

  const formula = `(${c.toString()} + ${r.toString()} + ${d.toString()} + ${b.toString()}) ₹/hr = ${hourlyRate.toString()} ₹/hr × ${HOURS_PER_MONTH} hrs/mo = ₹${monthlyProviderCost.toFixed(2)}/mo × ${durationMonths} mo = ₹${totalProviderCost.toFixed(2)}`;

  return {
    pricingSource: 'CALCULATED_HOURLY',
    billingUnit: 'INR_PER_HOUR',
    rates: {
      cpu: c.toNumber(),
      ram: r.toNumber(),
      disk: d.toNumber(),
      bandwidth: b.toNumber(),
    },
    totalHourlyRate: hourlyRate.toNumber(),
    hoursPerMonth: HOURS_PER_MONTH,
    durationDays,
    durationMonths,
    monthlyProviderCost,
    totalProviderCost,
    profitMarginPercent,
    customerSellingPrice,
    grossProfit,
    formula,
  };
}

/**
 * Unified pricing calculator supporting both Case A (direct monthly price) and Case B (hourly rates).
 */
export function calculateUnifiedPricingBreakdown(params: {
  monthlyPrice?: number | string | Prisma.Decimal | null;
  cpuPrice?: number | string | Prisma.Decimal | null;
  ramPrice?: number | string | Prisma.Decimal | null;
  diskPrice?: number | string | Prisma.Decimal | null;
  bandwidthPrice?: number | string | Prisma.Decimal | null;
  durationDays?: number;
  profitMarginPercent?: number;
}): HostHeavenPricingBreakdown {
  if (params.monthlyPrice !== undefined && params.monthlyPrice !== null) {
    return calculateAuthoritativeMonthlyBreakdown(
      params.monthlyPrice,
      params.durationDays || 30,
      params.profitMarginPercent ?? 20,
    );
  }

  return calculatePricingBreakdown(
    params.cpuPrice ?? 0,
    params.ramPrice ?? 0,
    params.diskPrice ?? 0,
    params.bandwidthPrice ?? 0,
    params.durationDays || 30,
    params.profitMarginPercent ?? 20,
  );
}

/**
 * Converts gross profit margin percentage to equivalent markup percentage.
 * M = (P / (100 - P)) * 100
 * Example: 20% margin -> (20 / 80) * 100 = 25% markup
 */
export function profitMarginToMarkup(profitMarginPercent: number): number {
  if (
    typeof profitMarginPercent !== 'number' ||
    !Number.isFinite(profitMarginPercent) ||
    profitMarginPercent < 0 ||
    profitMarginPercent >= 100
  ) {
    throw new BadRequestException('Profit margin must be between 0% and 99.9%');
  }
  const marginDec = new Prisma.Decimal(profitMarginPercent);
  const markup = marginDec.dividedBy(new Prisma.Decimal(100).minus(marginDec)).times(100);
  return markup.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Converts markup percentage to equivalent gross profit margin percentage.
 * P = (M / (100 + M)) * 100
 * Example: 25% markup -> (25 / 125) * 100 = 20% margin
 */
export function markupToProfitMargin(markupPercent: number): number {
  if (
    typeof markupPercent !== 'number' ||
    !Number.isFinite(markupPercent) ||
    markupPercent < 0
  ) {
    throw new BadRequestException('Markup must be non-negative');
  }
  const markupDec = new Prisma.Decimal(markupPercent);
  const margin = markupDec.dividedBy(new Prisma.Decimal(100).plus(markupDec)).times(100);
  return margin.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
