// Pure name normalization for customer ↔ UISP-endpoint matching.
//
// Deterministic string math only (no imports). Billing-side names carry
// noise this strips once, at the matching boundary: titles, bracket
// annotations ("[Office Core]"), generic business words ("microfinance
// bank" must never make two DIFFERENT banks match), and "Last, First"
// order. Token sets are order-independent afterwards.

const TITLES = [
  'mr', 'mrs', 'miss', 'ms', 'dr', 'engr', 'prof', 'chief',
  'alh', 'alhaji', 'haj', 'hajia', 'sir', 'deacon', 'pastor', 'evang',
];

const GENERIC_WORDS = [
  // Business suffixes/descriptors shared across unrelated orgs.
  'bank', 'microfinance', 'mfb', 'ltd', 'limited', 'plc', 'co', 'company',
  'inc', 'incorporated', 'enterprise', 'enterprises', 'services', 'group',
  'network', 'networks', 'technologies', 'technology', 'nigeria', 'nig',
  // Location/tower words the legacy resolver also strips (bts-resolver.ts).
  'bts', 'core', 'office', 'fm',
];

const TITLE_RE = new RegExp(`\\b(${TITLES.join('|')})\\b`, 'g');
const GENERIC_RE = new RegExp(`\\b(${GENERIC_WORDS.join('|')})\\b`, 'g');

function stripWords(s: string, re: RegExp): string {
  return s.replace(re, ' ');
}

/** "Last, First" → "First Last" when the name has exactly one comma. */
function reverseLastNameFirst(s: string): string {
  const comma = s.indexOf(',');
  if (comma === -1 || s.indexOf(',', comma + 1) !== -1) return s;
  const last = s.slice(0, comma).trim();
  const first = s.slice(comma + 1).trim();
  if (!last || !first) return s;
  return `${first} ${last}`;
}

export function normalizeName(name: string): string {
  let s = (name ?? '').toLowerCase();
  s = s.replace(/\[[^\]]*\]/g, ' '); // strip [bracket annotations]
  s = stripWords(s, TITLE_RE);
  s = reverseLastNameFirst(s); // titles moved to the front, strip again
  s = stripWords(s, TITLE_RE);
  s = stripWords(s, GENERIC_RE);
  s = s.replace(/[^a-z0-9\s]/g, ' '); // punctuation → space
  return s.replace(/\s+/g, ' ').trim();
}

// Deterministic per-name memoization: runMatching scores every customer
// against every endpoint, and the same names recur thousands of times.
const tokenCache = new Map<string, string[]>();

/**
 * Normalized distinct tokens of a name. Tokens must be > 2 characters,
 * non-numeric, and never a title.
 */
export function tokensOf(name: string): string[] {
  const key = name ?? '';
  const cached = tokenCache.get(key);
  if (cached) return cached;
  const tokens = normalizeName(key)
    .split(' ')
    .filter((t) => t.length > 2 && !/^\d+$/.test(t) && !TITLES.includes(t));
  tokenCache.set(key, tokens);
  return tokens;
}