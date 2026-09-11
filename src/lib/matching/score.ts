// Pure scoring for customer ↔ UISP-endpoint matching.
//
// Base = endpoint-anchored token overlap on normalized names (normalize.ts):
// every endpoint token must be "explained" by the customer name, with
// fuzzy equality tolerating one typo (Damerau-Levenshtein ≤ 1, e.g.
// "fgh"/"fhg"). Leftover customer tokens — joint/second names, account
// labels — dilute the score at 25% each. This is Jaccard-like but
// endpoint-anchored: "RIDWAN ADEKUNLE, MR. ADISA" vs "Adisa Ridwan"
// explains 2/2 endpoint tokens → 0.89, while two different banks sharing
// only "microfinance bank" (generic-stripped) score 0.
//
// Bonuses on top: +0.1 phone, +0.1 email (UISP contact fields; null-safe —
// they land with the sync upgrade), +0.05 region agreement (endpoint tower
// region vs customer city). Capped at 1.0.

import { tokensOf } from './normalize';
import { btsStations, inferRegionFromBtsName } from '@/lib/bts-data';

export const AUTO_MATCH_THRESHOLD = 0.85;
export const CANDIDATE_THRESHOLD = 0.5;

// Mirror of bts-data.ts LOCATION_TO_BTS_REGION (city → BTS region), which
// is not exported. All its values are single-region in practice. Used to
// cross-check that the customer's city and the endpoint's tower region agree.
// EXPANDED: Added major Nigerian cities to improve region bonus coverage.
export const CITY_TO_BTS_REGION: Record<string, string> = {
  // Ibadan region
  ibadan: 'Ibadan',
  oyo: 'Ibadan',
  // Osogbo region (Osun state)
  osogbo: 'Osogbo',
  oshogbo: 'Osogbo',
  ile: 'Osogbo',
  'ile-ife': 'Osogbo',
  ife: 'Osogbo',
  'osogbo.': 'Osogbo',
  'osun-state.': 'Osogbo',
  'osogbo, osun-state.': 'Osogbo',
  // Akure region (Ondo state)
  akure: 'Akure',
  ondo: 'Akure',
  owo: 'Akure',
  // Abeokuta region
  abeokuta: 'Abeokuta',
  'abẹ́òkúta': 'Abeokuta',
  aremo: 'Abeokuta',
  ilaro: 'Abeokuta',
  'abeokuta, ogun-state.': 'Abeokuta',
  'abeokuta, ogun-state': 'Abeokuta',
  'obada-oko, abeokuta, ogun-state.': 'Abeokuta',
  'owode egba': 'Abeokuta',
  obada: 'Abeokuta',
  // Sagamu region
  sagamu: 'Sagamu',
  shagamu: 'Sagamu',
  iperu: 'Sagamu',
  'sagamu, ogun-state.': 'Sagamu',
  // Ota region
  ota: 'Ota',
  otta: 'Ota',
  'ota, ogun-state.': 'Ota',
  // Ijebu region
  ijebu: 'Ijebu',
  'ijebu ode': 'Ijebu',
  'ijebu-ode': 'Ijebu',
  'ijebu-ode, ogun-state.': 'Ijebu',
  'orile imo': 'Ijebu',
  orile: 'Ijebu',
  // Lagos region
  lagos: 'Lagos',
  ikeja: 'Lagos',
  surulere: 'Lagos',
  yaba: 'Lagos',
  lekki: 'Lagos',
  victoria: 'Lagos',
  'victoria island': 'Lagos',
  ikoyi: 'Lagos',
  mowe: 'Lagos',
  'lagos-state.': 'Lagos',
  'ibadan, ogun-state.': 'Lagos',
  // Ogun state
  'ogun state': 'Ogun',
  'ogun-state.': 'Ogun',
  // Additional cities from customer data
  'ibadan.': 'Ibadan',
  'abeokua, ogun-state': 'Abeokuta',
  'ilese ijebu,': 'Ijebu',
  'oshogbo ogun-state.': 'Osogbo',
  'oyo-state': 'Ibadan',
  'obada road, abeokuta, ogun-state': 'Abeokuta',
  'kemta idi-aba, abeokuta, ogun-st': 'Abeokuta',
  'ibadan, oyo-state.': 'Ibadan',
  'abere, osun-state.': 'Osogbo',
  'bodija ibadan, oyo-state.': 'Ibadan',
  'agege': 'Lagos',
  'ede': 'Osogbo',
  'laderin abeokuta': 'Abeokuta',
  'olokuta abeokuta': 'Abeokuta',
  // Other Nigerian states / metros
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
  // International (for completeness)
  houston: 'Unknown',
};

export function customerRegionKey(city: string | null | undefined): string | null {
  if (!city) return null;
  return CITY_TO_BTS_REGION[city.toLowerCase().trim()] ?? null;
}

/** Tower region for a station name (same lookup as bts-resolver.regionForStationName).
 *  Falls back to keyword inference from BTS name if not in static list. */
export function endpointRegionKey(btsName: string | null | undefined): string | null {
  if (!btsName) return null;
  // Keep region inference on the canonical BTS map. A second keyword table
  // here previously mapped Rockcity to Ibadan and overrode the migration.
  return inferRegionFromBtsName(btsName);
}

/** Digit-only phone key; leading country code 234 or 0 normalized away. */
export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (digits.startsWith('234')) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function emailKey(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.includes('@') ? normalized : null;
}

export interface MatchCustomer {
  name: string;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface MatchEndpoint {
  name: string;
  btsName?: string | null;
  region?: string | null;
  phone?: string | null;
  email?: string | null;
}

/**
 * Fuzzy token equality: exact, or one Damerau-Levenshtein edit
 * (substitution / adjacent transposition / one insert-delete) on tokens of
 * ≥ 3 characters. Fast two-pointer scan over the mismatch span.
 */
function fuzzyEquals(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  if (a.length !== b.length) {
    const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
    for (let i = 0; i < longer.length; i++) {
      if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true;
    }
    return false;
  }

  let i = 0;
  let j = a.length - 1;
  while (i < j && a[i] === b[i]) i++;
  while (j >= i && a[j] === b[j]) j--;
  const span = j - i + 1;
  if (span <= 1) return true; // single substitution
  return span === 2 && a[i] === b[j] && a[j] === b[i]; // adjacent transposition
}

function baseScore(customerTokens: string[], endpointTokens: string[]): number {
  if (customerTokens.length === 0 || endpointTokens.length === 0) return 0;
  const customerSet = new Set(customerTokens);
  let matched = 0;
  for (const et of endpointTokens) {
    if (customerSet.has(et)) {
      matched++;
    } else if (customerTokens.some((ct) => fuzzyEquals(ct, et))) {
      matched++;
    }
  }
  matched = Math.min(matched, customerTokens.length);
  const unmatchedCustomer = customerTokens.length - matched;
  return matched / (endpointTokens.length + 0.25 * unmatchedCustomer);
}

/**
 * Score how strongly an endpoint explains a customer (0..1, capped).
 *
 * @param customer Splynx customer row fields.
 * @param endpoint UISP endpoint site row fields; contact fields may be null
 *                 until the sync upgrade persists them.
 */
export function matchScore(customer: MatchCustomer, endpoint: MatchEndpoint): number {
  const customerTokens = tokensOf(customer.name ?? '');
  const endpointTokens = tokensOf(endpoint.name ?? '');
  let score = baseScore(customerTokens, endpointTokens);

  const endpointRegion = endpoint.region ?? endpointRegionKey(endpoint.btsName ?? null);
  const custRegion = customerRegionKey(customer.city ?? null);
  if (endpointRegion && custRegion === endpointRegion) score += 0.05;

  const custPhone = phoneKey(customer.phone ?? null);
  const epPhone = phoneKey(endpoint.phone ?? null);
  if (custPhone && epPhone && custPhone === epPhone) score += 0.1;

  const custEmail = emailKey(customer.email ?? null);
  const epEmail = emailKey(endpoint.email ?? null);
  if (custEmail && epEmail && custEmail === epEmail) score += 0.1;

  return Math.min(1, score);
}

/**
 * Strong-signal gate for AUTO-matching. A single shared surname token is not
 * enough to call two people the same person — the endpoint must carry ≥2 name
 * tokens, OR the customer and endpoint must agree on phone or email, OR there
 * is a region agreement AND the endpoint has at least 1 token (prevents pure
 * region-only matches). Without this, "RIDWAN ADEKUNLE" (Ibadan) auto-matches
 * a Lagos "ADEKUNLE" endpoint at 0.80 + 0.05 region = 0.85. Weak matches stay
 * pending for manual review.
 */
export function hasStrongSignal(customer: MatchCustomer, endpoint: MatchEndpoint): boolean {
  const endpointTokens = tokensOf(endpoint.name ?? '');
  // ≥2 tokens in endpoint name = strong signal
  if (endpointTokens.length >= 2) return true;
  // Exact phone match = strong signal
  const custPhone = phoneKey(customer.phone ?? null);
  const epPhone = phoneKey(endpoint.phone ?? null);
  if (custPhone && epPhone && custPhone === epPhone) return true;
  // Exact email match = strong signal
  const custEmail = emailKey(customer.email ?? null);
  const epEmail = emailKey(endpoint.email ?? null);
  if (custEmail && epEmail && custEmail === epEmail) return true;
  // Region agreement + at least 1 endpoint token = acceptable signal
  // (prevents pure region-only false positives)
  const endpointRegion = endpoint.region ?? endpointRegionKey(endpoint.btsName ?? null);
  const custRegion = customerRegionKey(customer.city ?? null);
  if (endpointRegion && custRegion === endpointRegion && endpointTokens.length >= 1) return true;
  return false;
}
