import { describe, it, expect } from 'vitest';
import { salesRecordSchema, salesImportSchema, salesTargetSchema } from '../sales';

function validRecord() {
  return {
    customerName: 'John Doe',
    location: 'Abeokuta',
    planCode: 'H-Lite',
    mrc: 27500,
    nrc: 15000,
    saleDate: '2025-06-01',
    quarter: 'QUARTER 1',
    month: 'June',
    packageType: 'Outright',
    salesAgent: 'Titilade Bakare',
    meansOfSale: 'Direct',
    accountStatus: 'Active',
    statusNotes: '',
  };
}

describe('salesRecordSchema', () => {
  it('accepts a valid record', () => {
    const result = salesRecordSchema.safeParse(validRecord());
    expect(result.success).toBe(true);
  });

  it('requires customerName', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), customerName: '' });
    expect(result.success).toBe(false);
  });

  it('requires location', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), location: '' });
    expect(result.success).toBe(false);
  });

  it('coerces string mrc to number', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), mrc: '27500' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mrc).toBe(27500);
  });

  it('coerces string nrc to number', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), nrc: '15000' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nrc).toBe(15000);
  });

  it('coerces string serialNumber to number', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), serialNumber: '42' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.serialNumber).toBe(42);
  });

  it('rejects negative mrc', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), mrc: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects negative nrc', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), nrc: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid quarter', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), quarter: 'QUARTER 5' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid accountStatus', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), accountStatus: 'Unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid packageType', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), packageType: 'Monthly' });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields due to .strict()', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), extraField: 'should fail' });
    expect(result.success).toBe(false);
  });

  it('rejects derived server-side fields (region, segment)', () => {
    const result = salesRecordSchema.safeParse({ ...validRecord(), region: 'Ogun' });
    expect(result.success).toBe(false);
  });

  it('provides defaults for optional fields', () => {
    const minimal = {
      customerName: 'Jane Doe',
      location: 'Ibadan',
      planCode: 'U-Pro',
      quarter: 'QUARTER 2',
    };
    const result = salesRecordSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mrc).toBe(0);
      expect(result.data.nrc).toBe(0);
      expect(result.data.serialNumber).toBe(0);
      expect(result.data.packageType).toBe('Outright');
      expect(result.data.accountStatus).toBe('Active');
      expect(result.data.saleDate).toBe('');
      expect(result.data.month).toBe('');
    }
  });
});

describe('salesImportSchema', () => {
  it('accepts a valid import payload', () => {
    const result = salesImportSchema.safeParse({
      records: [validRecord()],
      source: 'csv_upload',
      fileName: 'sales.csv',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty records array', () => {
    const result = salesImportSchema.safeParse({ records: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-array records', () => {
    const result = salesImportSchema.safeParse({ records: 'not-an-array' });
    expect(result.success).toBe(false);
  });

  it('validates each record in the array', () => {
    const result = salesImportSchema.safeParse({
      records: [validRecord(), { ...validRecord(), customerName: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('provides defaults for source and fileName', () => {
    const result = salesImportSchema.safeParse({ records: [validRecord()] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('csv_upload');
      expect(result.data.fileName).toBe('');
    }
  });
});

describe('salesTargetSchema', () => {
  it('accepts valid target with region', () => {
    const result = salesTargetSchema.safeParse({
      month: '2025-07',
      region: 'Ogun',
      targetRevenue: 875000,
      targetCustomers: 30,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid target with agentName', () => {
    const result = salesTargetSchema.safeParse({
      month: '2025-07',
      agentName: 'Titilade Bakare',
      targetRevenue: 500000,
      targetCustomers: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid month format', () => {
    const result = salesTargetSchema.safeParse({
      month: 'July 2025',
      region: 'Ogun',
      targetRevenue: 875000,
      targetCustomers: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-existent month 13', () => {
    const result = salesTargetSchema.safeParse({
      month: '2025-13',
      region: 'Ogun',
      targetRevenue: 875000,
      targetCustomers: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid region', () => {
    const result = salesTargetSchema.safeParse({
      month: '2025-07',
      region: 'Lagos',
      targetRevenue: 875000,
      targetCustomers: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative targetRevenue', () => {
    const result = salesTargetSchema.safeParse({
      month: '2025-07',
      region: 'Ogun',
      targetRevenue: -100,
      targetCustomers: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative targetCustomers', () => {
    const result = salesTargetSchema.safeParse({
      month: '2025-07',
      region: 'Ogun',
      targetRevenue: 875000,
      targetCustomers: -5,
    });
    expect(result.success).toBe(false);
  });

  it('coerces string numbers to numeric', () => {
    const result = salesTargetSchema.safeParse({
      month: '2025-07',
      region: 'Ogun',
      targetRevenue: '875000',
      targetCustomers: '30',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetRevenue).toBe(875000);
      expect(result.data.targetCustomers).toBe(30);
    }
  });
});
