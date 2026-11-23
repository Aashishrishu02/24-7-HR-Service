import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_BASE_URL =
  'https://nexahostvps.com/api/v1/dedicated-ips';

@Injectable()
export class NexaVpsService {
  constructor(private readonly configService: ConfigService) {}

  async testConnection(baseUrl?: string) {
    const apiKey = this.configService.get<string>('NEXAVPS_API_KEY');

    if (!apiKey?.trim()) {
      return {
        success: false,
        connected: false,
        message: 'Nexa VPS API key is not configured in backend environment.',
      };
    }

    try {
      const url = new URL(
        baseUrl || this.configService.get<string>('NEXAVPS_BASE_URL') || DEFAULT_BASE_URL,
      );

      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'nexahostvps.com' ||
        url.port !== '' ||
        url.username !== '' ||
        url.password !== ''
      ) {
        return {
          success: false,
          connected: false,
          message: 'Nexa VPS URL must use the official HTTPS API host.',
        };
      }

      url.searchParams.set('action', 'plans');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          success: false,
          connected: false,
          message: `Nexa VPS plans request failed with HTTP ${response.status}.`,
        };
      }

      const result: unknown = await response.json();
      let plansCount: number | undefined;

      if (Array.isArray(result)) {
        plansCount = result.length;
      } else if (result && typeof result === 'object') {
        const data = result as Record<string, unknown>;
        if (Array.isArray(data.plans)) {
          plansCount = data.plans.length;
        } else if (Array.isArray(data.data)) {
          plansCount = data.data.length;
        } else if (
          data.data &&
          typeof data.data === 'object' &&
          Array.isArray((data.data as Record<string, unknown>).plans)
        ) {
          plansCount = ((data.data as Record<string, unknown>).plans as unknown[]).length;
        }
      }

      return {
        success: true,
        connected: true,
        message: 'Nexa VPS plans endpoint connection verified successfully.',
        ...(plansCount === undefined ? {} : { plansCount }),
      };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        return {
          success: false,
          connected: false,
          message: 'Nexa VPS request failed. Check the configured provider URL.',
        };
      }

      if (error instanceof Error && error.name === 'TimeoutError') {
        return {
          success: false,
          connected: false,
          message: 'Nexa VPS request timed out.',
        };
      }

      if (error instanceof SyntaxError) {
        return {
          success: false,
          connected: false,
          message: 'Nexa VPS returned an invalid JSON response.',
        };
      }

      throw new ServiceUnavailableException(
        'Unable to complete the Nexa VPS read-only plans request.',
      );
    }
  }

  async getPlans(baseUrl?: string) {
    const apiKey = this.configService.get<string>('NEXAVPS_API_KEY');

    if (!apiKey?.trim()) {
      return { success: false, message: 'Nexa VPS API key is not configured.', plans: [] };
    }

    try {
      const url = new URL(
        baseUrl || this.configService.get<string>('NEXAVPS_BASE_URL') || DEFAULT_BASE_URL,
      );

      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'nexahostvps.com' ||
        url.port !== '' ||
        url.username !== '' ||
        url.password !== ''
      ) {
        return { success: false, message: 'Nexa VPS URL must use the official HTTPS API host.', plans: [] };
      }

      url.searchParams.set('action', 'plans');

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Nexa VPS plans request failed with HTTP ${response.status}.`,
          plans: [],
        };
      }

      const result: unknown = await response.json();
      const root = result && typeof result === 'object'
        ? result as Record<string, unknown>
        : {};
      const nested = root.data && typeof root.data === 'object'
        ? root.data as Record<string, unknown>
        : {};

      const rawPlans = Array.isArray(result)
        ? result
        : Array.isArray(root.plans)
          ? root.plans
          : Array.isArray(root.data)
            ? root.data
            : Array.isArray(nested.plans)
              ? nested.plans
              : [];

      const plans = rawPlans
        .filter((item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
        .map((plan) => ({
          planId: plan.plan_id ?? plan.id ?? null,
          planName: plan.plan_name ?? plan.name ?? 'Unnamed plan',
          categoryId: plan.category_id ?? null,
          categoryName: plan.category_name ?? null,
          tier: plan.tier ?? null,
          tierLabel: plan.tier_label ?? null,
          controlMode: plan.control_mode ?? null,
          protocol: plan.protocol ?? null,
          supportedProtocols: Array.isArray(plan.supported_protocols) ? plan.supported_protocols : [],
          countryCode: plan.country_code ?? null,
          countryName: plan.country_name ?? null,
          location: plan.location ?? null,
          duration: plan.duration ?? null,
          speed: plan.speed ?? null,
          minQuantity: plan.min_quantity ?? null,
          regularPrice: plan.regular_price ?? null,
          apiPrice: plan.api_price ?? null,
          currency: plan.currency ?? 'INR',
          inStock: plan.in_stock ?? false,
          stock: plan.stock ?? null,
          defaultSubnet: plan.default_subnet ?? null,
          poolsCount: plan.pools_count ?? 0,
          pools: Array.isArray(plan.pools)
            ? plan.pools.filter((pool) => pool && typeof pool === 'object').map((pool: any) => ({
                poolId: pool.pool_id ?? null,
                poolName: pool.pool_name ?? null,
                subnet: pool.subnet ?? null,
                location: pool.location ?? null,
                regularPrice: pool.regular_price ?? null,
                apiPrice: pool.api_price ?? null,
                currency: pool.currency ?? plan.currency ?? 'INR',
                inStock: pool.in_stock ?? false,
                stock: pool.stock ?? null,
                isDefault: pool.is_default ?? false,
              }))
            : [],
        }));

      return { success: true, plans, totalPlans: plans.length };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { success: false, message: 'Nexa VPS plans request timed out.', plans: [] };
      }
      return { success: false, message: 'Unable to complete the Nexa VPS read-only plans request.', plans: [] };
    }
  }

  async getBalance(baseUrl?: string) {
    const apiKey = this.configService.get<string>('NEXAVPS_API_KEY');

    if (!apiKey?.trim()) {
      return {
        success: false,
        message: 'Nexa VPS API key is not configured.',
      };
    }

    try {
      const url = new URL(
        baseUrl || this.configService.get<string>('NEXAVPS_BASE_URL') || DEFAULT_BASE_URL,
      );

      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'nexahostvps.com' ||
        url.port !== '' ||
        url.username !== '' ||
        url.password !== ''
      ) {
        return {
          success: false,
          message: 'Nexa VPS URL must use the official HTTPS API host.',
        };
      }

      url.searchParams.set('action', 'balance');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Nexa VPS balance request failed with HTTP ${response.status}.`,
        };
      }

      const balance = await response.json();

      return {
        success: true,
        balance,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {
          success: false,
          message: 'Nexa VPS returned an invalid JSON balance response.',
        };
      }

      if (error instanceof Error && error.name === 'TimeoutError') {
        return {
          success: false,
          message: 'Nexa VPS balance request timed out.',
        };
      }

      return {
        success: false,
        message: 'Unable to complete the Nexa VPS read-only balance request.',
      };
    }
  }

}
