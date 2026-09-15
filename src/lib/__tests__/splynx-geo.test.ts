import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSubdivisionId, resolveSubdivisionName, getSubdivisionNameMap, _resetSubdivisionCache } from '../splynx-geo';

vi.mock('../splynx-api', () => ({
  buildAuthHeader: vi.fn(async () => 'Basic xyz'),
  getSplynxConfig: () => ({ host: 'https://portal.iwn.ng', key: 'k', secret: 's', authMode: 'basic' }),
}));

describe('parseSubdivisionId', () => {
  it('parses numeric and numeric-string ids', () => {
    expect(parseSubdivisionId({ subdivision_id: 30 })).toBe(30);
    expect(parseSubdivisionId({ subdivision_id: '30' })).toBe(30);
    expect(parseSubdivisionId({ subdivisionId: '30' })).toBe(30);
  });
  it('returns null when absent or invalid', () => {
    expect(parseSubdivisionId({})).toBeNull();
    expect(parseSubdivisionId({ subdivision_id: 0 })).toBeNull();
    expect(parseSubdivisionId({ subdivision_id: 'abc' })).toBeNull();
  });
});

describe('resolveSubdivisionName', () => {
  const map = new Map([[30, 'Osun']]);
  it('maps 30 → Osun', () => {
    expect(resolveSubdivisionName({ subdivision_id: 30 }, map)).toBe('Osun');
    expect(resolveSubdivisionName({ subdivision_id: '30' }, map)).toBe('Osun');
  });
  it('unknown → null', () => {
    expect(resolveSubdivisionName({ subdivision_id: 999 }, map)).toBeNull();
    expect(resolveSubdivisionName({}, map)).toBeNull();
    expect(resolveSubdivisionName({ subdivision_id: 30 }, null)).toBeNull();
  });
});

describe('getSubdivisionNameMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    _resetSubdivisionCache();
  });
  it('fetches states-provinces (limit 100) and caches 24h', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => [
        { id: 30, code: 'NG-OS', name: 'Osun' },
        { id: 25, code: 'NG-LA', name: 'Lagos' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const m1 = await getSubdivisionNameMap();
    expect(m1.get(30)).toBe('Osun');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/config/states-provinces');
    const m2 = await getSubdivisionNameMap();
    expect(m2).toBe(m1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
