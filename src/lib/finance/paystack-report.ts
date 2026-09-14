export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type CsvRow = (string | number | null | undefined)[];

export function buildCsv(headers: string[], rows: CsvRow[]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

export interface ReportTransactionRow {
  reference: string;
  customer?: string | null;
  customerEmail?: string | null;
  amountNaira: number;
  channel?: string | null;
  status: string;
  paidAt?: string | null;
}

export interface ReportReconciliationRow {
  paystackReference: string;
  splynxLedgerId?: string | null;
  method?: string | null;
  confidence?: number | null;
  paystackAmountNaira?: number | null;
  splynxAmountNaira?: number | null;
  varianceNaira?: number | null;
  status: string;
}

export interface ReportExceptionRow {
  id: string;
  kind: string;
  paystackReference?: string | null;
  title: string;
  amountNaira?: number | null;
  ownerEmail?: string | null;
  status: string;
  followUpAt?: string | null;
}

export interface ReportCustomerRow {
  email: string | null;
  name: string;
  lifetimeNaira: number;
  frequency: number;
  lastPaidAt?: string | null;
  region?: string | null;
  segment?: string | null;
  status: string;
}

const TRANSACTION_HEADERS = ['reference', 'customer', 'email', 'amountNaira', 'channel', 'status', 'paidAt'];
const RECONCILIATION_HEADERS = [
  'paystackReference',
  'splynxLedgerId',
  'method',
  'confidence',
  'paystackAmountNaira',
  'splynxAmountNaira',
  'varianceNaira',
  'status',
];
const EXCEPTION_HEADERS = ['id', 'kind', 'paystackReference', 'title', 'amountNaira', 'ownerEmail', 'status', 'followUpAt'];
const CUSTOMER_HEADERS = ['email', 'name', 'lifetimeNaira', 'frequency', 'lastPaidAt', 'region', 'segment', 'status'];

export function buildTransactionsCsv(rows: ReportTransactionRow[]): string {
  return buildCsv(
    TRANSACTION_HEADERS,
    rows.map((row) => [
      row.reference,
      row.customer ?? '',
      row.customerEmail ?? '',
      row.amountNaira,
      row.channel ?? '',
      row.status,
      row.paidAt ?? '',
    ]),
  );
}

export function buildReconciliationCsv(rows: ReportReconciliationRow[]): string {
  return buildCsv(
    RECONCILIATION_HEADERS,
    rows.map((row) => [
      row.paystackReference,
      row.splynxLedgerId ?? '',
      row.method ?? '',
      row.confidence ?? '',
      row.paystackAmountNaira ?? '',
      row.splynxAmountNaira ?? '',
      row.varianceNaira ?? '',
      row.status,
    ]),
  );
}

export function buildExceptionsCsv(rows: ReportExceptionRow[]): string {
  return buildCsv(
    EXCEPTION_HEADERS,
    rows.map((row) => [
      row.id,
      row.kind,
      row.paystackReference ?? '',
      row.title,
      row.amountNaira ?? '',
      row.ownerEmail ?? '',
      row.status,
      row.followUpAt ?? '',
    ]),
  );
}

export function buildCustomersCsv(rows: ReportCustomerRow[]): string {
  return buildCsv(
    CUSTOMER_HEADERS,
    rows.map((row) => [
      row.email ?? '',
      row.name,
      row.lifetimeNaira,
      row.frequency,
      row.lastPaidAt ?? '',
      row.region ?? '',
      row.segment ?? '',
      row.status,
    ]),
  );
}

export interface SnapshotChannelTotal {
  channel: string;
  collectedNaira: number;
  count: number;
}

export interface SnapshotRegionTotal {
  region: string;
  collectedNaira: number;
  count: number;
}

export interface SnapshotSegmentTotal {
  segment: string;
  collectedNaira: number;
  count: number;
}

export interface MonthlySnapshotInput {
  month: string;
  totals: {
    collectedNaira: number;
    successCount: number;
    successRate: number;
    unmatchedNaira: number;
    refundedNaira: number;
    disputeCount: number;
  };
  channels: SnapshotChannelTotal[];
  regions: SnapshotRegionTotal[];
  segments: SnapshotSegmentTotal[];
  reconciliation: Record<string, number>;
  exceptions: Record<string, number>;
}

export interface MonthlySnapshotPayload {
  totals: MonthlySnapshotInput['totals'];
  channels: SnapshotChannelTotal[];
  regions: SnapshotRegionTotal[];
  segments: SnapshotSegmentTotal[];
  reconciliation: Record<string, number>;
  exceptions: Record<string, number>;
}

export function buildMonthlySnapshotPayload(input: MonthlySnapshotInput): MonthlySnapshotPayload {
  return {
    totals: { ...input.totals },
    channels: input.channels.map((c) => ({ ...c })),
    regions: input.regions.map((r) => ({ ...r })),
    segments: input.segments.map((s) => ({ ...s })),
    reconciliation: { ...input.reconciliation },
    exceptions: { ...input.exceptions },
  };
}

export interface PdfTable {
  title: string;
  head: string[];
  body: (string | number)[][];
}

export function buildOverviewPdfTables(input: {
  month: string;
  totals: MonthlySnapshotInput['totals'];
  channels: SnapshotChannelTotal[];
}): PdfTable[] {
  return [
    {
      title: `Overview — ${input.month}`,
      head: ['Metric', 'Value'],
      body: [
        ['Collected (NGN)', input.totals.collectedNaira],
        ['Successful transactions', input.totals.successCount],
        ['Success rate (%)', input.totals.successRate],
        ['Unmatched (NGN)', input.totals.unmatchedNaira],
        ['Refunded (NGN)', input.totals.refundedNaira],
        ['Disputes', input.totals.disputeCount],
      ],
    },
    {
      title: 'Channel summary',
      head: ['Channel', 'Collected (NGN)', 'Count'],
      body: input.channels.map((c) => [c.channel, c.collectedNaira, c.count]),
    },
  ];
}

export function buildReconciliationPdfTables(counts: Record<string, number>): PdfTable[] {
  return [
    {
      title: 'Reconciliation summary',
      head: ['Queue', 'Count'],
      body: Object.entries(counts).map(([queue, count]) => [queue, count]),
    },
  ];
}

export function buildCustomersPdfTables(rows: ReportCustomerRow[]): PdfTable[] {
  return [
    {
      title: 'Customer summary',
      head: ['Customer', 'Lifetime (NGN)', 'Payments', 'Status'],
      body: rows.map((row) => [row.name || row.email || '', row.lifetimeNaira, row.frequency, row.status]),
    },
  ];
}

export function buildSnapshotPdfTables(snapshot: { month: string; totals: MonthlySnapshotInput['totals'] }): PdfTable[] {
  return [
    {
      title: `Monthly snapshot — ${snapshot.month}`,
      head: ['Metric', 'Value'],
      body: [
        ['Collected (NGN)', snapshot.totals.collectedNaira],
        ['Successful transactions', snapshot.totals.successCount],
        ['Success rate (%)', snapshot.totals.successRate],
        ['Unmatched (NGN)', snapshot.totals.unmatchedNaira],
        ['Refunded (NGN)', snapshot.totals.refundedNaira],
        ['Disputes', snapshot.totals.disputeCount],
      ],
    },
  ];
}
