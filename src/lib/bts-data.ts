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
  { id: 24, name: 'Ota Estate', region: 'Ota', host: 'Mr. David Cooker' },
  { id: 25, name: 'Syayis', region: 'Ota', host: 'Syayis Hotel' },
  { id: 26, name: 'AIT', region: 'Ota', host: 'African Independent Television' },
  { id: 27, name: 'Ota Office', region: 'Ota', host: '' },
  { id: 28, name: 'Sagamu GRA', region: 'Sagamu', host: 'Conference Hotel Sagamu' },
  { id: 29, name: 'CRC', region: 'Sagamu', host: 'Thames Valley College' },
  { id: 30, name: 'Akarigbo', region: 'Sagamu', host: 'Akarigbo Palace Sagamu' },
  { id: 31, name: 'Sagamu Extension', region: 'Sagamu', host: 'Mr. Akeem Oriyomi (Own his mast)' },
  { id: 32, name: 'Potoki', region: 'Sagamu', host: 'NA' },
  { id: 33, name: 'Pentagon', region: 'Sagamu', host: '' },
  { id: 34, name: 'Magboro', region: 'Sagamu', host: 'Pearl School Magboro' },
  { id: 35, name: 'Odogbolu', region: 'Ijebu', host: 'Ijebu Ode Anglican Diocese' },
  { id: 36, name: 'Ijebu GRA', region: 'Ijebu', host: 'Conference Hotel Ijebu Ode' },
  { id: 37, name: 'NTA Ijebu', region: 'Ijebu', host: 'Nigerian Television Authority' },
  { id: 38, name: 'Ilamo', region: 'Ijebu', host: '' },
  { id: 39, name: 'CKA', region: 'Ijebu', host: '' },
  { id: 40, name: 'Omida Office', region: 'Abeokuta', host: '' },
  { id: 41, name: 'NTA Abeokuta', region: 'Abeokuta', host: '' },
  { id: 42, name: 'Rockcity', region: 'Abeokuta', host: '' },
  { id: 43, name: 'Elega', region: 'Abeokuta', host: '' },
  { id: 44, name: 'Ikija', region: 'Abeokuta', host: '' },
  { id: 45, name: 'Ewang', region: 'Abeokuta', host: '' },
  { id: 46, name: 'IVD', region: 'Abeokuta', host: '' },
  { id: 47, name: 'Paramount', region: 'Abeokuta', host: '' },
  { id: 48, name: 'Laderin', region: 'Abeokuta', host: '' },
  { id: 49, name: 'Osoba', region: 'Abeokuta', host: '' },
  { id: 50, name: 'Oloke', region: 'Abeokuta', host: '' },
  { id: 51, name: 'CUAB', region: 'Abeokuta', host: '' },
  { id: 52, name: 'CFMC', region: 'Abeokuta', host: '' },
  { id: 53, name: 'Obada Oko', region: 'Abeokuta', host: '' },
  { id: 54, name: 'Obada Extension', region: 'Abeokuta', host: '' },
  { id: 55, name: 'Miliki', region: 'Abeokuta', host: '' },
  { id: 56, name: 'OGBC', region: 'Abeokuta', host: '' },
];

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
