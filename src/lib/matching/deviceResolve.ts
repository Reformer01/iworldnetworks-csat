import { prisma } from '@/lib/prisma';
import { getCustomerServices } from '@/lib/splynx-api';
import { matchScore, hasStrongSignal, AUTO_MATCH_THRESHOLD, phoneKey, type MatchCustomer, type MatchEndpoint } from './score';

/**
 * Device-first BTS resolution for Splynx-era customers.
 *
 * Root cause of the match gap: customers created after the UISP/UCRM
 * abandonment exist only in Splynx, without BTS/plan/agent labels — so there
 * is often no UISP endpoint record to fuzzy-match against. But an ACTIVE
 * customer's radio is physically registered to a tower, and both systems
 * carry fingerprints that tie back to UISP network inventory:
 *
 *   1. Splynx service.mac  -> UispDevice.mac        (needs API perm: internet-services)
 *   2. Splynx service.ipv4 -> UispDevice.ipAddress  (same perm)
 *   3. Customer name       -> UispDevice.name / UispSite.name (always available)
 *
 * All candidates go through the same matchScore + hasStrongSignal gate as
 * runMatching, so confidence semantics are identical. MRR stays Splynx-
 * sourced (billing truth); UISP contributes connectivity only. Manual
 * matches are never touched.
 */

export interface DeviceResolutionStats {
  considered: number;
  matchedMac: number;
  matchedIp: number;
  matchedPhone: number;
  matchedEmail: number;
  matchedNote: number;
  matchedName: number;
  stillPending: number;
  elapsedMs: number;
}

interface SiteRow {
  id: string;
  name: string;
  type: string;
  btsId: string | null;
  btsName: string | null;
  region: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  note: string | null;
}

interface DeviceRow {
  id: string;
  name: string;
  siteId: string | null;
  mac: string | null;
  ipAddress: string | null;
}

interface CustomerRow {
  id: string;
  customerId: number;
  customerName: string | null;
  city: string | null;
  street: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  matchState: string | null;
  btsName: string | null;
}

const MAC_SCORE = 0.95;
const IP_SCORE = 0.85;

export function normMac(mac: string): string {
  return mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

function normText(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/**
 * Address-match acceptance rule (pure, unit-tested).
 * Accept when: dominant address (margin >= 2), a landslide (>= 6 shared
 * tokens), or an address tie broken decisively by name score (>= 0.35).
 */
export function acceptsAddressMatch(bestN: number, secondN: number, bestNs = 0, secondNs = 0): boolean {
  if (bestN < 3) return false;
  if (bestN >= 6) return true;
  if (bestN - secondN >= 2) return true;
  return bestN === secondN && bestNs - secondNs >= 0.35;
}

/** Minimal CSV line parser: handles quoted cells with commas/escaped quotes. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

export async function runDeviceResolution(now?: number): Promise<DeviceResolutionStats> {
  const startedAt = Date.now();
  const ts = now ?? Date.now();

  // All sites: towers give BTS ancestry; endpoints/premises give name candidates.
  const sites = (await prisma.uispSite.findMany({
    select: {
      id: true, name: true, type: true, btsId: true, btsName: true, region: true,
      contactPhone: true, contactEmail: true, address: true, note: true,
    },
  })) as unknown as SiteRow[];
  const siteById = new Map(sites.map((s) => [s.id, s]));

  // Pre-tokenized subscriber addresses for the address fingerprint path.
  const addrTokens = (s: string): string[] =>
    s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  const endpointAddrTokens = sites
    .filter((s) => s.type === 'endpoint' && s.address)
    .map((s) => ({ site: s, tokens: new Set(addrTokens(s.address ?? '')) }));

  const devices = (await prisma.uispDevice.findMany({
    where: { OR: [{ mac: { not: null } }, { ipAddress: { not: null } }] },
    select: { id: true, name: true, siteId: true, mac: true, ipAddress: true },
  })) as unknown as DeviceRow[];

  const deviceByMac = new Map<string, DeviceRow>();
  const deviceByIp = new Map<string, DeviceRow>();
  for (const d of devices) {
    if (d.mac) deviceByMac.set(normMac(d.mac), d);
    if (d.ipAddress) deviceByIp.set(d.ipAddress.trim(), d);
  }

  // Pending customers, active first (meeting decision: active-customer focus).
  const customers = (await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending' },
    orderBy: [{ status: 'asc' }, { id: 'asc' }],
    select: {
      id: true, customerId: true, customerName: true, city: true,
      street: true, phone: true, email: true, status: true, matchState: true,
      btsName: true,
    },
  })) as unknown as CustomerRow[];

  const stats: DeviceResolutionStats = {
    considered: customers.length,
    matchedMac: 0,
    matchedIp: 0,
    matchedPhone: 0,
    matchedEmail: 0,
    matchedNote: 0,
    matchedName: 0,
    stillPending: 0,
    elapsedMs: 0,
  };

  interface Update {
    id: string;
    data: Record<string, unknown>;
  }
  const updates: Update[] = [];

  /** Score a customer against a UISP site (premises or tower) by name/contact. */
  const scoreSite = (customer: MatchCustomer, site: SiteRow): number =>
    matchScore(customer, {
      name: site.name,
      btsName: site.btsName ?? (site.type === 'site' ? site.name : null),
      region: site.region,
      phone: site.contactPhone,
      email: site.contactEmail,
    });

  const resolve = (
    customer: MatchCustomer & { street?: string | null; btsName?: string | null },
    service?: { mac?: string | null; ipv4?: string | null },
  ): { method: string; score: number; site: SiteRow } | null => {
    // 0. Splynx BTS label — explicit assignment from Splynx customer labels.
    if (customer.btsName) {
      const labelBtsName = customer.btsName.trim();
      const normLabel = labelBtsName.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
      if (normLabel) {
        for (const site of sites) {
          if (site.type !== 'site') continue;
          const normSite = (site.name ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
          if (normSite === normLabel) {
            return { method: 'splynx-label', score: 0.95, site };
          }
        }
      }
    }
    // 1. MAC — physical identity.
    if (service?.mac) {
      const dev = deviceByMac.get(normMac(service.mac));
      const site = dev?.siteId ? siteById.get(dev.siteId) : undefined;
      if (site) return { method: 'device-mac', score: MAC_SCORE, site };
    }
    // 2. IPv4.
    if (service?.ipv4) {
      const dev = deviceByIp.get(service.ipv4.trim());
      const site = dev?.siteId ? siteById.get(dev.siteId) : undefined;
      if (site) return { method: 'device-ip', score: IP_SCORE, site };
    }
    // 3. Email — exact normalized match against UISP subscriber contacts.
    const custEmail = (customer.email ?? '').trim().toLowerCase();
    if (custEmail.includes('@')) {
      const site = sites.find((s) => (s.contactEmail ?? '').trim().toLowerCase() === custEmail);
      if (site) return { method: 'email', score: 0.9, site };
    }
    // 4. Phone — exact normalized match against UISP subscriber contacts.
    const custPhone = phoneKey(customer.phone ?? null);
    if (custPhone) {
      let best: { site: SiteRow } | null = null;
      for (const s of sites) {
        if (phoneKey(s.contactPhone ?? null) === custPhone) {
          best = { site: s };
          break;
        }
      }
      if (best) return { method: 'phone', score: 0.9, site: best.site };
    }
    // 5. Address fingerprint: customer street+city vs UISP subscriber address.
    //    Scored per TOWER (multiple endpoints can share a building) so exact
    //    duplicates don't look ambiguous. Accept when clearly ahead of the
    //    runner-up tower — a shared "IBADAN ROAD" must not decide the match.
    const custAddrTokens = new Set([
      ...addrTokens(customer.city ?? ''),
      ...addrTokens(customer.street ?? ''),
    ]);
    if (custAddrTokens.size > 0) {
      const perTower = new Map<string, { n: number; ns: number; site: SiteRow }>();
      for (const e of endpointAddrTokens) {
        let n = 0;
        for (const t of e.tokens) if (custAddrTokens.has(t)) n++;
        if (n === 0) continue;
        // Name similarity as a tiebreaker between towers with equal addresses.
        const ns = matchScore(customer, {
          name: e.site.name,
          btsName: e.site.btsName,
          region: e.site.region,
          phone: e.site.contactPhone,
          email: e.site.contactEmail,
        });
        const towerKey = e.site.btsId ?? e.site.id;
        const cur = perTower.get(towerKey);
        if (!cur || n > cur.n || (n === cur.n && ns > cur.ns)) perTower.set(towerKey, { n, ns, site: e.site });
      }
      const ranked = [...perTower.values()].sort((a, b) => b.n - a.n || b.ns - a.ns);
      const best = ranked[0];
      const second = ranked[1];
      if (best && acceptsAddressMatch(best.n, second?.n ?? 0, best.ns, second?.ns ?? 0)) {
        return { method: 'address', score: Math.min(0.92, 0.6 + best.n * 0.04), site: best.site };
      }
    }
    // 6. Note-field: installer notes often carry the customer label. A note
    //    containing the customer's full normalized name is a strong signal —
    //    still gated by hasStrongSignal downstream.
    const nameNorm = normText(customer.name);
    if (nameNorm.length >= 6) {
      const noteSite = sites.find((s) => s.note && normText(s.note).includes(nameNorm));
      if (noteSite) return { method: 'note', score: 0.88, site: noteSite };
    }
    // 7. Name-based: best-scoring site OR device-name→its-site.
    const best = findBestNameCandidate(customer);
    if (best && best.score >= AUTO_MATCH_THRESHOLD) return { method: 'device-name', score: best.score, site: best.site };
    return null;
  };

  /** Best name-based candidate regardless of threshold — powers the manual-reconciliation export. */
  function findBestNameCandidate(customer: MatchCustomer): { score: number; site: SiteRow } | null {
    let best: { score: number; site: SiteRow } | null = null;
    for (const site of sites) {
      const s = scoreSite(customer, site);
      if (s > (best?.score ?? 0)) best = { score: s, site };
    }
    for (const d of devices) {
      const site = d.siteId ? siteById.get(d.siteId) : null;
      if (!site) continue;
      // Device names often carry the customer label ("John Folahan Gbemisola 1").
      const sDev = matchScore(customer, {
        name: d.name,
        btsName: site.btsName ?? (site.type === 'site' ? site.name : null),
        region: site.region,
        phone: site.contactPhone,
        email: site.contactEmail,
      });
      if (sDev > (best?.score ?? 0)) best = { score: sDev, site };
    }
    return best;
  }

  // Small concurrency pool — Splynx rate limits; keep it polite.
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < customers.length) {
      const customer = customers[cursor++];
      if (customer.matchState === 'manual') continue;
      const mc: MatchCustomer & { street?: string | null; btsName?: string | null } = {
        name: customer.customerName ?? '',
        city: customer.city,
        street: customer.street,
        phone: customer.phone,
        email: customer.email,
        btsName: customer.btsName,
      };

      // Try Splynx service fingerprints first (needs internet-services perm).
      let services: Awaited<ReturnType<typeof getCustomerServices>> = [];
      try {
        services = await getCustomerServices(customer.customerId);
      } catch {
        services = []; // 403 until the API key gains internet-services read.
      }
      const active = services.filter((s) => String(s.status_id) === '1' || s.status === 'active');
      const candidates = active.length > 0 ? active : services;

      let hit: { method: string; score: number; site: SiteRow } | null = null;
      for (const svc of candidates) {
        hit = resolve(mc, svc);
        if (hit) break;
      }
      if (!hit) hit = resolve(mc);

      if (!hit) {
        stats.stillPending++;
        continue;
      }

      // Name-based matches need the strong-signal gate (a lone shared surname
      // isn't proof). Address/MAC/IP matches carry their own confidence:
      // address already passed the tower-level ambiguity guard.
      if (hit.method.startsWith('device-name')) {
        const ep: MatchEndpoint = {
          name: hit.site.name,
          btsName: hit.site.btsName ?? (hit.site.type === 'site' ? hit.site.name : null),
          region: hit.site.region,
          phone: hit.site.contactPhone,
          email: hit.site.contactEmail,
        };
        if (!hasStrongSignal(mc, ep)) {
          stats.stillPending++;
          continue;
        }
      }

      const site = hit.site;
      // Endpoint: use its tower ancestry; never the endpoint's own id.
      // Tower (type=site): itself. No ancestry → link endpoint only, stay pending.
      let btsId: string | null;
      let btsName: string | null;
      if (site.type === 'endpoint') {
        if (!site.btsId || !site.btsName) {
          stats.stillPending++;
          continue;
        }
        btsId = site.btsId;
        btsName = site.btsName;
      } else {
        btsId = site.id;
        btsName = site.name;
      }

      if (hit.method === 'device-mac') stats.matchedMac++;
      else if (hit.method === 'device-ip') stats.matchedIp++;
      else if (hit.method === 'phone') stats.matchedPhone++;
      else if (hit.method === 'email') stats.matchedEmail++;
      else if (hit.method === 'note') stats.matchedNote++;
      else stats.matchedName++;

      updates.push({
        id: customer.id,
        data: {
          btsId,
          btsName,
          uispEndpointId: site.type === 'endpoint' ? site.id : null,
          uispEndpointName: site.type === 'endpoint' ? site.name : null,
          matchState: 'matched',
          matchMethod: hit.method,
          matchScore: hit.score,
          matchedAt: BigInt(ts),
          matchUpdatedAt: BigInt(ts),
        },
      });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  for (let i = 0; i < updates.length; i += 25) {
    const chunk = updates.slice(i, i + 25);
    await Promise.all(
      chunk.map((u) => prisma.customer.update({ where: { id: u.id }, data: u.data as never }).catch(() => undefined)),
    );
  }

  stats.elapsedMs = Date.now() - startedAt;
  return stats;
}

/**
 * Manual-reconciliation export: every pending customer with its best name-
 * based candidate and score, so staff confirm/correct instead of guessing.
 * The filled CSV re-enters via applyManualAssignments (matchState='manual').
 */
export async function buildUnmatchedCsv(): Promise<string> {
  const sites = (await prisma.uispSite.findMany({
    select: {
      id: true, name: true, type: true, btsId: true, btsName: true, region: true,
      contactPhone: true, contactEmail: true, address: true, note: true,
    },
  })) as unknown as SiteRow[];
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const addrTokens = (s: string): string[] =>
    s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  const endpointAddrTokens = sites
    .filter((s) => s.type === 'endpoint' && s.address)
    .map((s) => ({ site: s, tokens: new Set(addrTokens(s.address ?? '')) }));
  const devices = (await prisma.uispDevice.findMany({
    where: { OR: [{ mac: { not: null } }, { ipAddress: { not: null } }] },
    select: { id: true, name: true, siteId: true, mac: true, ipAddress: true },
  })) as unknown as DeviceRow[];

  const scoreSite = (customer: MatchCustomer, site: SiteRow): number =>
    matchScore(customer, {
      name: site.name,
      btsName: site.btsName ?? (site.type === 'site' ? site.name : null),
      region: site.region,
      phone: site.contactPhone,
      email: site.contactEmail,
    });

  const customers = (await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending' },
    orderBy: [{ status: 'asc' }, { customerName: 'asc' }],
    select: {
      id: true, customerId: true, customerName: true, phone: true, email: true,
      city: true, street: true, status: true, mrrTotal: true, servicePlan: true,
    },
  })) as unknown as Array<{
    id: string; customerId: number; customerName: string | null; phone: string | null;
    email: string | null; city: string | null; street: string | null; status: string | null;
    mrrTotal: number | null; servicePlan: string | null;
  }>;

  const esc = (v: string | number | null | undefined): string => {
    let s = String(v ?? '');
    // CSV formula-injection guard: neutralize spreadsheet formula triggers.
    if (/^[=+@]|^-[^0-9]|^\t/.test(s)) s = `'${s}`;
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  /** Top-N towers by combined address-token + name score. */
  function suggestTowers(customer: MatchCustomer & { street?: string | null }, n: number): string[] {
    const custAddr = new Set([...addrTokens(customer.city ?? ''), ...addrTokens(customer.street ?? '')]);
    const scored = new Map<string, { score: number; btsName: string }>();
    for (const e of endpointAddrTokens) {
      let t = 0;
      for (const tok of e.tokens) if (custAddr.has(tok)) t++;
      if (t === 0 || !e.site.btsName) continue;
      const key = e.site.btsId ?? e.site.id;
      const composite = t * 2 + matchScore(customer, { name: e.site.name, btsName: e.site.btsName, region: e.site.region, phone: e.site.contactPhone, email: e.site.contactEmail });
      const cur = scored.get(key);
      if (!cur || composite > cur.score) scored.set(key, { score: composite, btsName: e.site.btsName });
    }
    return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, n).map((s) => s.btsName);
  }

  const header = 'Splynx ID,Customer Name,Phone,Email,City,Street,Status,MRR,Service Plan,Suggestion 1,Suggestion 2,Suggestion 3,Assigned BTS (FILL THIS)';
  const rows: string[] = [header];

  for (const c of customers) {
    const mc: MatchCustomer & { street?: string | null } = {
      name: c.customerName ?? '', city: c.city, street: c.street, phone: c.phone, email: c.email,
    };
    const suggestions = suggestTowers(mc, 3);
    while (suggestions.length < 3) suggestions.push('');
    rows.push([
      c.customerId,
      esc(c.customerName),
      esc(c.phone),
      esc(c.email),
      esc(c.city),
      esc(c.street),
      c.status ?? '',
      c.mrrTotal ?? 0,
      esc(c.servicePlan),
      esc(suggestions[0]),
      esc(suggestions[1]),
      esc(suggestions[2]),
      '', // Assigned BTS — staff fills this in
    ].join(','));
  }

  return rows.join('\n');
}

/**
 * Apply the manually filled CSV. Every row with a non-empty "Assigned BTS"
 * becomes a SACRED manual match (matchState='manual', never overwritten by
 * automation). BTS names are resolved to towers via UispSite for btsId.
 */
export async function applyManualAssignments(csv: string, adminEmail: string): Promise<{ applied: number; unresolved: string[] }> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { applied: 0, unresolved: [] };

  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
  const iSplynx = idx('Splynx ID');
  const iAssigned = idx('Assigned BTS');

  // Tower lookup: normalized tower name -> { btsId, btsName }.
  const towers = await prisma.uispSite.findMany({
    where: { type: 'site', btsName: { not: null } },
    select: { id: true, name: true, btsId: true, btsName: true },
  });
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const towerByName = new Map<string, { id: string; name: string }>();
  for (const t of towers) {
    towerByName.set(norm(t.name), { id: t.btsId ?? t.id, name: t.btsName ?? t.name });
  }

  const ts = BigInt(Date.now());
  let applied = 0;
  const unresolved: string[] = [];

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);

    const splynxId = Number(cells[iSplynx]?.trim());
    const assigned = cells[iAssigned]?.trim();
    if (!splynxId || !assigned) continue;

    const tower = towerByName.get(norm(assigned));
    if (!tower) {
      unresolved.push(`${splynxId}: "${assigned}"`);
      continue;
    }

    const res = await prisma.customer.updateMany({
      where: { customerId: String(splynxId), deleted: false },
      data: {
        btsId: tower.id,
        btsName: tower.name,
        matchState: 'manual',
        matchMethod: 'manual-csv',
        matchScore: 1,
        matchedAt: ts,
        matchUpdatedAt: ts,
      },
    });
    applied += res.count;
  }

  void adminEmail;
  return { applied, unresolved };
}
