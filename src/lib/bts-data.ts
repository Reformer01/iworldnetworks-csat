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
export const SITE_ALIASES = {
  'obada ext': 'Obada Extension',
  'ota [office core]': 'Ota Office',
  'osogbo-core': 'Osogbo Office',
  'nta ibadan': 'NTA IBD',
  // NTA satellite transmitter sites roll up into the NTA Abeokuta station
  'nta ogbe': 'NTA Abeokuta',
  'nta okegunya': 'NTA Abeokuta',
  'nta okegunya 2': 'NTA Abeokuta',
  // Lagos city mislabel → Ota per Aug 27 decision (no Lagos BTS exists)
  lagos: 'Ota Office',
  'lagos island': 'Ota Office',
} satisfies Record<string, string>;

const LOCATION_TO_BTS_REGION = {
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
  // NOTE: lagos/mowe/ibo/oriye are NOT Ibadan-region towns. Unmapped = no
  // BTS suggestion from location, which is safer than a wrong Ibadan tower.
} satisfies Record<string, string[]>;

export const CITY_TO_REGION = {
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
  // lagos is Lagos state, mowe is Ogun state; ibo/oriye are unknown towns.
  lagos: 'Lagos',
  mowe: 'Ogun',
  ikeja: 'Lagos',
  surulere: 'Lagos',
  yaba: 'Lagos',
  lekki: 'Lagos',
  victoria: 'Lagos',
  'victoria island': 'Lagos',
  ikoyi: 'Lagos',
  ondo: 'Ondo',
  ilorin: 'Kwara',
  kano: 'Kano',
  kaduna: 'Kaduna',
  port: 'Rivers',
  'port harcourt': 'Rivers',
  ph: 'Rivers',
  abuja: 'FCT',
  benin: 'Edo',
  'benin city': 'Edo',
  warri: 'Delta',
  asaba: 'Delta',
  awka: 'Anambra',
  onitsha: 'Anambra',
  enugu: 'Enugu',
  owerri: 'Imo',
  calabar: 'Cross River',
} satisfies Record<string, string>;

/** Region keywords for inferring region from BTS/site name when not in static list. */
export const REGION_KEYWORDS: Array<{ keyword: string; region: string }> = [
  { keyword: 'ibadan', region: 'Ibadan' },
  { keyword: 'osogbo', region: 'Osogbo' },
  { keyword: 'oshogbo', region: 'Osogbo' },
  { keyword: 'akure', region: 'Akure' },
  { keyword: 'abeokuta', region: 'Abeokuta' },
  { keyword: 'sagamu', region: 'Sagamu' },
  { keyword: 'shagamu', region: 'Sagamu' },
  { keyword: 'ota', region: 'Ota' },
  { keyword: 'ijebu', region: 'Ijebu' },
  { keyword: 'lagos', region: 'Lagos' },
  { keyword: 'ikeja', region: 'Lagos' },
  { keyword: 'surulere', region: 'Lagos' },
  { keyword: 'yaba', region: 'Lagos' },
  { keyword: 'lekki', region: 'Lagos' },
  { keyword: 'victoria', region: 'Lagos' },
  { keyword: 'ikoyi', region: 'Lagos' },
  { keyword: 'mowe', region: 'Ogun' },
  { keyword: 'ondo', region: 'Akure' },
  { keyword: 'ilorin', region: 'Kwara' },
  { keyword: 'kano', region: 'Kano' },
  { keyword: 'kaduna', region: 'Kaduna' },
  { keyword: 'port', region: 'Rivers' },
  { keyword: 'abuja', region: 'FCT' },
  { keyword: 'benin', region: 'Edo' },
  { keyword: 'warri', region: 'Delta' },
  { keyword: 'asaba', region: 'Delta' },
  { keyword: 'awka', region: 'Anambra' },
  { keyword: 'onitsha', region: 'Anambra' },
  { keyword: 'enugu', region: 'Enugu' },
  { keyword: 'owerri', region: 'Imo' },
  { keyword: 'calabar', region: 'Cross River' },
  // Additional BTS name keywords from unknown sites
  { keyword: 'ison', region: 'Ibadan' },
  { keyword: 'ewang', region: 'Ibadan' },
  { keyword: 'oley', region: 'Ibadan' },
  { keyword: 'dominion', region: 'Ibadan' },
  { keyword: 'rockcity', region: 'Abeokuta' },
  { keyword: 'city of knowledge', region: 'Ibadan' },
  { keyword: 'obada oko', region: 'Abeokuta' },
  { keyword: 'ode-omu', region: 'Osogbo' },
  { keyword: 'bolorunduro', region: 'Akure' },
  { keyword: 'splash', region: 'Lagos' },
  { keyword: 'oloke', region: 'Ibadan' },
  { keyword: 'cfmc', region: 'Ibadan' },
  { keyword: 'ikija', region: 'Ibadan' },
  { keyword: 'laderin', region: 'Ibadan' },
  { keyword: 'lifeforte', region: 'Ibadan' },
  { keyword: 'elega', region: 'Abeokuta' },
  { keyword: 'main access', region: 'Ibadan' },
  { keyword: 'pentagon', region: 'Ibadan' },
  { keyword: 'moniya', region: 'Ibadan' },
  { keyword: 'ogbc', region: 'Abeokuta' },
  { keyword: 'positive fm', region: 'Akure' },
  { keyword: 'akarigbo', region: 'Sagamu' },
  { keyword: 'oshoba', region: 'Ijebu' },
  { keyword: 'miliki', region: 'Ijebu' },
  { keyword: 'magboro', region: 'Lagos' },
  { keyword: 'ologuneru', region: 'Ibadan' },
  { keyword: 'iwn-lg', region: 'Lagos' },
  { keyword: 'jericho', region: 'Ibadan' },
  { keyword: 'ait', region: 'Ota' },
  { keyword: 'alagbado', region: 'Ota' },
  { keyword: 'splashnet', region: 'Lagos' },
  { keyword: 'obada oko extension', region: 'Abeokuta' },
  { keyword: 'rack center', region: 'Lagos' },
  { keyword: 'space fm', region: 'Ibadan' },
  { keyword: 'nta abk', region: 'Abeokuta' },
  { keyword: 'ivd', region: 'Ibadan' },
  { keyword: 'paramount', region: 'Ibadan' },
  { keyword: 'potoki', region: 'Ibadan' },
  { keyword: 'glow ijapo', region: 'Akure' },
  { keyword: 'rockcity local', region: 'Abeokuta' },
  { keyword: 'alagbaka', region: 'Akure' },
  { keyword: 'honor', region: 'Ibadan' },
  { keyword: 'cuab', region: 'Abeokuta' },
  { keyword: 'impact', region: 'Ibadan' },
  { keyword: 'main access', region: 'Ibadan' },
  { keyword: 'omida', region: 'Abeokuta' },
];

/** Infer region from BTS/site name using keyword matching. */
export function inferRegionFromBtsName(btsName: string | null | undefined): string | null {
  if (!btsName) return null;
  const normalized = btsName.toLowerCase().trim();
  const station = btsStations.find((candidate) => candidate.name.toLowerCase() === normalized);
  if (station) return station.region;
  for (const { keyword, region } of REGION_KEYWORDS) {
    if (normalized.includes(keyword)) return region;
  }
  return null;
}

export function getBtsForLocation(location: string): BtsStation[] {
  const key = location.toLowerCase().trim();
  const btsRegions = (LOCATION_TO_BTS_REGION as Record<string, string[]>)[key];
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

export function getStationsByRegion(region: string) {
  return btsStations.filter((s) => s.region === region);
}

export function findBtsMatch(siteName: string, regionStations: BtsStation[]): { name: string; region: string } | null {
  const normalized = siteName.toLowerCase().trim();

  // 0. Explicit alias mapping first (handles names fuzzy matching cannot resolve)
  const aliasTarget = (SITE_ALIASES as Record<string, string>)[normalized];
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
