import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uispFetch, getUispEnv, getAllUispSites, getAllUispDevices } from '../uisp-api';

describe('getUispEnv', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.UISP_BASE_URL;
    delete process.env.UISP_API_TOKEN;
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('defaults base URL to uisp.iwn.ng', () => {
    expect(getUispEnv().baseUrl).toBe('https://uisp.iwn.ng');
  });
  it('reads token from env', () => {
    process.env.UISP_API_TOKEN = 'tok-123';
    expect(getUispEnv().token).toBe('tok-123');
  });
});

describe('uispFetch', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, UISP_API_TOKEN: 'tok-123', UISP_BASE_URL: 'https://uisp.test' };
    vi.restoreAllMocks();
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('throws when no token configured', async () => {
    process.env.UISP_API_TOKEN = '';
    await expect(uispFetch('/sites')).rejects.toThrow('UISP_API_TOKEN is not configured');
  });

  it('sends x-auth-token header and returns JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'a' }],
      status: 200,
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await uispFetch('/sites');
    expect(result).toEqual([{ id: 'a' }]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://uisp.test/nms/api/v2.1/sites');
    expect(init.headers['x-auth-token']).toBe('tok-123');
  });

  it('retries on 5xx then succeeds', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ ok: true }] });
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();

    const promise = uispFetch('/devices');
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual([{ ok: true }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on permanent 4xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(uispFetch('/sites')).rejects.toThrow('UISP API error 401');
  });
});

describe('endpoint helpers', () => {
  it('export site/device fetchers', () => {
    expect(typeof getAllUispSites).toBe('function');
    expect(typeof getAllUispDevices).toBe('function');
  });
});
