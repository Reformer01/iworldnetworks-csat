import { describe, it, expect } from 'vitest';
import {
  classifyPlan,
  calcTax,
  calcBalance,
  calcDiscounts,
  formatDiscountRemark,
  pickState,
  pickDiscountPercent,
  pickDateAddedMs,
  buildIncomeRow,
  deriveDiscountAmount,
  deriveDiscountRemark,
  buildMirrorIncomeRow,
  kindOfRow,
  matchesChannel,
  matchesSearch,
  applyRowFilters,
  summarize,
  monthBoundsUTC,
  dayRangeBoundsUTC,
  INCOME_CSV_HEADERS,
  buildIncomeCsv,
  type IncomeRow,
} from '../income-report';

const START = Date.UTC(2026, 7, 1);
const END = Date.UTC(2026, 8, 1) - 1;

function baseRow(over: Partial<IncomeRow> = {}): IncomeRow {
  return {
    date: '2026-08-05',
    customer: 'Gloria Oyesiku',
    email: 'gloria@x.ng',
    reference: 'PSK-001',
    amount: 27500,
    enterprise: 0,
    isNew: 1,
    residential: 27500,
    sme: 0,
    discounts: 4125,
    others: 0,
    tax: 2062.5,
    balance: 25437.5,
    region: 'Lagos',
    remark: '15%',
    note: '',
    isPrepay: false,
    ...over,
  };
}

describe('discount math', () => {
  it('computes 27500 × 15% = 4125 with full plan value in the bucket', () => {
    const row = buildIncomeRow({
      ms: Date.UTC(2026, 7, 5),
      amount: 27500,
      plan: 'H-Pro',
      category: 'person',
      customerName: 'Gloria Oyesiku',
      email: 'gloria@x.ng',
      reference: 'PSK-001',
      note: '',
      state: 'Lagos',
      discountPercent: 15,
      splynxDateAdded: Date.UTC(2026, 7, 3),
      start: START,
      end: END,
      isPrepay: false,
    });
    expect(row.residential).toBe(27500);
    expect(row.discounts).toBe(4125);
    expect(row.remark).toBe('15%');
    expect(row.tax).toBe(2062.5);
    expect(row.balance).toBe(25437.5);
  });

  it('0% discount yields 0 + empty remark', () => {
    expect(calcDiscounts(27500, 0)).toBe(0);
    expect(formatDiscountRemark(0)).toBe('');
    const row = buildIncomeRow({
      ms: Date.UTC(2026, 7, 5),
      amount: 27500,
      plan: 'H-Pro',
      category: 'person',
      customerName: 'A',
      email: 'a@x.ng',
      reference: 'R',
      note: '',
      state: 'Lagos',
      discountPercent: 0,
      splynxDateAdded: null,
      start: START,
      end: END,
      isPrepay: false,
    });
    expect(row.discounts).toBe(0);
    expect(row.remark).toBe('');
  });
});

describe('remark formatting', () => {
  it('trims trailing zeros: 15 not 15.0', () => {
    expect(formatDiscountRemark(15)).toBe('15%');
    expect(formatDiscountRemark(15.0)).toBe('15%');
    expect(formatDiscountRemark(7.5)).toBe('7.5%');
    expect(formatDiscountRemark(NaN)).toBe('');
    expect(formatDiscountRemark(-3)).toBe('');
  });
});

describe('region is state only', () => {
  it('uses state verbatim and never falls back to city', () => {
    // city is not even an input to the row builder — state flows straight through
    expect(pickState({ city: 'Ikeja' })).toBe('');
    expect(pickState({ city: 'Ikeja', state: 'Lagos' })).toBe('Lagos');
    expect(pickState({ province: 'Oyo' })).toBe('Oyo');
    expect(pickState({ customer_state: '  Kano ' })).toBe('Kano');
    expect(pickState({ region: 'Rivers' })).toBe('Rivers');
    expect(pickState({})).toBe('');
  });

  it('row region is the state, blank when missing', () => {
    const row = buildIncomeRow({
      ms: Date.UTC(2026, 7, 5),
      amount: 1000,
      plan: 'H-Pro',
      category: 'person',
      customerName: 'A',
      email: 'a@x.ng',
      reference: 'R',
      note: '',
      state: null,
      discountPercent: 0,
      splynxDateAdded: null,
      start: START,
      end: END,
      isPrepay: false,
    });
    expect(row.region).toBe('');
  });

  it('truncates state to 191 chars', () => {
    expect(pickState({ state: 'x'.repeat(300) })).toHaveLength(191);
  });
});

describe('discount picker', () => {
  it('takes the first finite number across aliases and clamps 0–100', () => {
    expect(pickDiscountPercent({ discount: 15 })).toBe(15);
    expect(pickDiscountPercent({ discount_percent: '10' })).toBe(10);
    expect(pickDiscountPercent({ discountPercent: 7.5 })).toBe(7.5);
    expect(pickDiscountPercent({ customer_discount: '15%' })).toBe(15);
    expect(pickDiscountPercent({ discount: 150 })).toBe(100);
    expect(pickDiscountPercent({ discount: -5 })).toBe(0);
    expect(pickDiscountPercent({})).toBeNull();
    expect(pickDiscountPercent({ discount: 'abc' })).toBeNull();
  });
});

describe('date-added picker', () => {
  const parse = (v: string | undefined | null) => (v ? Date.parse(`${v.replace(' ', 'T')}Z`) : null);
  it('parses the first available key, null when unparseable', () => {
    expect(pickDateAddedMs({ date_added: '2026-08-03 10:00:00' }, parse)).toBe(Date.UTC(2026, 7, 3, 10));
    expect(pickDateAddedMs({ created_at: '2026-08-03 10:00:00' }, parse)).toBe(Date.UTC(2026, 7, 3, 10));
    expect(pickDateAddedMs({ date_added: 'not-a-date' }, parse)).toBeNull();
    expect(pickDateAddedMs({}, parse)).toBeNull();
  });
});

describe('New flag via splynxDateAdded boundaries', () => {
  const input = {
    ms: Date.UTC(2026, 7, 5),
    amount: 1000,
    plan: 'H-Pro',
    category: 'person',
    customerName: 'A',
    email: 'a@x.ng',
    reference: 'R',
    note: '',
    state: 'Lagos',
    discountPercent: 0,
    start: START,
    end: END,
    isPrepay: false,
  };
  it('is inclusive on both window edges', () => {
    expect(buildIncomeRow({ ...input, splynxDateAdded: START }).isNew).toBe(1);
    expect(buildIncomeRow({ ...input, splynxDateAdded: END }).isNew).toBe(1);
    expect(buildIncomeRow({ ...input, splynxDateAdded: START - 1 }).isNew).toBe(0);
    expect(buildIncomeRow({ ...input, splynxDateAdded: END + 1 }).isNew).toBe(0);
    expect(buildIncomeRow({ ...input, splynxDateAdded: null }).isNew).toBe(0);
  });
});

describe('Others bucketing', () => {
  it('puts the amount in Others when no plan bucket applies', () => {
    const row = buildIncomeRow({
      ms: Date.UTC(2026, 7, 5),
      amount: 30000,
      plan: '',
      category: '',
      customerName: 'Cash Walker',
      email: '',
      reference: 'INV-9',
      note: 'walk-in',
      state: '',
      discountPercent: 0,
      splynxDateAdded: null,
      start: START,
      end: END,
      isPrepay: false,
    });
    expect(classifyPlan('', '')).toBe('other');
    expect(row.others).toBe(30000);
    expect(row.residential).toBe(0);
    expect(row.sme).toBe(0);
    expect(row.enterprise).toBe(0);
    expect(kindOfRow(row)).toBe('other');
  });
});

describe('tax / balance', () => {
  it('tax is 7.5% of paid, balance is paid − tax', () => {
    expect(calcTax(27500)).toBe(2062.5);
    expect(calcBalance(27500)).toBe(25437.5);
  });
});

describe('filters', () => {
  const rows = [
    baseRow(),
    baseRow({
      customer: 'SME Co',
      email: 's@sme.ng',
      reference: 'BNK-002',
      amount: 15000,
      residential: 0,
      sme: 15000,
      discounts: 0,
      remark: '',
      region: 'Oyo',
      isNew: 0,
      tax: 1125,
      balance: 13875,
    }),
    baseRow({
      customer: 'Cash Walker',
      email: '',
      reference: 'INV-9',
      amount: 30000,
      residential: 0,
      enterprise: 0,
      others: 30000,
      discounts: 0,
      remark: '',
      region: '',
      isNew: 0,
      tax: 2250,
      balance: 27750,
    }),
  ];
  it('region is an exact match', () => {
    expect(applyRowFilters(rows, { region: 'Oyo', segment: '__all', channel: '__all', search: '' })).toHaveLength(1);
  });
  it('segment derives from buckets', () => {
    expect(applyRowFilters(rows, { region: '__all', segment: 'other', channel: '__all', search: '' })[0].customer).toBe('Cash Walker');
    expect(applyRowFilters(rows, { region: '__all', segment: 'sme', channel: '__all', search: '' })[0].customer).toBe('SME Co');
  });
  it('search matches customer/email/reference case-insensitively', () => {
    expect(matchesSearch(rows[0], 'gloria')).toBe(true);
    expect(matchesSearch(rows[1], 'BNK-002')).toBe(true);
    expect(matchesSearch(rows[1], 's@sme.ng')).toBe(true);
    expect(matchesSearch(rows[2], 'gloria')).toBe(false);
  });
  it('channel matches reference/payment-type text', () => {
    expect(matchesChannel('PSK-001', 'Paystack', 'paystack')).toBe(true);
    expect(matchesChannel('BNK-002', 'bank transfer', 'BANK')).toBe(true);
    expect(matchesChannel('BNK-002', 'bank transfer', 'cash')).toBe(false);
    expect(matchesChannel('x', 'y', '__all')).toBe(true);
  });
});

describe('summary', () => {
  it('totals discounts and others', () => {
    const s = summarize([baseRow(), baseRow({ discounts: 0, others: 30000, amount: 30000, residential: 0, tax: 2250, balance: 27750 })]);
    expect(s.discounts).toBe(4125);
    expect(s.others).toBe(30000);
    expect(s.transactions).toBe(2);
    expect(s.newSubscribers).toBe(2);
  });
});

describe('date windows', () => {
  it('month bounds cover the full UTC month', () => {
    expect(monthBoundsUTC('2026-08')).toEqual({ start: Date.UTC(2026, 7, 1), end: Date.UTC(2026, 8, 1) - 1 });
  });
  it('from/to bounds are inclusive whole days', () => {
    expect(dayRangeBoundsUTC('2026-08-01', '2026-08-06')).toEqual({
      start: Date.UTC(2026, 7, 1),
      end: Date.UTC(2026, 7, 6) + 86_400_000 - 1,
    });
    expect(dayRangeBoundsUTC('2026-08-06', '2026-08-01')).toBeNull();
    expect(dayRangeBoundsUTC('nope', '2026-08-01')).toBeNull();
  });
});

describe('CSV', () => {
  it('headers are the exact 16 in canonical order', () => {
    expect([...INCOME_CSV_HEADERS]).toEqual([
      'Date',
      'Customer',
      'Email',
      'Reference',
      'Amount Paid',
      'Enterprise',
      'New',
      'Residential Internet',
      'SME Internet',
      'Discounts',
      'Others',
      'Tax',
      'Balance',
      'Region',
      'Remark',
      'Note',
    ]);
  });
  it('emits raw numbers with proper quoting', () => {
    const csv = buildIncomeCsv([baseRow({ customer: 'Oya, "Ltd"', amount: 27500 })]);
    const [head, line] = csv.split('\n');
    expect(head).toBe([...INCOME_CSV_HEADERS].join(','));
    expect(line).toContain('"Oya, ""Ltd"""');
    expect(line).toContain('"27500"');
    expect(line).not.toContain('₦');
  });
  it('row keys follow the canonical order', () => {
    expect(Object.keys(baseRow())).toEqual([
      'date',
      'customer',
      'email',
      'reference',
      'amount',
      'enterprise',
      'isNew',
      'residential',
      'sme',
      'discounts',
      'others',
      'tax',
      'balance',
      'region',
      'remark',
      'note',
      'isPrepay',
    ]);
  });
});

describe('subdivision state map', () => {
  const osun = new Map([[30, 'Osun']]);
  it('30 → Osun via subdivision_id (numeric + string)', () => {
    expect(pickState({ subdivision_id: 30 }, osun)).toBe('Osun');
    expect(pickState({ subdivision_id: '30' }, osun)).toBe('Osun');
  });
  it('unknown → fallback text, empty when none', () => {
    expect(pickState({ subdivision_id: 999, state: 'Lagos' }, osun)).toBe('Lagos');
    expect(pickState({ subdivision_id: 999 }, osun)).toBe('');
    expect(pickState({ city: 'Ikeja' }, osun)).toBe('');
  });
  it('map wins over stale text', () => {
    expect(pickState({ subdivision_id: 30, state: 'Lagos' }, osun)).toBe('Osun');
  });
});

describe('discount derivation (invoice − paid)', () => {
  it('27500 − 23951.61 = 3548.39', () => {
    expect(deriveDiscountAmount(23951.61, 27500)).toBe(3548.39);
  });
  it('27500 − 23375 = 4125 with 15% remark', () => {
    expect(deriveDiscountAmount(23375, 27500)).toBe(4125);
    expect(deriveDiscountRemark(4125, 27500)).toBe('15%');
  });
  it('no invoice or no discount → 0 + empty remark', () => {
    expect(deriveDiscountAmount(15000, null)).toBe(0);
    expect(deriveDiscountAmount(15000, 15000)).toBe(0);
    expect(deriveDiscountRemark(0, 27500)).toBe('');
  });
  it('mirror row buckets the FULL plan value', () => {
    const row = buildMirrorIncomeRow({
      ms: Date.UTC(2026, 7, 5),
      paidAmount: 23375,
      invoiceTotal: 27500,
      plan: 'U-Pro',
      category: 'retail',
      customerName: 'SME Co',
      email: 's@sme.ng',
      reference: 'PSK-001',
      note: '',
      state: 'Osun',
      splynxDateAdded: Date.UTC(2026, 7, 3),
      start: START,
      end: END,
      isPrepay: false,
    });
    expect(row.amount).toBe(23375);
    expect(row.sme).toBe(27500);
    expect(row.discounts).toBe(4125);
    expect(row.remark).toBe('15%');
    expect(row.region).toBe('Osun');
  });
  it('Others holds paid with 0 discount', () => {
    const row = buildMirrorIncomeRow({
      ms: Date.UTC(2026, 7, 5),
      paidAmount: 30000,
      invoiceTotal: 35000,
      plan: '',
      category: '',
      customerName: 'Cash Walker',
      email: '',
      reference: 'INV-9',
      note: '',
      state: '',
      splynxDateAdded: null,
      start: START,
      end: END,
      isPrepay: false,
    });
    expect(row.others).toBe(30000);
    expect(row.discounts).toBe(0);
    expect(row.remark).toBe('');
  });
});
