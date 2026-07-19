import { btsStations } from './bts-data';
import type { BtsStation } from './sales-types';

interface BtsSplynxMap {
  btsName: string;
  splynxRouterIds: number[];
  splynxRouterNames: string[];
}

const SPLYNX_ROUTER_TO_BTS = new Map<number, string>();
const SPLYNX_ROUTER_NAME_TO_BTS = new Map<string, string>();
const btsSplynxMapping: BtsSplynxMap[] = [];

function initializeMapping() {
  if (btsSplynxMapping.length > 0) return;

  // Default mapping based on BTS station regions and common router names
  const defaultMapping: BtsSplynxMap[] = [
    // Ibadan routers
    { btsName: 'Sijuwola House', splynxRouterIds: [1], splynxRouterNames: ['Sijuwola', 'Sijuwola House'] },
    { btsName: 'Dominion', splynxRouterIds: [2], splynxRouterNames: ['Dominion'] },
    { btsName: 'Space', splynxRouterIds: [3], splynxRouterNames: ['Space', 'Space FM'] },
    { btsName: 'Splash', splynxRouterIds: [4], splynxRouterNames: ['Splash', 'Splash FM'] },
    { btsName: 'NTA IBD', splynxRouterIds: [6], splynxRouterNames: ['NTA IBD', 'NTA Ibadan'] },
    { btsName: 'Honor', splynxRouterIds: [7], splynxRouterNames: ['Honor', 'Honor FM'] },
    { btsName: 'Oleyo', splynxRouterIds: [8], splynxRouterNames: ['Oleyo'] },
    { btsName: 'Ologuneru', splynxRouterIds: [9], splynxRouterNames: ['Ologuneru', 'St. John', 'Carmelite'] },
    { btsName: 'Jericho', splynxRouterIds: [10], splynxRouterNames: ['Jericho', 'Lead City'] },
    { btsName: 'Impact', splynxRouterIds: [11], splynxRouterNames: ['Impact', 'Impact FM'] },
    { btsName: 'Moniya', splynxRouterIds: [12], splynxRouterNames: ['Moniya', 'Amuludun'] },
    // Osogbo routers
    { btsName: 'OSBC', splynxRouterIds: [13], splynxRouterNames: ['OSBC', 'Osun Broadcasting'] },
    { btsName: 'NTA Osogbo', splynxRouterIds: [14], splynxRouterNames: ['NTA Osogbo'] },
    { btsName: 'Rave', splynxRouterIds: [15], splynxRouterNames: ['Rave', 'Rave FM'] },
    { btsName: 'Osogbo Office', splynxRouterIds: [16], splynxRouterNames: ['Osogbo Office'] },
    { btsName: 'Odeomu', splynxRouterIds: [17], splynxRouterNames: ['Odeomu'] },
    // Akure routers
    { btsName: 'OSRC', splynxRouterIds: [18], splynxRouterNames: ['OSRC', 'Ondo State Radio'] },
    { btsName: 'Akure Office', splynxRouterIds: [19], splynxRouterNames: ['Akure Office'] },
    { btsName: 'Positive', splynxRouterIds: [20], splynxRouterNames: ['Positive', 'Positive FM'] },
    { btsName: 'Glow', splynxRouterIds: [21], splynxRouterNames: ['Glow'] },
    { btsName: 'Alagbaka Extension', splynxRouterIds: [22], splynxRouterNames: ['Alagbaka', 'Alagbaka Extension'] },
    { btsName: 'Bolorunduro', splynxRouterIds: [23], splynxRouterNames: ['Bolorunduro'] },
    // Ota routers
    { btsName: 'Ota Estate', splynxRouterIds: [24], splynxRouterNames: ['Ota Estate', 'David Cooker'] },
    { btsName: 'Syayis', splynxRouterIds: [25], splynxRouterNames: ['Syayis', 'Syayis Hotel'] },
    { btsName: 'AIT', splynxRouterIds: [26], splynxRouterNames: ['AIT', 'African Independent Television'] },
    { btsName: 'Ota Office', splynxRouterIds: [27], splynxRouterNames: ['Ota Office'] },
    // Sagamu routers
    { btsName: 'Sagamu GRA', splynxRouterIds: [28], splynxRouterNames: ['Sagamu GRA', 'Conference Hotel Sagamu'] },
    { btsName: 'CRC', splynxRouterIds: [29], splynxRouterNames: ['CRC', 'Thames Valley College'] },
    { btsName: 'Akarigbo', splynxRouterIds: [30], splynxRouterNames: ['Akarigbo', 'Akarigbo Palace'] },
    { btsName: 'Sagamu Extension', splynxRouterIds: [31], splynxRouterNames: ['Sagamu Extension', 'Akeem Oriyomi'] },
    { btsName: 'Potoki', splynxRouterIds: [32], splynxRouterNames: ['Potoki'] },
    { btsName: 'Pentagon', splynxRouterIds: [33], splynxRouterNames: ['Pentagon'] },
    { btsName: 'Magboro', splynxRouterIds: [34], splynxRouterNames: ['Magboro', 'Pearl School'] },
    // Ijebu Ode routers
    { btsName: 'Odogbolu', splynxRouterIds: [35], splynxRouterNames: ['Odogbolu', 'Ijebu Ode Anglican'] },
    { btsName: 'Ijebu GRA', splynxRouterIds: [36], splynxRouterNames: ['Ijebu GRA', 'Conference Hotel Ijebu'] },
    { btsName: 'NTA Ijebu', splynxRouterIds: [37], splynxRouterNames: ['NTA Ijebu', 'Nigerian Television Authority'] },
    { btsName: 'Ilamo', splynxRouterIds: [38], splynxRouterNames: ['Ilamo'] },
    { btsName: 'CKA', splynxRouterIds: [39], splynxRouterNames: ['CKA'] },
    // Abeokuta routers
    { btsName: 'Omida Office', splynxRouterIds: [40], splynxRouterNames: ['Omida Office'] },
    { btsName: 'NTA Abeokuta', splynxRouterIds: [41], splynxRouterNames: ['NTA Abeokuta'] },
    { btsName: 'Rockcity', splynxRouterIds: [42], splynxRouterNames: ['Rockcity'] },
    { btsName: 'Elega', splynxRouterIds: [43], splynxRouterNames: ['Elega'] },
    { btsName: 'Ikija', splynxRouterIds: [44], splynxRouterNames: ['Ikija'] },
    { btsName: 'Ewang', splynxRouterIds: [45], splynxRouterNames: ['Ewang'] },
    { btsName: 'IVD', splynxRouterIds: [46], splynxRouterNames: ['IVD'] },
    { btsName: 'Paramount', splynxRouterIds: [47], splynxRouterNames: ['Paramount'] },
    { btsName: 'Laderin', splynxRouterIds: [48], splynxRouterNames: ['Laderin'] },
    { btsName: 'Osoba', splynxRouterIds: [49], splynxRouterNames: ['Osoba'] },
    { btsName: 'Oloke', splynxRouterIds: [50], splynxRouterNames: ['Oloke'] },
    { btsName: 'CUAB', splynxRouterIds: [51], splynxRouterNames: ['CUAB'] },
    { btsName: 'CFMC', splynxRouterIds: [52], splynxRouterNames: ['CFMC'] },
    { btsName: 'Obada Oko', splynxRouterIds: [53], splynxRouterNames: ['Obada Oko'] },
    { btsName: 'Obada Extension', splynxRouterIds: [54], splynxRouterNames: ['Obada Extension'] },
    { btsName: 'Miliki', splynxRouterIds: [55], splynxRouterNames: ['Miliki'] },
    { btsName: 'OGBC', splynxRouterIds: [56], splynxRouterNames: ['OGBC'] },
  ];

  for (const m of defaultMapping) {
    for (const id of m.splynxRouterIds) SPLYNX_ROUTER_TO_BTS.set(id, m.btsName);
    for (const name of m.splynxRouterNames) SPLYNX_ROUTER_NAME_TO_BTS.set(name.toLowerCase(), m.btsName);
    btsSplynxMapping.push(m);
  }
}

initializeMapping();

export function getBtsForSplynxRouter(routerId?: number, routerName?: string): string | null {
  if (routerId && SPLYNX_ROUTER_TO_BTS.has(routerId)) {
    return SPLYNX_ROUTER_TO_BTS.get(routerId)!;
  }
  if (routerName) {
    const name = routerName.toLowerCase();
    for (const [key, value] of SPLYNX_ROUTER_NAME_TO_BTS.entries()) {
      if (name.includes(key) || key.includes(name)) {
        return value;
      }
    }
  }
  return null;
}

export function getBtsRegionFromSplynx(routerId?: number, routerName?: string): string | null {
  const btsName = getBtsForSplynxRouter(routerId, routerName);
  if (!btsName) return null;
  const bts = btsStations.find((s) => s.name === btsName);
  return bts?.region || null;
}

export function updateBtsMapping(mapping: BtsSplynxMap[]) {
  SPLYNX_ROUTER_TO_BTS.clear();
  SPLYNX_ROUTER_NAME_TO_BTS.clear();
  btsSplynxMapping.length = 0;
  for (const m of mapping) {
    for (const id of m.splynxRouterIds) SPLYNX_ROUTER_TO_BTS.set(id, m.btsName);
    for (const name of m.splynxRouterNames) SPLYNX_ROUTER_NAME_TO_BTS.set(name.toLowerCase(), m.btsName);
    btsSplynxMapping.push(m);
  }
}

export function getCurrentMapping(): BtsSplynxMap[] {
  return [...btsSplynxMapping];
}

export function getAllRouterMappings(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, bts] of SPLYNX_ROUTER_TO_BTS.entries()) {
    result[String(id)] = bts;
  }
  for (const [name, bts] of SPLYNX_ROUTER_NAME_TO_BTS.entries()) {
    result[name] = bts;
  }
  return result;
}

export function autoMapRouters(routers: { id: number; name: string }[]): BtsSplynxMap[] {
  const newMappings: BtsSplynxMap[] = [];

  for (const router of routers) {
    if (SPLYNX_ROUTER_TO_BTS.has(router.id) || SPLYNX_ROUTER_NAME_TO_BTS.has(router.name.toLowerCase())) {
      continue;
    }

    // Try to match by name similarity to existing BTS stations
    const bestMatch = findBestBtsMatch(router.name);
    if (bestMatch) {
      newMappings.push({
        btsName: bestMatch,
        splynxRouterIds: [router.id],
        splynxRouterNames: [router.name],
      });
    }
  }

  return newMappings;
}

function findBestBtsMatch(routerName: string): string | null {
  const name = routerName.toLowerCase();
  let bestMatch: { name: string; score: number } | null = null;

  for (const bts of btsStations) {
    const btsName = bts.name.toLowerCase();
    const score = similarity(name, btsName);
    if (score > 0.6 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { name: bts.name, score };
    }
  }

  return bestMatch?.name || null;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;

  const wordsA = a.split(/[\s\-_]+/);
  const wordsB = b.split(/[\s\-_]+/);
  let matches = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa === wb || wa.includes(wb) || wb.includes(wa)) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(wordsA.length, wordsB.length);
}

export type { BtsSplynxMap };
