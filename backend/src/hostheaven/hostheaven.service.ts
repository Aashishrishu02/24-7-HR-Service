import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  HostHeavenZone,
  HostHeavenIso,
  HostHeavenPricingItem,
  HostHeavenCompletePricing,
  HostHeavenWallet,
  HostHeavenCreateVmDto,
  HostHeavenCreateVmResponse,
  HostHeavenVmDetails,
  HostHeavenLockStatus,
  HostHeavenVmMetrics,
  HostHeavenStorageInfo,
  HostHeavenRenewalCalcDto,
  HostHeavenRenewalCalcResult,
  HostHeavenConnectionTestResult,
} from './hostheaven.types.js';

interface CachedAuth {
  token: string;
  expiresAt: number;
}

@Injectable()
export class HostHeavenService {
  private readonly logger = new Logger(HostHeavenService.name);
  private cachedAuth: CachedAuth | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolves HostHeaven configuration strictly from backend environment variables
   */
  async getConfig() {
    const baseUrl = this.configService.get<string>('HOSTHEAVEN_BASE_URL');
    const email = this.configService.get<string>('HOSTHEAVEN_EMAIL');
    const password = this.configService.get<string>('HOSTHEAVEN_PASSWORD');
    const apiToken = this.configService.get<string>('HOSTHEAVEN_API_TOKEN');
    const resellerDomain = this.configService.get<string>(
      'HOSTHEAVEN_RESELLER_DOMAIN',
    );

    const sanitizedBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://backend.hostheaven.in';
    const domain = resellerDomain || '247hrservice.com';

    const hasRealCredentials = Boolean(
      apiToken || (email && password),
    );

    return {
      baseUrl: sanitizedBaseUrl,
      email,
      password,
      apiToken,
      resellerDomain: domain,
      hasRealCredentials,
    };
  }

  /**
   * Obtains a valid JWT Bearer token using /api/login or returns cached token
   */
  async getBearerToken(): Promise<string> {
    const config = await this.getConfig();

    if (!config.hasRealCredentials) {
      throw new UnauthorizedException(
        'HostHeaven credentials not configured. Please supply email/password or API token.',
      );
    }

    if (config.apiToken) {
      return config.apiToken;
    }

    const now = Date.now();
    if (this.cachedAuth && this.cachedAuth.expiresAt > now + 60_000) {
      return this.cachedAuth.token;
    }

    if (!config.email || !config.password) {
      throw new UnauthorizedException(
        'HostHeaven email and password are required for authentication',
      );
    }

    try {
      const response = await fetch(`${config.baseUrl}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reseller-Domain': config.resellerDomain,
        },
        body: JSON.stringify({
          email: config.email,
          password: config.password,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new UnauthorizedException(
          `HostHeaven login failed with HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as {
        token?: string;
        expiresIn?: number;
      };

      if (!data.token) {
        throw new UnauthorizedException(
          'HostHeaven login response did not include a JWT token',
        );
      }

      // Default cache 55 minutes unless expiresIn is provided
      const ttlMs = data.expiresIn ? data.expiresIn * 1000 : 55 * 60 * 1000;
      this.cachedAuth = {
        token: data.token,
        expiresAt: now + ttlMs,
      };

      return data.token;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Unable to reach HostHeaven authentication service',
      );
    }
  }

  /**
   * Internal HTTP execution wrapper with headers and token retry
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      retryOn401?: boolean;
    } = {},
  ): Promise<T> {
    const config = await this.getConfig();
    const method = options.method || 'GET';
    const retryOn401 = options.retryOn401 ?? true;

    const token = await this.getBearerToken();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${config.baseUrl}${cleanEndpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Reseller-Domain': config.resellerDomain,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(20_000),
      });

      if (response.status === 401 && retryOn401 && !config.apiToken) {
        this.cachedAuth = null;
        return this.request<T>(endpoint, { ...options, retryOn401: false });
      }

      const text = await response.text();

      if (!response.ok) {
        let errorMsg = `HostHeaven API returned HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.message) errorMsg = parsed.message;
        } catch {
          // Keep generic message
        }
        throw new ServiceUnavailableException(errorMsg);
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const errMsg = error instanceof Error ? error.message : 'Unknown communication error';
      throw new ServiceUnavailableException(
        `HostHeaven provider request failed: ${errMsg}`,
      );
    }
  }

  // ==========================================
  // 1. CONNECTION TEST & WALLET
  // ==========================================

  /**
   * Safe connection test that retrieves provider wallet balance without leaking secrets
   */
  async testConnection(): Promise<HostHeavenConnectionTestResult> {
    const config = await this.getConfig();

    if (!config.hasRealCredentials) {
      return {
        success: false,
        connected: false,
        message:
          'HostHeaven credentials not configured (email & password or API token required in Admin Providers or environment)',
        resellerDomain: config.resellerDomain,
        wallet: {
          balance: 0,
          currency: 'INR',
        },
      };
    }

    try {
      const wallet = await this.getWalletBalance();
      return {
        success: true,
        connected: true,
        message: 'HostHeaven connection verified successfully',
        resellerDomain: config.resellerDomain,
        wallet: {
          id: wallet.id,
          balance: wallet.balance,
          currency: wallet.currency || 'INR',
        },
      };
    } catch (error) {
      return {
        success: false,
        connected: false,
        message:
          error instanceof Error
            ? error.message
            : 'Connection to HostHeaven failed',
        resellerDomain: config.resellerDomain,
        wallet: {
          balance: 0,
          currency: 'INR',
        },
      };
    }
  }

  /**
   * Retrieves provider wallet balance: GET /api/wallet
   */
  async getWalletBalance(): Promise<HostHeavenWallet> {
    return this.request<HostHeavenWallet>('/api/wallet');
  }

  /**
   * Retrieves available payment gateways: GET /api/user/payments/gateways
   */
  async getPaymentGateways(): Promise<string[]> {
    return this.request<string[]>('/api/user/payments/gateways');
  }

  // ==========================================
  // 2. LIVE CATALOGUE (ZONES, ISOS, PRICING)
  // ==========================================

  /**
   * Retrieves available zones: GET /api/users/zones
   */
  async getZones(): Promise<HostHeavenZone[]> {
    return this.request<HostHeavenZone[]>('/api/users/zones');
  }

  /**
   * Retrieves operating system ISO templates for a zone: GET /api/users/zones/{zoneId}/isos
   */
  async getZoneIsos(zoneId: string): Promise<HostHeavenIso[]> {
    if (!zoneId?.trim()) {
      throw new BadRequestException('zoneId is required');
    }
    return this.request<HostHeavenIso[]>(`/api/users/zones/${encodeURIComponent(zoneId)}/isos`);
  }

  /**
   * Retrieves resource pricing: GET /api/pricing/{planType}/{resource}
   */
  async getPricing(
    planType: 'shared' | 'dedicated',
    resource: 'cpu' | 'ram' | 'disk' | 'bandwidth',
  ): Promise<HostHeavenPricingItem[]> {
    return this.request<HostHeavenPricingItem[]>(
      `/api/pricing/${encodeURIComponent(planType)}/${encodeURIComponent(resource)}`,
    );
  }

  /**
   * Retrieves complete pricing matrix across shared & dedicated tiers
   */
  async getCompletePricing(): Promise<HostHeavenCompletePricing> {
    const [
      sharedCpu,
      sharedRam,
      sharedDisk,
      sharedBw,
      dedCpu,
      dedRam,
      dedDisk,
      dedBw,
    ] = await Promise.all([
      this.getPricing('shared', 'cpu'),
      this.getPricing('shared', 'ram'),
      this.getPricing('shared', 'disk'),
      this.getPricing('shared', 'bandwidth'),
      this.getPricing('dedicated', 'cpu'),
      this.getPricing('dedicated', 'ram'),
      this.getPricing('dedicated', 'disk'),
      this.getPricing('dedicated', 'bandwidth'),
    ]);

    return {
      shared: {
        cpu: sharedCpu,
        ram: sharedRam,
        disk: sharedDisk,
        bandwidth: sharedBw,
      },
      dedicated: {
        cpu: dedCpu,
        ram: dedRam,
        disk: dedDisk,
        bandwidth: dedBw,
      },
    };
  }

  // ==========================================
  // 3. VM PROVISIONING
  // ==========================================

  /**
   * Actual VM creation: POST /api/users/vms/create?gateway={gateway}
   * Enforces useWalletBalance: true to deduct from HostHeaven provider wallet
   */
  async createVm(dto: HostHeavenCreateVmDto): Promise<HostHeavenCreateVmResponse> {
    const payload = {
      zoneId: dto.zoneId,
      zoneIsoId: dto.zoneIsoId,
      planType: dto.planType,
      cpuPriceId: dto.cpuPriceId,
      ramPriceId: dto.ramPriceId,
      diskPriceId: dto.diskPriceId,
      bandwidthPriceId: dto.bandwidthPriceId,
      months: dto.months || 1,
      quantity: dto.quantity || 1,
      useWalletBalance: true,
      couponCode: dto.couponCode || '',
    };

    const gateway = dto.gateway || 'WALLET';
    return this.request<HostHeavenCreateVmResponse>(
      `/api/users/vms/create?gateway=${encodeURIComponent(gateway)}`,
      {
        method: 'POST',
        body: payload,
      },
    );
  }

  // ==========================================
  // 4. ORDERS & VM DETAILS
  // ==========================================

  /**
   * Retrieves overview of all orders: GET /api/users/orders/overview
   */
  async getOrderOverview(): Promise<unknown> {
    return this.request('/api/users/orders/overview');
  }

  /**
   * Retrieves details of a specific VM: GET /api/users/orders/{vmId}/details
   */
  async getVmDetails(vmId: string): Promise<HostHeavenVmDetails> {
    if (!vmId?.trim()) {
      throw new BadRequestException('vmId is required');
    }
    return this.request<HostHeavenVmDetails>(`/api/users/orders/${encodeURIComponent(vmId)}/details`);
  }

  /**
   * Retrieves VM lock status: GET /api/vms/{vmId}/lock-status
   */
  async getVmLockStatus(vmId: string): Promise<HostHeavenLockStatus> {
    if (!vmId?.trim()) {
      throw new BadRequestException('vmId is required');
    }
    return this.request<HostHeavenLockStatus>(`/api/vms/${encodeURIComponent(vmId)}/lock-status`);
  }

  // ==========================================
  // 5. VPS MANAGEMENT & CONTROLS
  // ==========================================

  /**
   * Executes power action: POST /api/users/vms/control/{vmId}?action={action}
   * Supported actions: start, stop, reboot, pause, resume, hibernate
   */
  async controlVm(
    userId: string,
    vmId: string,
    action: string,
  ): Promise<{ success: boolean; vmId: string; action: string; message: string }> {
    const validActions = ['start', 'stop', 'reboot', 'pause', 'resume', 'hibernate'];
    const normalized = action.toLowerCase().trim();

    if (!validActions.includes(normalized)) {
      throw new BadRequestException(
        `Invalid action '${action}'. Supported actions: ${validActions.join(', ')}`,
      );
    }

    const endpoint = `/api/users/vms/control/${encodeURIComponent(vmId)}?action=${encodeURIComponent(normalized)}`;
    await this.request(endpoint, { method: 'POST' });

    return {
      success: true,
      vmId,
      action: normalized,
      message: `HostHeaven VM ${action} executed successfully`,
    };
  }

  /**
   * Rebuilds VM with specified ISO: POST /api/users/{userId}/vms/{vmId}/rebuild?isoId={isoId}
   */
  async rebuildVm(
    userId: string,
    vmId: string,
    isoId: string,
  ): Promise<{ success: boolean; vmId: string; isoId: string; message: string }> {
    if (!isoId?.trim()) {
      throw new BadRequestException('ISO ID is required for rebuild');
    }

    const endpoint = `/api/users/${encodeURIComponent(userId)}/vms/${encodeURIComponent(vmId)}/rebuild?isoId=${encodeURIComponent(isoId)}`;
    await this.request(endpoint, { method: 'POST' });

    return {
      success: true,
      vmId,
      isoId,
      message: 'VM rebuild initiated successfully',
    };
  }

  /**
   * Retrieves live metrics: GET /api/users/vms/{vmId}/metrics?timeframe=hour
   */
  async getVmMetrics(
    vmId: string,
    timeframe: 'hour' | 'day' | 'week' = 'hour',
  ): Promise<HostHeavenVmMetrics> {
    if (!vmId?.trim()) {
      throw new BadRequestException('vmId is required');
    }
    return this.request<HostHeavenVmMetrics>(
      `/api/users/vms/${encodeURIComponent(vmId)}/metrics?timeframe=${encodeURIComponent(timeframe)}`,
    );
  }

  /**
   * Retrieves storage information: GET /api/users/vms/{vmId}/storage
   */
  async getVmStorage(vmId: string): Promise<HostHeavenStorageInfo> {
    if (!vmId?.trim()) {
      throw new BadRequestException('vmId is required');
    }
    return this.request<HostHeavenStorageInfo>(`/api/users/vms/${encodeURIComponent(vmId)}/storage`);
  }

  /**
   * Updates VM root/administrator password: PUT /api/users/{userId}/vms/{vmId}/password
   */
  async changeVmPassword(
    userId: string,
    vmId: string,
    newPassword: string,
  ): Promise<{ success: boolean; vmId: string; message: string }> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    const endpoint = `/api/users/${encodeURIComponent(userId)}/vms/${encodeURIComponent(vmId)}/password`;
    await this.request(endpoint, {
      method: 'PUT',
      body: { password: newPassword },
    });

    return {
      success: true,
      vmId,
      message: 'VM password updated successfully',
    };
  }

  // ==========================================
  // 6. RENEWAL INTEGRATION
  // ==========================================

  /**
   * Retrieves upgrade options: GET /api/pricing/upgrades/{vmId}
   */
  async getUpgradePricing(vmId: string): Promise<unknown> {
    if (!vmId?.trim()) {
      throw new BadRequestException('vmId is required');
    }
    return this.request(`/api/pricing/upgrades/${encodeURIComponent(vmId)}`);
  }

  /**
   * Calculates renewal price: POST /api/billing/price/calculate-renewal
   */
  async calculateRenewal(
    dto: HostHeavenRenewalCalcDto,
  ): Promise<HostHeavenRenewalCalcResult> {
    return this.request<HostHeavenRenewalCalcResult>(
      '/api/billing/price/calculate-renewal',
      {
        method: 'POST',
        body: dto,
      },
    );
  }

  /**
   * Executes VM renewal: POST /api/vms/renew/{vmId}/upgrade-renew
   */
  async renewVm(
    vmId: string,
    monthsToAdd: number = 1,
  ): Promise<{ success: boolean; vmId: string; monthsAdded: number; message: string }> {
    if (!vmId?.trim()) {
      throw new BadRequestException('vmId is required');
    }

    await this.request(`/api/vms/renew/${encodeURIComponent(vmId)}/upgrade-renew`, {
      method: 'POST',
      body: {
        vmId,
        monthsToAdd,
        useWalletBalance: true,
      },
    });

    return {
      success: true,
      vmId,
      monthsAdded: monthsToAdd,
      message: 'HostHeaven VM renewed successfully',
    };
  }
}
