import { describe, it, expect } from 'vitest';
import { normMac, parseCsvLine, acceptsAddressMatch } from '../deviceResolve';

describe('normMac', () => {
  it('strips separators and uppercases', () => {
    expect(normMac('60:22:32:be:4f:ee')).toBe('602232BE4FEE');
    expect(normMac('60-22-32-BE-4F-EE')).toBe('602232BE4FEE');
    expect(normMac('602232be4fee')).toBe('602232BE4FEE');
  });

  it('handles empty and already-clean input', () => {
    expect(normMac('')).toBe('');
    expect(normMac('ABCDEF')).toBe('ABCDEF');
  });
});

describe('acceptsAddressMatch', () => {
  it('rejects weak address overlap', () => {
    expect(acceptsAddressMatch(2, 0)).toBe(false);
    expect(acceptsAddressMatch(0, 0)).toBe(false);
  });

  it('accepts a landslide regardless of tie', () => {
    expect(acceptsAddressMatch(6, 6)).toBe(true);
    expect(acceptsAddressMatch(9, 8)).toBe(true);
  });

  it('accepts a dominant margin of 2+', () => {
    expect(acceptsAddressMatch(4, 2)).toBe(true);
    expect(acceptsAddressMatch(5, 3)).toBe(true);
  });

  it('rejects near-ties without name signal', () => {
    expect(acceptsAddressMatch(4, 3)).toBe(false);
    expect(acceptsAddressMatch(5, 5)).toBe(false);
    expect(acceptsAddressMatch(3, 3)).toBe(false);
  });

  it('accepts an address tie broken decisively by name score', () => {
    expect(acceptsAddressMatch(5, 5, 0.5, 0.1)).toBe(true);
    expect(acceptsAddressMatch(4, 4, 0.8, 0.4)).toBe(true);
  });

  it('rejects an address tie with a weak name edge', () => {
    expect(acceptsAddressMatch(5, 5, 0.5, 0.3)).toBe(false);
    expect(acceptsAddressMatch(4, 4, 0.3, 0.1)).toBe(false);
  });
});

describe('parseCsvLine', () => {
  it('splits plain cells', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps commas inside quoted cells', () => {
    expect(parseCsvLine('"No.9, Kobomoje Street",Ibadan,x')).toEqual(['No.9, Kobomoje Street', 'Ibadan', 'x']);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsvLine('"say ""hi""",x')).toEqual(['say "hi"', 'x']);
  });

  it('preserves trailing empty cell (the Assigned BTS column)', () => {
    expect(parseCsvLine('1194,Name,,,')).toEqual(['1194', 'Name', '', '', '']);
  });
});
