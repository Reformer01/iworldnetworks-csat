import type { BtsStation } from './sales-types';

export const btsStations: BtsStation[] = [
  { id: 1, name: 'Sijuwola House', region: 'Ibadan', host: 'NA' },
  { id: 2, name: 'Dominion', region: 'Ibadan', host: 'Host FM' },
  { id: 3, name: 'Space', region: 'Ibadan', host: 'Space FM' },
  { id: 4, name: 'Splash', region: 'Ibadan', host: 'Splash FM' },
  { id: 6, name: 'NTA IBD', region: 'Ibadan', host: 'NTA Ibadan' },
  { id: 7, name: 'Honor', region: 'Ibadan', host: 'Honor FM' },
  { id: 8, name: 'Oleyo', region: 'Ibadan', host: 'NA' },
  { id: 9, name: 'Ologuneru', region: 'Ibadan', host: 'St. John of the Cross Carmelite community' },
  { id: 10, name: 'Jericho', region: 'Ibadan', host: 'Lead City School' },
  { id: 11, name: 'Impact', region: 'Ibadan', host: 'Impact FM' },
  { id: 12, name: 'Moniya', region: 'Ibadan', host: 'Amuludun Radio Nigeria' },
  { id: 13, name: 'OSBC', region: 'Osogbo', host: 'Osun Broadcasting Cooperation' },
  { id: 14, name: 'NTA Osogbo', region: 'Osogbo', host: 'NTA Osogbo' },
  { id: 15, name: 'Rave', region: 'Osogbo', host: 'Rave FM' },
  { id: 16, name: 'Osogbo Office', region: 'Osogbo', host: 'NA' },
  { id: 17, name: 'Odeomu', region: 'Osogbo', host: 'NA' },
  { id: 18, name: 'OSRC', region: 'Akure', host: 'Ondo State Radio Cooperation' },
  { id: 19, name: 'Akure Office', region: 'Akure', host: 'NA' },
  { id: 20, name: 'Positive', region: 'Akure', host: 'Positive FM' },
  { id: 21, name: 'Glow', region: 'Akure', host: 'NA' },
  { id: 22, name: 'Alagbaka Extension', region: 'Akure', host: '' },
  { id: 23, name: 'Bolorunduro', region: 'Akure', host: '' },
  { id: 24, name: 'Breeze', region: 'Akure', host: 'Breeze 91.9FM' },
  { id: 25, name: 'Ota Estate', region: 'Ota', host: 'Mr. David Cooker' },
  { id: 26, name: 'Syayis', region: 'Ota', host: 'Syayis Hotel' },
  { id: 27, name: 'AIT', region: 'Ota', host: 'African Independent Television' },
  { id: 28, name: 'Ota Office', region: 'Ota', host: '' },
  { id: 29, name: 'Miliki BTS', region: 'Ota', host: 'Miliki FM' },
  { id: 30, name: 'Sagamu GRA', region: 'Sagamu', host: 'Conference Hotel Sagamu' },
  { id: 31, name: 'CRC', region: 'Sagamu', host: 'Thames Valley College' },
  { id: 32, name: 'Akarigbo', region: 'Sagamu', host: 'Akarigbo Palace Sagamu' },
  { id: 33, name: 'Sagamu Extension', region: 'Sagamu', host: 'Mr. Akeem Oriyomi (Own his mast)' },
  { id: 34, name: 'Potoki', region: 'Sagamu', host: 'NA' },
  { id: 35, name: 'Pentagon', region: 'Sagamu', host: '' },
  { id: 36, name: 'Magboro', region: 'Sagamu', host: 'Pearl School Magboro' },
  { id: 37, name: 'Odogbolu', region: 'Ijebu', host: 'Ijebu Ode Anglican Diocese' },
  { id: 38, name: 'Ijebu GRA', region: 'Ijebu', host: 'Conference Hotel Ijebu Ode' },
  { id: 39, name: 'NTA Ijebu', region: 'Ijebu', host: 'Nigerian Television Authority' },
  { id: 40, name: 'Ilamo', region: 'Ijebu', host: '' },
  { id: 41, name: 'CKA', region: 'Ijebu', host: '' },
  { id: 42, name: 'Omida Office', region: 'Abeokuta', host: '' },
  { id: 43, name: 'NTA Abeokuta', region: 'Abeokuta', host: '' },
  { id: 44, name: 'Rockcity', region: 'Abeokuta', host: '' },
  { id: 45, name: 'Elega', region: 'Abeokuta', host: '' },
  { id: 46, name: 'Ikija', region: 'Abeokuta', host: '' },
  { id: 47, name: 'Ewang', region: 'Abeokuta', host: '' },
  { id: 48, name: 'IVD', region: 'Abeokuta', host: '' },
  { id: 49, name: 'Paramount', region: 'Abeokuta', host: '' },
  { id: 50, name: 'Laderin', region: 'Abeokuta', host: '' },
  { id: 51, name: 'Osoba', region: 'Abeokuta', host: '' },
  { id: 52, name: 'Oloke', region: 'Abeokuta', host: '' },
  { id: 53, name: 'CUAB', region: 'Abeokuta', host: '' },
  { id: 54, name: 'CFMC', region: 'Abeokuta', host: '' },
  { id: 55, name: 'Obada Oko', region: 'Abeokuta', host: '' },
  { id: 56, name: 'Obada Extension', region: 'Abeokuta', host: '' },
  { id: 57, name: 'Miliki', region: 'Abeokuta', host: '' },
  { id: 58, name: 'OGBC', region: 'Abeokuta', host: '' },
  { id: 59, name: 'Oshoba Hill', region: 'Abeokuta', host: '' },
];

/**
 * Explicit aliases for site names that fuzzy matching cannot resolve.
 * Keys are the lowercase site names exactly as they appear in the source CSVs.
 */
export const SITE_ALIASES: Record<string, string> = {
  'obada ext': 'Obada Extension',
  'ota [office core]': 'Ota Office',
  'osogbo-core': 'Osogbo Office',
  'nta ibadan': 'NTA IBD',
  // NTA satellite transmitter sites roll up into the NTA Abeokuta station
  'nta ogbe': 'NTA Abeokuta',
  'nta okegunya': 'NTA Abeokuta',
  'nta okegunya 2': 'NTA Abeokuta',
};

const LOCATION_TO_BTS_REGION: Record<string, string[]> = {
  ibadan: ['Ibadan'],
  oyo: ['Ibadan'],
  osogbo: ['Osogbo'],
  oshogbo: ['Osogbo'],
  akure: ['Akure'],
  abeokuta: ['Abeokuta'],
  sagamu: ['Sagamu'],
  shagamu: ['Sagamu'],
  ota: ['Ota'],
  ijebu: ['Ijebu'],
  'ijebu ode': ['Ijebu'],
  'orile imo': ['Ijebu'],
  orile: ['Ijebu'],
  mowe: ['Ibadan'],
  ibo: ['Ibadan'],
  lagos: ['Ibadan'],
  oriye: ['Ibadan'],
};

export const CITY_TO_REGION: Record<string, string> = {
  ibadan: 'Oyo',
  abeokuta: 'Ogun',
  sagamu: 'Ogun',
  shagamu: 'Ogun',
  ota: 'Ogun',
  ijebu: 'Ogun',
  'ijebu ode': 'Ogun',
  'orile imo': 'Ogun',
  orile: 'Ogun',
  osogbo: 'Osun',
  oshogbo: 'Osun',
  akure: 'Ondo',
  mowe: 'Oyo',
  ibo: 'Oyo',
  lagos: 'Oyo',
  oriye: 'Oyo',
};

export function getBtsForLocation(location: string): BtsStation[] {
  const key = location.toLowerCase().trim();
  const btsRegions = LOCATION_TO_BTS_REGION[key];
  if (btsRegions) {
    return btsStations.filter((b) => btsRegions.includes(b.region));
  }
  return [];
}

export function getBtsByRegion(region: string): BtsStation[] {
  return btsStations.filter((b) => b.region === region);
}

export function getRegionsFromBts(): string[] {
  return [...new Set(btsStations.map((b) => b.region))];
}

export const BTS_REGIONS = ['Ibadan', 'Abeokuta', 'Ijebu', 'Osogbo', 'Sagamu', 'Akure', 'Ota'] as const;
export type BtsImportRegion = (typeof BTS_REGIONS)[number];

export function isBtsRegion(value: string): value is BtsImportRegion {
  return BTS_REGIONS.includes(value as BtsImportRegion);
}

export function getStationsByRegion(region: string) {
  return btsStations.filter((s) => s.region === region);
}

export function findBtsMatch(siteName: string, regionStations: BtsStation[]): { name: string; region: string } | null {
  const normalized = siteName.toLowerCase().trim();

  // 0. Explicit alias mapping first (handles names fuzzy matching cannot resolve)
  const aliasTarget = SITE_ALIASES[normalized];
  if (aliasTarget) {
    const aliasStation = regionStations.find((bts) => bts.name === aliasTarget);
    if (aliasStation) {
      return { name: aliasStation.name, region: aliasStation.region };
    }
  }

  // Remove common suffixes/prefixes and brackets for better matching
  const cleaned = normalized
    .replace(/\[[^\]]*\]/g, '') // Remove [brackets] like [Office Core], [Alagbado]
    .replace(/\b(bts|core|office|fm)\b/g, '') // Remove common words
    .replace(/[\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Exact substring match on cleaned name
  for (const bts of regionStations) {
    if (cleaned.includes(bts.name.toLowerCase())) {
      return { name: bts.name, region: bts.region };
    }
  }

  // 2. Exact substring match on original normalized name
  for (const bts of regionStations) {
    if (normalized.includes(bts.name.toLowerCase())) {
      return { name: bts.name, region: bts.region };
    }
  }

  // 3. Word-based fuzzy matching on cleaned name
  for (const bts of regionStations) {
    const btsWords = bts.name.toLowerCase().split(/[\s-/]+/);
    const siteWords = cleaned.split(/[\s-/]+/);
    const matchCount = btsWords.filter((w) => siteWords.includes(w)).length;
    if (matchCount >= Math.min(btsWords.length, 3)) {
      return { name: bts.name, region: bts.region };
    }
    if (matchCount >= 2 && matchCount === btsWords.length) {
      return { name: bts.name, region: bts.region };
    }
  }

  // 4. Word-based fuzzy matching on original normalized name
  for (const bts of regionStations) {
    const btsWords = bts.name.toLowerCase().split(/[\s-/]+/);
    const siteWords = normalized.split(/[\s-/]+/);
    const matchCount = btsWords.filter((w) => siteWords.includes(w)).length;
    if (matchCount >= Math.min(btsWords.length, 3)) {
      return { name: bts.name, region: bts.region };
    }
    if (matchCount >= 2 && matchCount === btsWords.length) {
      return { name: bts.name, region: bts.region };
    }
  }

  return null;
}
