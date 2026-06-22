import { SalesAgent, RegionalTarget, SalesRegion, SalesSegment, SaleQuarter } from './sales-types';

export const salesAgents: SalesAgent[] = [
  // Ogun team
  { id: 'titilade-bakare', name: 'Titilade Bakare', region: 'Ogun', annualTarget: 4725000, annualCustomerTarget: 124, quarterlyRevenueTarget: { 'Q1': 1181250, 'Q2': 1181250, 'Q3': 1181250, 'Q4': 1181250 }, quarterlyCustomerTarget: { 'Q1': 31, 'Q2': 31, 'Q3': 31, 'Q4': 31 }, isActive: true },
  { id: 'henry-adiene', name: 'Henry Adiene', region: 'Ogun', annualTarget: 1575000, annualCustomerTarget: 40, quarterlyRevenueTarget: { 'Q1': 393750, 'Q2': 393750, 'Q3': 393750, 'Q4': 393750 }, quarterlyCustomerTarget: { 'Q1': 10, 'Q2': 10, 'Q3': 10, 'Q4': 10 }, isActive: true },
  { id: 'janet-oke', name: 'Janet Oke', region: 'Ogun', annualTarget: 4200000, annualCustomerTarget: 115, quarterlyRevenueTarget: { 'Q1': 1050000, 'Q2': 1050000, 'Q3': 1050000, 'Q4': 1050000 }, quarterlyCustomerTarget: { 'Q1': 29, 'Q2': 29, 'Q3': 29, 'Q4': 29 }, isActive: true },
  // Oyo team
  { id: 'jeffery-udoji', name: 'Jeffery Udoji', region: 'Oyo', annualTarget: 7350000, annualCustomerTarget: 117, quarterlyRevenueTarget: { 'Q1': 1837500, 'Q2': 1837500, 'Q3': 1837500, 'Q4': 1837500 }, quarterlyCustomerTarget: { 'Q1': 29, 'Q2': 29, 'Q3': 29, 'Q4': 29 }, isActive: true },
  { id: 'racheal-tumo', name: 'Racheal Tumo', region: 'Oyo', annualTarget: 3150000, annualCustomerTarget: 15, quarterlyRevenueTarget: { 'Q1': 787500, 'Q2': 787500, 'Q3': 787500, 'Q4': 787500 }, quarterlyCustomerTarget: { 'Q1': 4, 'Q2': 4, 'Q3': 4, 'Q4': 4 }, isActive: true },
  // Osun team
  { id: 'emmanuel-oladimeji', name: 'Emmanuel Oladimeji', region: 'Osun', annualTarget: 3150000, annualCustomerTarget: 75, quarterlyRevenueTarget: { 'Q1': 787500, 'Q2': 787500, 'Q3': 787500, 'Q4': 787500 }, quarterlyCustomerTarget: { 'Q1': 19, 'Q2': 19, 'Q3': 19, 'Q4': 19 }, isActive: true },
  { id: 'elizabeth-tola', name: 'Elizabeth Tola', region: 'Osun', annualTarget: 1350000, annualCustomerTarget: 21, quarterlyRevenueTarget: { 'Q1': 337500, 'Q2': 337500, 'Q3': 337500, 'Q4': 337500 }, quarterlyCustomerTarget: { 'Q1': 5, 'Q2': 5, 'Q3': 5, 'Q4': 5 }, isActive: true },
  // Ondo team
  { id: 'kikachukwu-omordia', name: 'Kikachukwu Omordia', region: 'Ondo', annualTarget: 3150000, annualCustomerTarget: 69, quarterlyRevenueTarget: { 'Q1': 787500, 'Q2': 787500, 'Q3': 787500, 'Q4': 787500 }, quarterlyCustomerTarget: { 'Q1': 17, 'Q2': 17, 'Q3': 17, 'Q4': 17 }, isActive: true },
  { id: 'ruth-suleimon', name: 'Ruth Suleimon', region: 'Ondo', annualTarget: 1350000, annualCustomerTarget: 27, quarterlyRevenueTarget: { 'Q1': 337500, 'Q2': 337500, 'Q3': 337500, 'Q4': 337500 }, quarterlyCustomerTarget: { 'Q1': 7, 'Q2': 7, 'Q3': 7, 'Q4': 7 }, isActive: true },
];

export const regionalTargets: RegionalTarget[] = [
  { region: 'Ogun', targetPercentage: 35, annualRevenueTarget: 10500000, annualCustomerTarget: 350, monthlyTarget: 875000 },
  { region: 'Oyo', targetPercentage: 35, annualRevenueTarget: 10500000, annualCustomerTarget: 350, monthlyTarget: 875000 },
  { region: 'Osun', targetPercentage: 15, annualRevenueTarget: 4500000, annualCustomerTarget: 150, monthlyTarget: 375000 },
  { region: 'Ondo', targetPercentage: 15, annualRevenueTarget: 4500000, annualCustomerTarget: 150, monthlyTarget: 375000 },
];

export const totalAnnualTarget = 30000000;
export const totalCustomerTarget = 1000;

export const locations = [
  { name: 'Ibadan', region: 'Oyo' as const },
  { name: 'Abeokuta', region: 'Ogun' as const },
  { name: 'Akure', region: 'Ondo' as const },
  { name: 'Osogbo', region: 'Osun' as const },
  { name: 'Mowe', region: 'Oyo' as const },
  { name: 'Ibo', region: 'Oyo' as const },
  { name: 'Lagos', region: 'Oyo' as const },
  { name: 'Shagamu', region: 'Ogun' as const },
  { name: 'Ota', region: 'Ogun' as const },
  { name: 'Ijebu Ode', region: 'Ogun' as const },
  { name: 'Orile Imo', region: 'Ogun' as const },
  { name: 'Orile', region: 'Ogun' as const },
  { name: 'Sagamu', region: 'Ogun' as const },
  { name: 'Oriye', region: 'Oyo' as const },
];

export const planCodes = [
  { code: 'H-Lite', label: 'H-Lite', segment: 'HOME' as const },
  { code: 'H-Pro', label: 'H-Pro', segment: 'HOME' as const },
  { code: 'H-Max', label: 'H-Max', segment: 'HOME' as const },
  { code: 'U-Lite', label: 'U-Lite', segment: 'SME' as const },
  { code: 'U-Pro', label: 'U-Pro', segment: 'SME' as const },
  { code: 'U-Max', label: 'U-Max', segment: 'SME' as const },
  { code: '5Mbps', label: '5 Mbps', segment: 'ENTERPRISE' as const },
  { code: '10Mbps', label: '10 Mbps', segment: 'ENTERPRISE' as const },
  { code: '20Mbps', label: '20 Mbps', segment: 'ENTERPRISE' as const },
  { code: '30Mbps', label: '30 Mbps', segment: 'ENTERPRISE' as const },
  { code: '50Mbps', label: '50 Mbps', segment: 'ENTERPRISE' as const },
  { code: '100Mbps', label: '100 Mbps', segment: 'ENTERPRISE' as const },
];

export const planPricing: Record<string, { mrc: number }> = {
  'H-Lite': { mrc: 27500 },
  'H-Max':  { mrc: 36500 },
  'H-Pro':  { mrc: 43500 },
  'U-Lite': { mrc: 32500 },
  'U-Max':  { mrc: 43500 },
  'U-Pro':  { mrc: 58000 },
};

export function getPlanMrc(planCode: string): number | null {
  return planPricing[planCode]?.mrc ?? null;
}

export function getRegionForLocation(location: string): SalesRegion {
  const loc = location.toLowerCase().trim();
  const ibadanCities = ['ibadan', 'oriye', 'mowe', 'ibo', 'lagos'];
  const ogunCities = ['abeokuta', 'shagamu', 'ota', 'ijebu ode', 'orile imo', 'orile', 'sagamu'];
  const osunCities = ['oshogbo', 'osogbo'];
  const ondoCities = ['akure'];

  if (ondoCities.some(c => loc.includes(c))) return 'Ondo';
  if (osunCities.some(c => loc.includes(c))) return 'Osun';
  if (ogunCities.some(c => loc.includes(c))) return 'Ogun';
  if (ibadanCities.some(c => loc.includes(c))) return 'Oyo';
  return 'Ogun';
}

export function getSegmentForPlan(planCode: string): SalesSegment {
  const code = planCode.toUpperCase();
  if (code.startsWith('H-')) return 'HOME';
  if (code.startsWith('U-')) return 'SME';
  return 'ENTERPRISE';
}

export function parseNairaAmount(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/^[₦Nn\s,#]+/, '').trim();
  const match = cleaned.match(/^[\d,]+(\.\d+)?/);
  if (!match) return 0;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

export function getQuarterFromMonth(month: string): SaleQuarter {
  const m = month.toLowerCase();
  if (['june', 'july', 'august'].includes(m)) return 'QUARTER 1';
  if (['september', 'october', 'november'].includes(m)) return 'QUARTER 2';
  if (['december', 'january', 'february'].includes(m)) return 'QUARTER 3';
  return 'QUARTER 4';
}

export function getMonthsForQuarter(quarter: SaleQuarter): string[] {
  const map: Record<SaleQuarter, string[]> = {
    'QUARTER 1': ['June', 'July', 'August'],
    'QUARTER 2': ['September', 'October', 'November'],
    'QUARTER 3': ['December', 'January', 'February'],
    'QUARTER 4': ['March', 'April', 'May'],
  };
  return map[quarter];
}
