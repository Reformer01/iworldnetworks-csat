import { describe, it, expect } from 'vitest';
import { ticketSchema } from '../ticket';

describe('ticketSchema', () => {
  const validBaseData = {
    customerName: 'John Doe',
    customerPhone: '+2348012345678',
    location: 'Abeokuta',
    region: 'Ogun' as const,
    complaintType: 'No Connectivity' as const,
    description: 'Customer reports no internet connectivity',
    createdBy: 'Victoria Fokorede',
  };

  it('validates complete ticket data', () => {
    const result = ticketSchema.parse(validBaseData);
    expect(result.customerName).toBe('John Doe');
    expect(result.complaintType).toBe('No Connectivity');
    expect(result.status).toBe('open');
  });

  it('requires customer name', () => {
    const invalidData = { ...validBaseData, customerName: '' };
    expect(() => ticketSchema.parse(invalidData)).toThrow();
  });

  it('requires valid phone number', () => {
    const invalidData = { ...validBaseData, customerPhone: '' };
    expect(() => ticketSchema.parse(invalidData)).toThrow();
  });

  it('requires location', () => {
    const invalidData = { ...validBaseData, location: '' };
    expect(() => ticketSchema.parse(invalidData)).toThrow();
  });

  it('requires region', () => {
    const invalidData = { ...validBaseData, region: undefined };
    expect(() => ticketSchema.parse(invalidData)).toThrow();
  });

  it('requires complaint type', () => {
    const invalidData = { ...validBaseData, complaintType: undefined };
    expect(() => ticketSchema.parse(invalidData)).toThrow();
  });

  it('requires minimum description length', () => {
    const invalidData = { ...validBaseData, description: 'Short' };
    expect(() => ticketSchema.parse(invalidData)).toThrow();
  });

  it('requires creator', () => {
    const invalidData = { ...validBaseData, createdBy: '' };
    expect(() => ticketSchema.parse(invalidData)).toThrow();
  });

  it('validates optional fields', () => {
    const minimalValidData = {
      customerName: 'Test User',
      customerPhone: '+1234567890',
      location: 'Test Location',
      region: 'Ogun' as const,
      complaintType: 'No Connectivity' as const,
      description: 'Test issue description that is long enough',
      createdBy: 'Test User',
      customerEmail: 'test@example.com',
      assignedTo: 'John Doe',
    };
    const result = ticketSchema.parse(minimalValidData);
    expect(result.customerEmail).toBe('test@example.com');
    expect(result.assignedTo).toBe('John Doe');
    expect(result.status).toBe('open');
  });
});
