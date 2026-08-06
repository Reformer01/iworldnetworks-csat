import { describe, it, expect } from 'vitest';
import { parseCSV } from '../csv';
import { findBtsMatch, getStationsByRegion, SITE_ALIASES } from '../bts-data';

const ABEOKUTA_STATIONS = getStationsByRegion('Abeokuta');
const OTA_STATIONS = getStationsByRegion('Ota');
const OSOGBO_STATIONS = getStationsByRegion('Osogbo');
const IBADAN_STATIONS = getStationsByRegion('Ibadan');
const IJEBU_STATIONS = getStationsByRegion('Ijebu');

describe('parseCSV', () => {
  it('parses a simple CSV with header and rows', () => {
    const rows = parseCSV('Name,Age\nAlice,30\nBob,25');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Name: 'Alice', Age: '30' });
    expect(rows[1]).toEqual({ Name: 'Bob', Age: '25' });
  });

  it('handles a quoted field containing a newline (SAGAMU row 1 case)', () => {
    const csv =
      'S/N,Name,BTS / Sites,Status,Account Type,MRC,PLAN,,\n1,Indsutrial Platform Remo,Sagamu GRA,Active,Enterprise,"150,500.00","\nIndustrial Platform Remo",,\n2,LARL Sagamu,Sagamu GRA,Active,Enterprise,"200,000.00",LARL Sagamu,,\n';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    // The multiline quoted field must stay inside its column...
    expect(rows[0].PLAN).toContain('Industrial Platform Remo');
    expect(rows[0].MRC).toBe('150,500.00');
    // ...and the following row must still parse
    expect(rows[1].Name).toBe('LARL Sagamu');
    expect(rows[1].MRC).toBe('200,000.00');
  });

  it('pads short rows so missing trailing empty columns do not drop data', () => {
    const csv = 'S/N,Name,Plan,Extra\n1,Alice,H-Lite\n2,Bob,SME,note\n';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ 'S/N': '1', Name: 'Alice', Plan: 'H-Lite', Extra: '' });
    expect(rows[1].Extra).toBe('note');
  });

  it('strips a UTF-8 BOM from the header', () => {
    const rows = parseCSV('\uFEFFName,Age\nAlice,30');
    expect(rows[0]).toEqual({ Name: 'Alice', Age: '30' });
  });

  it('handles CRLF line endings', () => {
    const rows = parseCSV('Name,Age\r\nAlice,30\r\nBob,25\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].Name).toBe('Alice');
  });

  it('keeps commas inside quoted fields', () => {
    const rows = parseCSV('Name,Note\nAlice,"Hello, world"\nBob,plain');
    expect(rows[0].Note).toBe('Hello, world');
    expect(rows[1].Note).toBe('plain');
  });

  it('unwraps escaped quotes inside quoted fields', () => {
    const rows = parseCSV('Name,Quote\nAlice,"He said ""hi"""');
    expect(rows[0].Quote).toBe('He said "hi"');
  });

  it('skips empty rows', () => {
    const rows = parseCSV('Name,Age\nAlice,30\n\nBob,25\n\n');
    expect(rows).toHaveLength(2);
  });

  it('parses a file without a trailing newline', () => {
    const rows = parseCSV('Name,Age\nAlice,30');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ Name: 'Alice', Age: '30' });
  });

  it('trims surrounding whitespace in fields', () => {
    const rows = parseCSV('Name, Age \n Alice , 30 ');
    expect(rows[0]).toEqual({ Name: 'Alice', Age: '30' });
  });
});

describe('findBtsMatch', () => {
  it('matches a site by exact substring', () => {
    const match = findBtsMatch('Obada oko', ABEOKUTA_STATIONS);
    expect(match?.name).toBe('Obada Oko');
  });

  it('matches a brand-new station added from the master sheet (Oshoba Hill)', () => {
    const match = findBtsMatch('Oshoba Hill', ABEOKUTA_STATIONS);
    expect(match?.name).toBe('Oshoba Hill');
    expect(match?.region).toBe('Abeokuta');
  });

  it('resolves alias: Obada Ext -> Obada Extension', () => {
    const match = findBtsMatch('Obada Ext', ABEOKUTA_STATIONS);
    expect(match?.name).toBe('Obada Extension');
  });

  it('resolves alias: OTA [Office Core] -> Ota Office', () => {
    const match = findBtsMatch('OTA [Office Core]', OTA_STATIONS);
    expect(match?.name).toBe('Ota Office');
  });

  it('resolves alias: Osogbo-Core -> Osogbo Office', () => {
    const match = findBtsMatch('Osogbo-Core', OSOGBO_STATIONS);
    expect(match?.name).toBe('Osogbo Office');
  });

  it('resolves alias: NTA IBADAN -> NTA IBD', () => {
    const match = findBtsMatch('NTA IBADAN', IBADAN_STATIONS);
    expect(match?.name).toBe('NTA IBD');
  });

  it('resolves NTA satellite sites to NTA Abeokuta', () => {
    for (const site of ['Nta Ogbe', 'Nta Okegunya', 'Nta Okegunya 2']) {
      const match = findBtsMatch(site, ABEOKUTA_STATIONS);
      expect(match?.name).toBe('NTA Abeokuta');
    }
  });

  it('matches fuzzy word overlap: Ijebu-Ode GRA -> Ijebu GRA', () => {
    const match = findBtsMatch('Ijebu-Ode GRA', IJEBU_STATIONS);
    expect(match?.name).toBe('Ijebu GRA');
  });

  it('matches a station whose name is a substring of the cleaned site name', () => {
    const match = findBtsMatch('Sagamu CRC', getStationsByRegion('Sagamu'));
    expect(match?.name).toBe('CRC');
  });

  it('returns null when nothing matches', () => {
    const match = findBtsMatch('Totally Unknown Site', ABEOKUTA_STATIONS);
    expect(match).toBeNull();
  });

  it('returns null when the alias target is not in the region station list', () => {
    // 'nta ibadan' is aliased, but Ibadan stations are not in the Abeokuta list
    const match = findBtsMatch('NTA IBADAN', ABEOKUTA_STATIONS);
    expect(match).toBeNull();
  });
});

describe('SITE_ALIASES', () => {
  it('maps every alias key to a real station name', () => {
    for (const [key, target] of Object.entries(SITE_ALIASES)) {
      const found = [...ABEOKUTA_STATIONS, ...OTA_STATIONS, ...OSOGBO_STATIONS, ...IBADAN_STATIONS].find((s) => s.name === target);
      expect(found, `${key} -> ${target} has no matching station`).toBeDefined();
    }
  });
});
