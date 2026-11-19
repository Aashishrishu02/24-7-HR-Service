import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VpsService {
  constructor(private readonly configService: ConfigService) {}

  private getAuth(): { baseUrl: string; authorization: string } {
    const baseUrl = this.configService.get<string>('SMARTVPS_BASE_URL');
    const username = this.configService.get<string>('SMARTVPS_USERNAME');
    const password = this.configService.get<string>('SMARTVPS_PASSWORD');

    if (!baseUrl || !username || !password) {
      throw new ServiceUnavailableException(
        'SmartVPS provider is not configured. Please supply API credentials in Admin Providers or environment.',
      );
    }

    return {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      authorization:
        'Basic ' +
        Buffer.from(`${username}:${password}`).toString('base64'),
    };
  }

  private async request(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: Record<string, string | number>,
  ): Promise<unknown> {
    const { baseUrl, authorization } = this.getAuth();

    try {
      const response = await fetch(
        `${baseUrl}/api/oceansmart/${endpoint}`,
        {
          method,
          headers: {
            Authorization: authorization,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
        },
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `SmartVPS provider returned HTTP ${response.status}`,
        );
      }

      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Unable to communicate with VPS provider',
      );
    }
  }

  async getIpStock() {
    return this.request('ipstock', 'GET');
  }

  async getStatus(ip: string) {
    if (!ip?.trim()) {
      throw new BadRequestException('IP address is required');
    }
    return this.request('status', 'POST', { ip });
  }

  async start(ip: string) {
    if (!ip?.trim()) {
      throw new BadRequestException('IP address is required');
    }
    return this.request('start', 'POST', { ip });
  }

  async stop(ip: string) {
    if (!ip?.trim()) {
      throw new BadRequestException('IP address is required');
    }
    return this.request('stop', 'POST', { ip });
  }

  async buy(ip: string, ram: number) {
    if (!ip?.trim() || !Number.isInteger(ram) || ram <= 0) {
      throw new BadRequestException('Valid IP address and RAM are required');
    }
    return this.request('buyvps', 'POST', { ip, ram });
  }

  async renew(ip: string) {
    if (!ip?.trim()) {
      throw new BadRequestException('IP address is required');
    }
    return this.request('renewvps', 'POST', { ip });
  }

  async changeOs(ip: string, os: string) {
    const allowedOs = [
      '2012',
      '2016',
      '2019',
      '2022',
      '11',
      'centos',
      'ubuntu',
    ];

    if (!allowedOs.includes(os.toLowerCase())) {
      throw new BadRequestException('Unsupported operating system');
    }

    return this.request('changeos', 'POST', { ip, os });
  }

  async getOsTemplate(ip: string) {
    if (!ip?.trim()) {
      throw new BadRequestException('IP address is required');
    }
    return this.request('getostemplate', 'POST', { ip });
  }
}
