import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../splynx-nonce', () => ({
  incrementNonce: vi.fn(),
}));

import { incrementNonce } from '../splynx-nonce';
import { buildAuthHeader } from '../splynx-api';

describe('splynx-api buildAuthHeader', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
    process.env.SPLYNX_API_KEY = 'TESTKEY';
    process.env.SPLYNX_API_SECRET = 'TESTSECRET';
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.clearAllMocks();
  });

  it('returns Basic auth when SPLYNX_API_AUTH is basic', async () => {
    process.env.SPLYNX_API_AUTH = 'basic';
    const header = await buildAuthHeader();
    const expected = `Basic ${Buffer.from('TESTKEY:TESTSECRET').toString('base64')}`;
    expect(header).toBe(expected);
  });

  it('returns Splynx-EA signature when SPLYNX_API_AUTH is signature', async () => {
    process.env.SPLYNX_API_AUTH = 'signature';
    (incrementNonce as unknown as vi.Mock).mockResolvedValue(12345);
    const header = await buildAuthHeader();
    expect(header.startsWith('Splynx-EA (key=TESTKEY&nonce=')).toBe(true);
    expect(header.includes('&signature=')).toBe(true);
  });
});
