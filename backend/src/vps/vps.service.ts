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


  private saveSessionCookies(response: Response, jar: Map<string, string>) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) {
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  }

  private sessionCookieHeader(jar: Map<string, string>): string {
    return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  private parseHtmlAttributes(tag: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(tag)) !== null) {
      attributes[match[1].toLowerCase()] =
        match[2] ?? match[3] ?? match[4] ?? '';
    }

    return attributes;
  }

  private extractHiddenFields(html: string): URLSearchParams {
    const fields = new URLSearchParams();
    const inputs = html.match(/<input\b[^>]*>/gi) || [];

    for (const input of inputs) {
      const attrs = this.parseHtmlAttributes(input);
      if (attrs.name && attrs.type?.toLowerCase() === 'hidden') {
        fields.set(attrs.name, attrs.value || '');
      }
    }

    return fields;
  }

  private decodeHtmlText(value: string): string {
    return value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCodePoint(Number(code)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
        String.fromCodePoint(parseInt(code, 16)),
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseIpStockTable(html: string) {
    const tableRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const parsedRows = tableRows
      .map((row) =>
        [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
          (cell) => this.decodeHtmlText(cell[1]),
        ),
      )
      .filter((row) => row.length >= 3);

    if (parsedRows.length < 2) {
      throw new ServiceUnavailableException(
        'Ocean VPS IP stock table was not found',
      );
    }

    const headers = parsedRows[0];
    const nameIndex = headers.findIndex((header) => /^name$/i.test(header));
    const availableIndex = headers.findIndex((header) =>
      /^available$/i.test(header),
    );

    if (nameIndex < 0 || availableIndex < 0) {
      throw new ServiceUnavailableException(
        'Ocean VPS IP stock table format was not recognized',
      );
    }

    const stock = parsedRows.slice(1).map((cells) => {
      const available = Number(cells[availableIndex] || 0);
      const plans: Record<string, string> = {};

      headers.forEach((header, index) => {
        if (
          index !== nameIndex &&
          index !== availableIndex &&
          !/^sr$/i.test(header)
        ) {
          plans[header] = cells[index] || '';
        }
      });

      return {
        name: cells[nameIndex] || '',
        available: Number.isFinite(available) ? available : 0,
        plans,
      };
    }).filter((row) => row.name);

    return {
      availableIps: stock
        .filter((row) => row.available > 0)
        .map((row) => row.name),
      stock,
    };
  }

  async getIpStock() {
    const baseUrl = this.configService.get<string>('SMARTVPS_BASE_URL');
    const username = this.configService.get<string>('SMARTVPS_USERNAME');
    const password = this.configService.get<string>('SMARTVPS_PASSWORD');

    if (!baseUrl || !username || !password) {
      throw new ServiceUnavailableException(
        'SmartVPS provider is not configured. Please supply credentials in environment.',
      );
    }

    const base = baseUrl.replace(/\/+$/, '');
    const loginUrl = `${base}/Login.aspx`;
    const stockUrl = `${base}/SuperSeller/CheckIPStock.aspx`;
    const jar = new Map<string, string>();

    const request = async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers || {});
      const cookie = this.sessionCookieHeader(jar);
      if (cookie) headers.set('Cookie', cookie);

      const response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(30000),
      });

      this.saveSessionCookies(response, jar);
      return response;
    };

    try {
      const loginPage = await request(loginUrl);
      if (!loginPage.ok) {
        throw new ServiceUnavailableException(
          `Ocean VPS login page returned HTTP ${loginPage.status}`,
        );
      }

      const loginHtml = await loginPage.text();
      const loginFields = this.extractHiddenFields(loginHtml);
      loginFields.set('txtUserName', username);
      loginFields.set('txtPassword', password);
      loginFields.set('btnLogin', 'Login');

      const loginResponse = await request(loginUrl, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: loginUrl,
        },
        body: loginFields.toString(),
      });

      if (loginResponse.status < 300 || loginResponse.status >= 400) {
        throw new ServiceUnavailableException(
          `Ocean VPS panel login failed (HTTP ${loginResponse.status})`,
        );
      }

      const stockPage = await request(stockUrl, {
        headers: { Referer: `${base}/SuperSeller/Dashboard.aspx` },
      });

      if (!stockPage.ok) {
        throw new ServiceUnavailableException(
          `Ocean VPS stock page returned HTTP ${stockPage.status}`,
        );
      }

      let html = await stockPage.text();

      if (/name=["']txtPassword["']/i.test(html)) {
        throw new ServiceUnavailableException(
          'Ocean VPS panel session was not authenticated',
        );
      }

      const refreshFields = this.extractHiddenFields(html);
      refreshFields.set(
        '__EVENTTARGET',
        'ctl00$ContentPlaceHolder1$btnRefresh',
      );
      refreshFields.set('__EVENTARGUMENT', '');

      const refreshResponse = await request(stockUrl, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: base,
          Referer: stockUrl,
        },
        body: refreshFields.toString(),
      });

      if (!refreshResponse.ok) {
        throw new ServiceUnavailableException(
          `Ocean VPS stock refresh returned HTTP ${refreshResponse.status}`,
        );
      }

      html = await refreshResponse.text();

      if (/name=["']txtPassword["']/i.test(html)) {
        throw new ServiceUnavailableException(
          'Ocean VPS session expired while refreshing stock',
        );
      }

      return {
        ...this.parseIpStockTable(html),
        refreshedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Unable to retrieve IP stock from Ocean VPS panel',
      );
    }
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
