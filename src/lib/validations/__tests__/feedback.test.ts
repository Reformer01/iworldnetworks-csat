import { describe, it, expect } from 'vitest';
import { feedbackSchema } from '../feedback';

describe('feedbackSchema', () => {
  const validBase = {
    customerName: 'Samuel Oke',
    customerEmail: 'samuel@example.com',
    category: 'Reliability' as const,
    location: 'Ibadan',
    servicePlan: 'H-Pro',
  };

  it('accepts valid reliability feedback', () => {
    const result = feedbackSchema.safeParse({
      ...validBase,
      ratings: { stability: 4, latency: 3, peakPerformance: 5 },
      comment: 'Good service overall.',
      serviceDate: '2026-06-22',
      serviceDateEnd: '2026-06-25',
    });
    expect(result.success).toBe(true);
  });

  it('accepts serviceDateEnd as optional', () => {
    const result = feedbackSchema.safeParse({
      ...validBase,
      serviceDate: '2026-06-22',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serviceDateEnd).toBe('');
    }
  });

  it('rejects unknown fields due to .strict()', () => {
    const result = feedbackSchema.safeParse({
      ...validBase,
      unknownField: 'should fail',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = feedbackSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts support category with optional ratings', () => {
    const result = feedbackSchema.safeParse({
      ...validBase,
      category: 'Support',
      ratings: { professionalism: 5, fcr: 'Yes' },
    });
    expect(result.success).toBe(true);
  });

  it('coerces string ratings to numbers', () => {
    const result = feedbackSchema.safeParse({
      ...validBase,
      ratings: { stability: '4', latency: '3' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ratings?.stability).toBe(4);
    }
  });

  it('accepts testimonials with referral source', () => {
    const result = feedbackSchema.safeParse({
      ...validBase,
      category: 'Testimonials',
      referralSource: 'Friend/Colleague',
      spotlightInterview: 'Yes',
    });
    expect(result.success).toBe(true);
  });
});
