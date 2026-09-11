import { describe, expect, it } from 'vitest';
import { getExcludedUispSiteIds, isExcludedUispSiteEvent } from '../uisp-exclusions';

describe('UISP BTS exclusions', () => {
  it('excludes exact roots and all nested descendants', () => {
    const sites = [
      { id: 'precious', identification: { id: 'precious', name: ' Precious Cornerstone University ', type: 'site', parent: null } },
      {
        id: 'precious-child',
        identification: {
          id: 'precious-child',
          name: 'Customer A',
          type: 'endpoint',
          parent: { id: 'precious', name: 'Precious Cornerstone University', type: 'site' },
        },
      },
      {
        id: 'precious-deep',
        identification: {
          id: 'precious-deep',
          name: 'Customer B',
          type: 'endpoint',
          parent: { id: 'precious-child', name: 'Customer A', type: 'endpoint' },
        },
      },
      { id: 'broken', identification: { id: 'broken', name: 'Ibadan (Broken House Core)', type: 'site', parent: null } },
      {
        id: 'broken-child',
        identification: {
          id: 'broken-child',
          name: 'Customer C',
          type: 'endpoint',
          parent: { id: 'broken', name: 'Ibadan (Broken House Core)', type: 'site' },
        },
      },
    ];

    expect(getExcludedUispSiteIds(sites)).toEqual(new Set(['precious', 'precious-child', 'precious-deep', 'broken', 'broken-child']));
  });

  it('preserves a same-name endpoint under NTA IBADAN', () => {
    const sites = [
      { id: 'nta', identification: { id: 'nta', name: 'NTA IBADAN', type: 'site', parent: null } },
      {
        id: 'nta-precious',
        identification: {
          id: 'nta-precious',
          name: 'Precious Cornerstone University',
          type: 'endpoint',
          parent: { id: 'nta', name: 'NTA IBADAN', type: 'site' },
        },
      },
    ];

    expect(getExcludedUispSiteIds(sites)).toEqual(new Set());
    expect(isExcludedUispSiteEvent(sites[1])).toBe(false);
  });

  it('blocks webhook recreation of an excluded root or direct child', () => {
    expect(isExcludedUispSiteEvent({ identification: { name: 'Ibadan (Broken House Core)', type: 'site' } })).toBe(true);
    expect(
      isExcludedUispSiteEvent({
        identification: { name: 'Customer A', type: 'endpoint', parent: { name: 'Precious Cornerstone University' } },
      }),
    ).toBe(true);
  });
});
