import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { NexaVpsService } from './nexavps.service.js';

describe('NexaVpsService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not make a request when the API key is missing', async () => {
    const config = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = new NexaVpsService(config);
    const result = await service.testConnection();

    expect(result.success).toBe(false);
    expect(result.connected).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests only the read-only plans endpoint', async () => {
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'NEXAVPS_API_KEY') return 'test-secret-key';
        return undefined;
      }),
    } as unknown as ConfigService;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ plans: [{ id: 'plan-1' }, { id: 'plan-2' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new NexaVpsService(config);
    const result = await service.testConnection();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestedUrl, options] = fetchMock.mock.calls[0];
    expect(String(requestedUrl)).toBe(
      'https://nexahostvps.com/api/v1/dedicated-ips?action=plans',
    );
    expect(options.method).toBe('GET');
    expect(options.headers['X-API-Key']).toBe('test-secret-key');
    expect(result).toMatchObject({
      success: true,
      connected: true,
      plansCount: 2,
    });
    expect(JSON.stringify(result)).not.toContain('test-secret-key');
  });

  it('reports HTTP errors without exposing credentials', async () => {
    const config = {
      get: vi.fn((key: string) =>
        key === 'NEXAVPS_API_KEY' ? 'test-secret-key' : undefined,
      ),
    } as unknown as ConfigService;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const service = new NexaVpsService(config);
    const result = await service.testConnection();

    expect(result.success).toBe(false);
    expect(result.message).toContain('401');
    expect(JSON.stringify(result)).not.toContain('test-secret-key');
  });

  it('rejects non-official or non-HTTPS provider URLs', async () => {
    const config = {
      get: vi.fn((key: string) =>
        key === 'NEXAVPS_API_KEY' ? 'test-secret-key' : undefined,
      ),
    } as unknown as ConfigService;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = new NexaVpsService(config);

    const result = await service.testConnection('http://example.com/api');

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch wallet balance when the API key is missing', async () => {
    const config = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = new NexaVpsService(config);
    const result = await service.getBalance();

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the Nexa wallet balance using a read-only GET request', async () => {
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'NEXAVPS_API_KEY') return 'test-secret-key';
        return undefined;
      }),
    } as unknown as ConfigService;

    const balanceData = { balance: 1250, currency: 'INR' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => balanceData,
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new NexaVpsService(config);
    const result = await service.getBalance();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestedUrl, options] = fetchMock.mock.calls[0];
    expect(String(requestedUrl)).toBe(
      'https://nexahostvps.com/api/v1/dedicated-ips?action=balance',
    );
    expect(options.method).toBe('GET');
    expect(options.headers['X-API-Key']).toBe('test-secret-key');
    expect(result).toEqual({ success: true, balance: balanceData });
    expect(JSON.stringify(result)).not.toContain('test-secret-key');
  });

  it('handles wallet balance HTTP errors without exposing the API key', async () => {
    const config = {
      get: vi.fn((key: string) =>
        key === 'NEXAVPS_API_KEY' ? 'test-secret-key' : undefined,
      ),
    } as unknown as ConfigService;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const service = new NexaVpsService(config);
    const result = await service.getBalance();

    expect(result.success).toBe(false);
    expect(result.message).toContain('401');
    expect(JSON.stringify(result)).not.toContain('test-secret-key');
  });

});
