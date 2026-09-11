/**
 * BTS roots that must not be represented in the platform.
 *
 * Matching is deliberately exact after whitespace/case normalization. This
 * prevents a customer endpoint with the same name under another BTS from
 * being removed accidentally.
 */
export const EXCLUDED_BTS_NAMES = ['Precious Cornerstone University', 'Ibadan (Broken House Core)'] as const;

export interface UispSiteLike {
  id?: string;
  identification?: {
    id?: string;
    name?: string;
    type?: string;
    parent?: {
      id?: string;
      name?: string;
      type?: string;
    } | null;
  };
}

export function normalizeUispName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const excludedNames = new Set(EXCLUDED_BTS_NAMES.map(normalizeUispName));

export function isExcludedBtsName(value: unknown): boolean {
  return excludedNames.has(normalizeUispName(value));
}

function siteId(site: UispSiteLike): string | null {
  const id = site.identification?.id ?? site.id;
  return id ? String(id) : null;
}

/** Returns true only for an excluded type=site root. */
export function isExcludedBtsRoot(site: UispSiteLike): boolean {
  return site.identification?.type === 'site' && isExcludedBtsName(site.identification.name);
}

/**
 * Finds every site in an excluded root's subtree, including nested endpoints.
 * The same-name endpoint under NTA IBADAN is intentionally not included.
 */
export function getExcludedUispSiteIds(sites: readonly UispSiteLike[]): Set<string> {
  const byId = new Map<string, UispSiteLike>();
  for (const site of sites) {
    const id = siteId(site);
    if (id) byId.set(id, site);
  }

  const excludedRootIds = new Set(
    sites
      .filter(isExcludedBtsRoot)
      .map(siteId)
      .filter((id): id is string => Boolean(id)),
  );
  const excluded = new Set(excludedRootIds);

  for (const site of sites) {
    const id = siteId(site);
    if (!id || excluded.has(id)) continue;

    let parentId = site.identification?.parent?.id ?? null;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      if (excludedRootIds.has(parentId)) {
        excluded.add(id);
        break;
      }
      seen.add(parentId);
      parentId = byId.get(parentId)?.identification?.parent?.id ?? null;
    }
  }

  return excluded;
}

/**
 * Webhook payloads include the immediate parent but not always the full
 * ancestor chain. This covers roots and direct descendants; the full poll
 * path uses getExcludedUispSiteIds for arbitrary-depth trees.
 */
export function isExcludedUispSiteEvent(site: UispSiteLike): boolean {
  return isExcludedBtsRoot(site) || isExcludedBtsName(site.identification?.parent?.name);
}
